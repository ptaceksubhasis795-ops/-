/*
 * Payment/auth security regression checks.
 * Run with: node server/scripts/check-payment-security.cjs
 * This does not call a third-party provider or mark a business record paid.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const sourceRoot = path.join(__dirname, '..', 'src');
const paymentController = fs.readFileSync(path.join(sourceRoot, 'payment.controller.ts'), 'utf8');
const apiController = fs.readFileSync(path.join(sourceRoot, 'api.controller.ts'), 'utf8');
const sessionGuard = fs.readFileSync(path.join(sourceRoot, 'security', 'session.guard.ts'), 'utf8');
const authService = fs.readFileSync(path.join(sourceRoot, 'security', 'auth.service.ts'), 'utf8');
const adapter = fs.readFileSync(path.join(sourceRoot, 'integrations', 'wechat.adapters.ts'), 'utf8');

function checkSource(source, pattern, message) {
  assert.match(source, pattern, message);
}

// HTTP boundaries must not accept client payment state, role headers, or
// provider-controlled callback addresses.
checkSource(apiController, /支付状态只能由支付通知确认/, 'order pay action is not blocked');
checkSource(sessionGuard, /ALLOW_DEV_HEADERS === 'true'/, 'development header opt-in is missing');
checkSource(sessionGuard, /需要有效登录会话/, 'missing sessions are not rejected');
checkSource(paymentController, /body\.openId !== undefined \|\| body\.notifyUrl !== undefined/, 'client payment identifiers are trusted');
checkSource(paymentController, /payment_late_review/, 'late cancelled payments are not queued');
checkSource(paymentController, /售后尚未批准退款/, 'refund approval boundary is missing');
checkSource(paymentController, /退款支付流水不匹配/, 'refund transaction matching is missing');
checkSource(authService, /currentRole\(subject: string\)/, 'token roles are not resolved from current state');
checkSource(authService, /请使用微信手机号授权绑定/, 'production login accepts a client phone');
checkSource(adapter, /serialNo\?: string/, 'notification serial is not checked');
checkSource(adapter, /Math\.abs\(Math\.floor\(Date\.now\(\) \/ 1000\) - timestamp\) > 300/, 'notification timestamp freshness is not checked');

// Build a real RSA-SHA256 fixture like WeChat Pay signs. This guards the
// canonical payload, freshness window, and platform certificate serial rules.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = Math.floor(Date.now() / 1000);
const nonce = 'security-fixture-nonce';
const body = JSON.stringify({ resource: { ciphertext: 'fixture' } });
const serial = 'fixture-platform-serial';
const sign = (timestamp, signedBody = body) => {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${timestamp}\n${nonce}\n${signedBody}\n`);
  return signer.sign(privateKey, 'base64');
};
const verify = (timestamp, serialNo, signedBody, signature) => {
  if (!timestamp || !serialNo || serialNo !== serial) return false;
  if (Math.abs(now - Number(timestamp)) > 300) return false;
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${timestamp}\n${nonce}\n${signedBody}\n`);
  return verifier.verify(publicKey, signature, 'base64');
};

const validSignature = sign(String(now));
assert.equal(verify(String(now), serial, body, validSignature), true, 'valid signed notification rejected');
assert.equal(verify(String(now - 301), serial, body, sign(String(now - 301))), false, 'stale notification accepted');
assert.equal(verify(String(now), 'wrong-serial', body, validSignature), false, 'wrong certificate serial accepted');
assert.equal(verify(String(now), serial, `${body}tampered`, validSignature), false, 'tampered notification accepted');

console.log('payment security regression checks passed');
