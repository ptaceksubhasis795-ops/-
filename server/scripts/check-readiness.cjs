const fs = require('node:fs');

const checks = [
  ['DATABASE_URL', Boolean(process.env.DATABASE_URL), 'MySQL connection string'],
  ['AUTH_SECRET', Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32), 'Bearer session secret (>= 32 chars)'],
  ['FIELD_ENCRYPTION_KEY', Boolean(process.env.FIELD_ENCRYPTION_KEY && process.env.FIELD_ENCRYPTION_KEY.length >= 32), 'Field encryption secret (>= 32 chars)'],
  ['STAFF_ACCOUNTS_JSON', (() => { try { const accounts = JSON.parse(process.env.STAFF_ACCOUNTS_JSON || '[]'); return Array.isArray(accounts) && accounts.some((item) => item && ['admin', 'pharmacist', 'fulfillment'].includes(item.role) && item.username && item.passwordHash); } catch { return false; } })(), 'At least one hashed staff account'],
  ['WECHAT_APPID', Boolean(process.env.WECHAT_APPID), 'WeChat AppID'],
  ['WECHAT_SECRET', Boolean(process.env.WECHAT_SECRET), 'WeChat login secret'],
  ['WECHAT_MCHID', Boolean(process.env.WECHAT_MCHID), 'WeChat merchant ID'],
  ['WECHAT_API_V3_KEY', Boolean(process.env.WECHAT_API_V3_KEY), 'WeChat API v3 key'],
  ['WECHAT_SERIAL_NO', Boolean(process.env.WECHAT_SERIAL_NO), 'WeChat certificate serial'],
  ['WECHAT_PRIVATE_KEY_PATH', Boolean(process.env.WECHAT_PRIVATE_KEY_PATH && fs.existsSync(process.env.WECHAT_PRIVATE_KEY_PATH)), 'WeChat merchant private key file'],
  ['WECHAT_PLATFORM_CERT_PATH', Boolean(process.env.WECHAT_PLATFORM_CERT_PATH && fs.existsSync(process.env.WECHAT_PLATFORM_CERT_PATH)), 'WeChat platform certificate file'],
  ['WECHAT_PLATFORM_CERT_SERIAL_NO', Boolean(process.env.WECHAT_PLATFORM_CERT_SERIAL_NO), 'WeChat platform certificate serial'],
  ['PUBLIC_API_BASE_URL', Boolean(process.env.PUBLIC_API_BASE_URL && /^https:\/\//.test(process.env.PUBLIC_API_BASE_URL)), 'Public HTTPS API base URL for uploaded media'],
  ['HOSPITAL_API_URL', Boolean(process.env.HOSPITAL_API_URL), 'Internet hospital endpoint'],
  ['INVOICE_API_URL', Boolean(process.env.INVOICE_API_URL), 'Invoice provider endpoint'],
  ['LOGISTICS_API_URL', Boolean(process.env.LOGISTICS_API_URL), 'Logistics provider endpoint'],
  ['SMS_API_URL', Boolean(process.env.SMS_API_URL), 'SMS provider endpoint'],
  ['COS_BUCKET', Boolean(process.env.COS_BUCKET), 'Object storage bucket']
];

let missing = 0;
console.log('九转健康商城生产配置检查');
for (const [key, ok, description] of checks) {
  console.log(`${ok ? 'PASS' : 'MISS'}  ${key.padEnd(28)} ${description}`);
  if (!ok) missing += 1;
}
console.log(`\n${checks.length - missing}/${checks.length} 项已配置`);
if (process.env.NODE_ENV === 'production' && missing) process.exitCode = 1;
