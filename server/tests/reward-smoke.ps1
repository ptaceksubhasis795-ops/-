param([string]$BaseUrl = "http://127.0.0.1:3000/api/v1")

$admin = @{ "x-user-id" = "admin"; "x-role" = "admin" }
$consumer = @{ "x-user-id" = "reward-smoke-$([guid]::NewGuid())"; "x-role" = "member"; "idempotency-key" = "reward-$([guid]::NewGuid())" }
$rule = @{ productId = "p-jujube-tea"; promoterType = "SENIOR_MEMBER"; rate = 0.06; enabled = $true } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/admin/commission-rules" -Method Post -Headers $admin -ContentType "application/json" -Body $rule | Out-Null
$body = @{ items = @(@{ productId = "p-jujube-tea"; quantity = 1 }); promoter = "u-demo"; address = @{ name = "奖励验收用户"; phone = "13800001111"; detail = "测试地址" } } | ConvertTo-Json -Depth 6
$order = Invoke-RestMethod "$BaseUrl/orders" -Method Post -Headers $consumer -ContentType "application/json" -Body $body
$salesHeaders = @{ "x-user-id" = "u-demo"; "x-role" = "member" }
$pending = (Invoke-RestMethod "$BaseUrl/sales/overview" -Headers $salesHeaders).data.commission | Where-Object orderId -eq $order.data.id
if ($pending.status -ne "pending") { throw "Commission was not created as pending" }
Invoke-RestMethod "$BaseUrl/orders/$($order.data.id)/pay" -Method Post -Headers $consumer | Out-Null
$afterBody = @{ orderId = $order.data.id; reason = "测试质量问题" } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/aftersales" -Method Post -Headers $consumer -ContentType "application/json" -Body $afterBody | Out-Null
$reversed = (Invoke-RestMethod "$BaseUrl/sales/overview" -Headers $salesHeaders).data.commission | Where-Object orderId -eq $order.data.id
if ($reversed.status -ne "reversed") { throw "Commission was not reversed after after-sales" }
Write-Output "Reward smoke passed: order=$($order.data.orderNo), amount=$($pending.amount), final=$($reversed.status)"
