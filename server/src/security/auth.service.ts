import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, scryptSync, timingSafeEqual } from 'crypto';
import { MemoryStore } from '../domain/memory.store';
import { WeChatAuthAdapter } from '../integrations/wechat.adapters';
import { encryptField, maskSensitive } from './field-crypto';

type Claims = { sub: string; role: string; exp: number };

const ROLE_NAMES = new Set(['admin', 'pharmacist', 'fulfillment', 'sales', 'member', 'consumer']);

function encode(value: unknown) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function decode<T>(value: string) { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T; }

@Injectable()
export class AuthService {
  constructor(private readonly store: MemoryStore, private readonly wechat: WeChatAuthAdapter) {}

  private secret() { return process.env.AUTH_SECRET || 'development-auth-secret-change-me'; }

  private roleName(value: unknown) {
    const role = String(value || '').trim().toLowerCase();
    return ROLE_NAMES.has(role) ? role : null;
  }

  private configuredStaffAccounts() {
    try {
      const accounts = JSON.parse(process.env.STAFF_ACCOUNTS_JSON || '[]');
      return Array.isArray(accounts) ? accounts : [];
    } catch {
      return [];
    }
  }

  /**
   * Resolve the role from current server state. A signed token is only an
   * identity proof; it must not preserve a role after member approval or a
   * staff account change.
   */
  private currentRole(subject: string) {
    if (subject.startsWith('staff:')) {
      const username = subject.slice('staff:'.length);
      const account = this.configuredStaffAccounts().find((item: any) => item?.username === username);
      if (account?.active === false) return null;
      return this.roleName(account?.role);
    }
    if (subject.startsWith('dev-staff:')) {
      if (process.env.NODE_ENV === 'production') return null;
      const username = subject.slice('dev-staff:'.length);
      const role: Record<string, string> = { admin: 'admin', pharmacist: 'pharmacist', fulfillment: 'fulfillment' };
      return this.roleName(role[username]);
    }
    const user: any = this.store.state.users.find((item: any) => String(item.id) === subject);
    return this.roleName(user?.role);
  }

  sign(userId: string, role: string, expiresInSeconds = 7200) {
    const header = encode({ alg: 'HS256', typ: 'JZ' });
    const payload = encode({ sub: userId, role, exp: Math.floor(Date.now() / 1000) + expiresInSeconds });
    const body = `${header}.${payload}`;
    const signature = createHmac('sha256', this.secret()).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  verify(token?: string) {
    if (!token) return null;
    try {
      const [header, payload, signature] = token.split('.');
      const body = `${header}.${payload}`;
      const expected = createHmac('sha256', this.secret()).update(body).digest('base64url');
      if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
      const tokenHeader = decode<{ alg?: string; typ?: string }>(header);
      if (tokenHeader.alg !== 'HS256' || tokenHeader.typ !== 'JZ') return null;
      const claims = decode<Claims>(payload);
      if (!claims.sub || claims.exp < Math.floor(Date.now() / 1000)) return null;
      const role = this.currentRole(String(claims.sub));
      if (!role) return null;
      return { id: String(claims.sub), role };
    } catch { return null; }
  }

  async login(input: { code?: string; phone?: string }) {
    if (process.env.NODE_ENV === 'production' && !input.code) throw new UnauthorizedException('缺少微信登录凭证');
    if (process.env.NODE_ENV === 'production' && input.phone) throw new UnauthorizedException('请使用微信手机号授权绑定');
    const session = input.code ? await this.wechat.login(input.code) : { openId: 'demo-openid', sessionKey: 'demo-session' };
    const openId = session.openId;
    let user = this.store.state.users.find((item) => item.openId === openId);
    if (!user) {
      const phone = process.env.NODE_ENV !== 'production' && input.phone && /^1\d{10}$/.test(String(input.phone)) ? String(input.phone) : '';
      user = { id: this.store.newId('user'), openId, nickname: '微信用户', phoneMasked: phone ? maskSensitive(phone, 3, 4) : '', phoneCiphertext: phone ? encryptField(phone) : '', role: 'CONSUMER', memberLevel: 'ORDINARY' };
      this.store.state.users.push(user);
    }
    if (process.env.NODE_ENV !== 'production' && input.phone && /^1\d{10}$/.test(String(input.phone)) && !user.phoneMasked) {
      user.phoneMasked = maskSensitive(String(input.phone), 3, 4);
      user.phoneCiphertext = encryptField(String(input.phone));
    }
    const token = this.sign(String(user.id), String(user.role).toLowerCase());
    return { token, expiresIn: 7200, openId, user: { id: user.id, nickname: user.nickname, phone: user.phoneMasked || user.phone, role: user.role, memberLevel: user.memberLevel } };
  }

  async bindPhone(input: { phone?: string; code?: string }, actor: { id: string; role: string }) {
    const user: any = this.store.state.users.find((item) => item.id === actor.id);
    if (!user) throw new UnauthorizedException('用户不存在');
    if (process.env.NODE_ENV === 'production' && !input.code) throw new UnauthorizedException('缺少微信手机号授权码');
    const phone = process.env.NODE_ENV === 'production'
      ? await this.wechat.getPhoneNumber(String(input.code || ''))
      : String(input.phone || '');
    if (!/^1\d{10}$/.test(phone)) throw new UnauthorizedException('手机号授权信息不完整');
    user.phoneCiphertext = encryptField(phone);
    user.phoneMasked = maskSensitive(phone, 3, 4);
    this.store.addAudit(actor.id, actor.role, 'profile.phone.bind', 'user', actor.id);
    return { user: { id: user.id, nickname: user.nickname, phone: user.phoneMasked, role: user.role, memberLevel: user.memberLevel }, bound: true };
  }

  staffLogin(input: { username?: string; password?: string }) {
    let accounts: Array<{ username: string; passwordHash: string; role: string }> = [];
    try { accounts = JSON.parse(process.env.STAFF_ACCOUNTS_JSON || '[]'); } catch { throw new UnauthorizedException('账号配置不可用'); }
    if (!Array.isArray(accounts)) throw new UnauthorizedException('账号配置不可用');
    if (accounts.length === 0 && process.env.NODE_ENV !== 'production') {
      const developmentAccounts: Record<string, { password: string; role: string }> = {
        admin: { password: process.env.DEV_ADMIN_PASSWORD || 'admin123', role: 'admin' },
        pharmacist: { password: process.env.DEV_PHARMACIST_PASSWORD || 'pharmacist123', role: 'pharmacist' },
        fulfillment: { password: process.env.DEV_FULFILLMENT_PASSWORD || 'fulfillment123', role: 'fulfillment' }
      };
      const developmentAccount = developmentAccounts[String(input.username || '').trim()];
      if (developmentAccount && input.password === developmentAccount.password) return { token: this.sign(`dev-staff:${input.username}`, developmentAccount.role), expiresIn: 7200, user: { username: input.username, role: developmentAccount.role } };
    }
    const account = accounts.find((item) => item.username === input.username && ['admin', 'pharmacist', 'fulfillment'].includes(item.role));
    if (!account || !input.password) throw new UnauthorizedException('账号或密码错误');
    const [salt, expectedHex] = account.passwordHash.split(':');
    if (!salt || !expectedHex || !/^[a-f0-9]{128}$/i.test(expectedHex)) throw new UnauthorizedException('账号或密码错误');
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = scryptSync(input.password, salt, expected.length);
    if (!timingSafeEqual(actual, expected)) throw new UnauthorizedException('账号或密码错误');
    return { token: this.sign(`staff:${account.username}`, account.role), expiresIn: 7200, user: { username: account.username, role: account.role } };
  }
}
