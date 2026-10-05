import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createSign, createVerify, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { PaymentProvider, WeChatAuthProvider } from './contracts';

function configured(...keys: string[]) { return keys.every((key) => Boolean(process.env[key])); }
function apiV3Key() {
  const key = Buffer.from(process.env.WECHAT_API_V3_KEY || '', 'utf8');
  if (key.length !== 32) throw new BadRequestException('支付通知密钥配置不正确');
  return key;
}

@Injectable()
export class WeChatAuthAdapter implements WeChatAuthProvider {
  readonly mode = configured('WECHAT_APPID', 'WECHAT_SECRET') ? 'real' as const : 'manual' as const;

  async login(code: string) {
    if (this.mode === 'manual') {
      if (process.env.NODE_ENV === 'production') throw new UnauthorizedException('未配置微信登录凭证');
      return { openId: `wx:${code}`, sessionKey: 'demo-session' };
    }
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', process.env.WECHAT_APPID!);
    url.searchParams.set('secret', process.env.WECHAT_SECRET!);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');
    const response = await fetch(url);
    const body = await response.json() as { openid?: string; session_key?: string; unionid?: string; errcode?: number; errmsg?: string };
    if (!response.ok || body.errcode || !body.openid || !body.session_key) throw new UnauthorizedException('微信登录失败，请稍后重试');
    return { openId: body.openid, sessionKey: body.session_key, unionId: body.unionid };
  }

