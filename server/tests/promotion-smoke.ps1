param([string]$BaseUrl = "http://127.0.0.1:3002/api/v1")
$ErrorActionPreference = "Stop"

$suffix = [guid]::NewGuid().ToString("N").Substring(0, 8)
$salesId = "smoke-sales-$suffix"
$customerId = "smoke-customer-$suffix"
$admin = @{ "x-user-id" = "admin"; "x-role" = "admin"; "content-type" = "application/json" }

$promoter = @{ id = $salesId; name = "Smoke Sales"; type = "sales"; level = "STAFF"; active = $true } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/admin/promoters" -Method Post -Headers $admin -Body $promoter | Out-Null
$customer = @{ id = $customerId; name = "Smoke Customer"; promoter = "" } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/admin/customers" -Method Post -Headers $admin -Body $customer | Out-Null
$relation = @{ promoterId = $salesId; customerId = $customerId; source = "admin-assignment"; reason = "promotion smoke" } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/admin/promoter-relations" -Method Post -Headers $admin -Body $relation | Out-Null
$rule = @{ productId = "p-jujube-tea"; promoterType = "STAFF"; rate = 0.06; enabled = $true } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/admin/commission-rules" -Method Post -Headers $admin -Body $rule | Out-Null

$sales = @{ "x-user-id" = $salesId; "x-role" = "sales"; "content-type" = "application/json" }
$draftBody = @{ customerId = $customerId; items = @(@{ productId = "p-jujube-tea"; quantity = 1 }) } | ConvertTo-Json -Depth 6
$draft = (Invoke-RestMethod "$BaseUrl/sales/order-drafts" -Method Post -Headers $sales -Body $draftBody).data
if (-not $draft.token) { throw "Agent order draft token missing" }

$customerHeaders = @{ "x-user-id" = $customerId; "x-role" = "consumer"; "content-type" = "application/json" }
$confirmBody = @{ address = @{ name = "Smoke Customer"; phone = "13800009999"; detail = "Smoke address" } } | ConvertTo-Json -Depth 5
$confirmed = (Invoke-RestMethod "$BaseUrl/order-drafts/$($draft.token)/confirm" -Method Post -Headers $customerHeaders -Body $confirmBody).data
if ($confirmed.order.status -ne "pending_payment") { throw "Agent order did not remain pending payment" }

$tree = (Invoke-RestMethod "$BaseUrl/admin/sales/tree" -Headers $admin).data
if (-not (@($tree.attributions | Where-Object { $_.customerId -eq $customerId -and $_.ownerPromoterId -eq $salesId })).Count) { throw "Customer attribution missing" }

Write-Output "Promotion smoke passed: sales=$salesId draft=$($draft.id) order=$($confirmed.order.id)"
