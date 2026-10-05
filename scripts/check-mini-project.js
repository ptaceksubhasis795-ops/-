const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const missing = app.pages.filter((page) => !fs.existsSync(path.join(root, `${page}.wxml`)) || !fs.existsSync(path.join(root, `${page}.js`)))
if (missing.length) {
  console.error(`Missing page files: ${missing.join(', ')}`)
  process.exit(1)
}
const wxmlFunctionCalls = app.pages.filter((page) => /\{\{[^}]*\b[A-Za-z_$][\w$]*\s*\(/.test(fs.readFileSync(path.join(root, `${page}.wxml`), 'utf8')))
if (wxmlFunctionCalls.length) {
  console.error(`WXML must use preformatted fields instead of function calls: ${wxmlFunctionCalls.join(', ')}`)
  process.exit(1)
}
const runtime = require(path.join(root, 'config', 'runtime.js'))
if (!runtime.apiBaseUrl || typeof runtime.apiBaseUrl !== 'string') {
  console.error('Runtime API address is missing')
  process.exit(1)
}
if (runtime.environment === 'production' && (!/^https:/.test(runtime.apiBaseUrl) || runtime.demoMode)) {
  console.error('Production mini program must use an HTTPS API and cannot enable demo mode')
  process.exit(1)
}
const apiSource = fs.readFileSync(path.join(root, 'services', 'api.js'), 'utf8')
for (const endpoint of ['uploadFile', 'downloadFile', 'previewOrder', 'createWechatPayment', 'submitPrescription', 'bindWechatPhone', 'getArticles', 'getBanners', 'getLogistics']) {
  if (!apiSource.includes(`${endpoint}:`) && !apiSource.includes(`function ${endpoint}`) && !apiSource.includes(`${endpoint},`)) {
    console.error(`Missing mini program API contract: ${endpoint}`)
    process.exit(1)
  }
}
console.log(`Mini program manifest OK: ${app.pages.length} pages`)