  async getPhoneNumber(code: string) {
    if (this.mode === 'manual') throw new UnauthorizedException('微信手机号授权未配置');
    const tokenUrl = new URL('https://api.weixin.qq.com/cgi-bin/token');
    tokenUrl.searchParams.set('grant_type', 'client_credential');
    tokenUrl.searchParams.set('appid', process.env.WECHAT_APPID!);
    tokenUrl.searchParams.set('secret', process.env.WECHAT_SECRET!);
    const tokenResponse = await fetch(tokenUrl);
    const tokenBody = await tokenResponse.json() as { access_token?: string; errcode?: number; errmsg?: string };
    if (!tokenResponse.ok || tokenBody.errcode || !tokenBody.access_token) throw new UnauthorizedException('微信授权令牌获取失败，请稍后重试');
    const response = await fetch(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(tokenBody.access_token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    const body = await response.json() as { errcode?: number; errmsg?: string; phone_info?: { phoneNumber?: string } };
    if (!response.ok || body.errcode || !body.phone_info?.phoneNumber) throw new UnauthorizedException('微信手机号授权失败，请重新授权');
    return body.phone_info.phoneNumber;
  }
}

@Injectable()
export class WeChatPaymentAdapter implements PaymentProvider {
  readonly mode = configured('WECHAT_MCHID', 'WECHAT_SERIAL_NO', 'WECHAT_PRIVATE_KEY_PATH', 'WECHAT_API_V3_KEY') ? 'real' as const : 'manual' as const;

  private privateKey() {
    try { return readFileSync(process.env.WECHAT_PRIVATE_KEY_PATH!, 'utf8'); } catch { throw new Error('微信支付私钥配置不可用'); }
  }
  private platformCertificate() {
    try { return readFileSync(process.env.WECHAT_PLATFORM_CERT_PATH!, 'utf8'); } catch { throw new Error('微信支付平台证书配置不可用'); }
  }
  private sign(method: string, path: string, body: string, timestamp: string, nonce: string) {
    const signer = createSign('RSA-SHA256');
    signer.update(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`);
    return signer.sign(this.privateKey(), 'base64');
  }
  private authorization(method: string, path: string, body: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString('hex');
    const signature = this.sign(method, path, body, timestamp, nonce);
    const token = `WECHATPAY2-SHA256-RSA2048 mchid="${process.env.WECHAT_MCHID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${process.env.WECHAT_SERIAL_NO}",signature="${signature}"`;
    return { Authorization: token, timestamp, nonce };
  }
  private async post(path: string, payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    const headers = this.authorization('POST', path, body);
    const response = await fetch(`https://api.mch.weixin.qq.com${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error('微信支付服务暂不可用');
    return result;
  }

  async createJsapiOrder(input: { orderNo: string; description: string; amountFen: number; openId: string; notifyUrl: string }) {
    if (this.mode === 'manual') return { mode: this.mode as 'manual' };
    if (!Number.isInteger(input.amountFen) || input.amountFen <= 0) throw new BadRequestException('支付金额不合法');
    if (!input.openId || !/^https:\/\//i.test(input.notifyUrl)) throw new BadRequestException('支付用户或回调地址不合法');
    const result = await this.post('/v3/pay/transactions/jsapi', { appid: process.env.WECHAT_APPID, mchid: process.env.WECHAT_MCHID, description: input.description, out_trade_no: input.orderNo, notify_url: input.notifyUrl, amount: { total: input.amountFen, currency: 'CNY' }, payer: { openid: input.openId } });
    if (!result.prepay_id) throw new Error('微信支付未返回预支付编号');
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = randomBytes(16).toString('hex');
    const packageValue = `prepay_id=${result.prepay_id}`;
    const signer = createSign('RSA-SHA256');
    signer.update(`${process.env.WECHAT_APPID}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`);
    return { mode: this.mode as 'real', prepayId: String(result.prepay_id), timeStamp, nonceStr, packageValue, signType: 'RSA', paySign: signer.sign(this.privateKey(), 'base64') };
  }

  verifyNotification(input: { timestamp?: string; nonce?: string; signature?: string; serialNo?: string; body: string }) {
    if (!input.timestamp || !input.nonce || !input.signature || !input.serialNo || !process.env.WECHAT_PLATFORM_CERT_PATH) return false;
    const timestamp = Number(input.timestamp);
    if (!Number.isInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false;
    const expectedSerial = process.env.WECHAT_PLATFORM_CERT_SERIAL_NO || process.env.WECHAT_PLATFORM_SERIAL_NO;
    if (!expectedSerial || input.serialNo !== expectedSerial) return false;
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${input.timestamp}\n${input.nonce}\n${input.body}\n`);
    return verifier.verify(this.platformCertificate(), input.signature, 'base64');
  }

  decryptNotification(input: { ciphertext: string; nonce: string; associatedData: string }) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', apiV3Key(), Buffer.from(input.nonce, 'utf8'));
      decipher.setAAD(Buffer.from(input.associatedData, 'utf8'));
      const encrypted = Buffer.from(input.ciphertext, 'base64');
      if (encrypted.length <= 16) throw new Error('invalid ciphertext');
      decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
      return JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('支付通知解密失败');
    }
  }

  async refund(input: { transactionId: string; outRefundNo: string; refundFen: number; totalFen: number }) {
    if (this.mode === 'manual') return { mode: this.mode as 'manual' };
    if (!input.transactionId || !input.outRefundNo || !Number.isInteger(input.refundFen) || !Number.isInteger(input.totalFen) || input.refundFen <= 0 || input.refundFen > input.totalFen) throw new BadRequestException('退款参数不合法');
    const result = await this.post('/v3/refund/domestic/refunds', { transaction_id: input.transactionId, out_refund_no: input.outRefundNo, reason: '售后退款', amount: { refund: input.refundFen, total: input.totalFen, currency: 'CNY' } });
    const refundId = String(result.refund_id || '');
    if (!refundId) throw new Error('退款服务未返回退款编号');
    return { mode: this.mode as 'real', refundId };
  }

  async transfer(input: { outBillNo: string; openId: string; amountFen: number; description: string }) {
    if (this.mode === 'manual') return { mode: this.mode as 'manual', state: 'MANUAL_REVIEW' };
    if (!input.outBillNo || !input.openId || !Number.isInteger(input.amountFen) || input.amountFen <= 0) throw new BadRequestException('打款参数不合法');
    const result = await this.post('/v3/transfer/batches', { batch_id: input.outBillNo, batch_name: '九转健康奖励提现', batch_remark: input.description, total_amount: input.amountFen, total_num: 1, transfer_detail_list: [{ out_detail_no: input.outBillNo, transfer_amount: input.amountFen, transfer_remark: input.description, openid: input.openId }] });
    return { mode: this.mode as 'real', state: String(result.batch_state || '') };
  }
}
