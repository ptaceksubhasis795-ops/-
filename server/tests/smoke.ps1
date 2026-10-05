param(
  [string]$BaseUrl = "http://127.0.0.1:3000/api/v1"
)

$consumer = @{ "x-user-id" = "u-demo"; "x-role" = "member"; "idempotency-key" = "smoke-$([guid]::NewGuid())" }
$admin = @{ "x-user-id" = "admin"; "x-role" = "admin" }
$fulfillment = @{ "x-user-id" = "shipper-01"; "x-role" = "fulfillment" }

$health = Invoke-RestMethod "$BaseUrl/health"
if ($health.status -ne "ok") { throw "Health check failed" }

$products = Invoke-RestMethod "$BaseUrl/catalog/products"
if ($products.data.Count -lt 1) { throw "Product list is empty" }

$body = @{ items = @(@{ productId = "p-jujube-tea"; quantity = 1 }); address = @{ name = "验收用户"; phone = "13800000000"; detail = "测试地址" } } | ConvertTo-Json -Depth 6
$order = Invoke-RestMethod "$BaseUrl/orders" -Method Post -Headers $consumer -ContentType "application/json" -Body $body
Invoke-RestMethod "$BaseUrl/orders/$($order.data.id)/pay" -Method Post -Headers $consumer | Out-Null
$shipment = @{ carrier = "顺丰速运"; trackingNo = "SMOKE001" } | ConvertTo-Json
$shipped = Invoke-RestMethod "$BaseUrl/orders/$($order.data.id)/ship" -Method Post -Headers $fulfillment -ContentType "application/json" -Body $shipment
if ($shipped.data.shipment.trackingNo -ne "SMOKE001") { throw "Shipment was not saved" }

$dashboard = Invoke-RestMethod "$BaseUrl/admin/dashboard" -Headers $admin
$audit = Invoke-RestMethod "$BaseUrl/admin/audit-logs" -Headers $admin
if ($dashboard.data.orders -lt 1 -or $audit.data.Count -lt 1) { throw "Admin data or audit log is empty" }

Write-Output "API smoke passed: products=$($products.data.Count), order=$($order.data.orderNo), audits=$($audit.data.Count)"
