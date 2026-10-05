import assert from 'node:assert/strict';
import { createCipheriv, createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiController } from '../src/api.controller';
import { PaymentController } from '../src/payment.controller';
import { WeChatPaymentAdapter } from '../src/integrations/wechat.adapters';
import { AuthService } from '../src/security/auth.service';
import { SessionGuard } from '../src/security/session.guard';

function expectThrow(action: () => unknown, message: string) {
  assert.throws(action, message);
}

async function main() {
  process.env.NODE_ENV = 'development';
  process.env.AUTH_SECRET = 'security-regression-secret-32-characters-long';
  const store: any = {
    state: {
      users: [{ id: 'user-1', openId: 'openid-1', role: 'CONSUMER' }],
      orders: [],
      payments: [],
      aftersales: [],
      refunds: [],
      outbox: []
    },
    addAudit() {},
    newId(prefix: string) { return `${prefix}-fixture`; },
    timestamp() { return new Date().toISOString(); }
  };
  const auth = new AuthService(store, {} as any);
  const oldRoleToken = auth.sign('user-1', 'admin');
  assert.equal(auth.verify(oldRoleToken)?.role, 'consumer', 'token role did not resolve from current user');
  store.state.users[0].role = 'MEMBER';
  assert.equal(auth.verify(oldRoleToken)?.role, 'member', 'member approval did not update token role');

  const reflector: any = { getAllAndOverride: () => false };
  const guard = new SessionGuard(reflector, auth);
  const requestContext = (headers: Record<string, string>) => ({
    getHandler() {},
    getClass() {},
    switchToHttp() { return { getRequest: () => ({ headers }) }; }
  } as any);
  process.env.ALLOW_DEV_HEADERS = 'false';
  expectThrow(() => guard.canActivate(requestContext({ 'x-role': 'admin' })), 'development headers are accepted by default');
  process.env.ALLOW_DEV_HEADERS = 'true';
  assert.equal(guard.canActivate(requestContext({ 'x-role': 'admin' })), true, 'explicit development header opt-in failed');
  process.env.NODE_ENV = 'production';
  expectThrow(() => guard.canActivate(requestContext({ 'x-role': 'admin' })), 'development headers accepted in production');
  process.env.NODE_ENV = 'development';

  const business: any = { store };
  const paymentStub: any = { mode: 'manual' };
  const paymentController = new PaymentController(business, paymentStub, { verify: () => ({ id: 'user-1', role: 'member' }) } as any);
  await assert.rejects(() => paymentController.jsapi({ orderId: 'order-1', openId: 'attacker-openid' }, {}), 'client openId was accepted');
  const apiController = new ApiController({ updateOrder: () => { throw new Error('must not call updateOrder'); } } as any, { verify: () => ({ id: 'user-1', role: 'member' }) } as any);
  expectThrow(() => apiController.orderAction('order-1', 'pay', { source: 'payment_callback' }, {}), 'HTTP order pay action was accepted');

  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'jz-payment-security-'));
  try {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPath = join(fixtureDirectory, 'merchant-key.pem');
    const certificatePath = join(fixtureDirectory, 'platform-cert.pem');
    writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    writeFileSync(certificatePath, publicKey.export({ type: 'spki', format: 'pem' }));
    Object.assign(process.env, {
      WECHAT_APPID: 'fixture-app',
      WECHAT_MCHID: 'fixture-mch',
      WECHAT_SERIAL_NO: 'merchant-serial',
      WECHAT_PLATFORM_CERT_SERIAL_NO: 'platform-serial',
      WECHAT_PRIVATE_KEY_PATH: privateKeyPath,
      WECHAT_PLATFORM_CERT_PATH: certificatePath,
      WECHAT_API_V3_KEY: '12345678901234567890123456789012'
    });
    const adapter = new WeChatPaymentAdapter();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = 'nonce-fixture';
    const body = '{"resource":{"ciphertext":"fixture"}}';
    const signer = createSign('RSA-SHA256');
    signer.update(`${timestamp}\n${nonce}\n${body}\n`);
    const signature = signer.sign(privateKey, 'base64');
    assert.equal(adapter.verifyNotification({ timestamp, nonce, signature, serialNo: 'platform-serial', body }), true, 'valid notification fixture rejected');
    assert.equal(adapter.verifyNotification({ timestamp: String(Number(timestamp) - 301), nonce, signature, serialNo: 'platform-serial', body }), false, 'stale notification fixture accepted');
    const encryptedNonce = '0123456789ab';
    const associatedData = 'transaction';
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.WECHAT_API_V3_KEY!, 'utf8'), Buffer.from(encryptedNonce, 'utf8'));
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify({ out_trade_no: 'fixture-order', amount: { total: 100 } }), 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64');
    const decrypted = adapter.decryptNotification({ ciphertext: encrypted, nonce: encryptedNonce, associatedData });
    assert.equal((decrypted.amount as any).total, 100, 'valid AES-GCM notification could not be decrypted');
    const tampered = Buffer.from(encrypted, 'base64'); tampered[0] ^= 1;
    assert.throws(() => adapter.decryptNotification({ ciphertext: tampered.toString('base64'), nonce: encryptedNonce, associatedData }), 'tampered AES-GCM notification accepted');
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
  console.log('runtime payment security regression checks passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
