param([string]$BaseUrl = "http://127.0.0.1:3000/api/v1")

function Assert-Forbidden([scriptblock]$Action, [string]$Name) {
  try { & $Action | Out-Null; throw "$Name should be forbidden" } catch { if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw "$Name returned unexpected status" } }
}

$consumer = @{ "x-user-id" = "u-demo"; "x-role" = "member" }
$admin = @{ "x-user-id" = "admin"; "x-role" = "admin" }
$sales = @{ "x-user-id" = "u-demo"; "x-role" = "sales" }

Assert-Forbidden { Invoke-RestMethod "$BaseUrl/admin/dashboard" -Headers $consumer } "consumer-dashboard"
Assert-Forbidden { Invoke-RestMethod "$BaseUrl/admin/customers/export.xlsx" -Headers $consumer } "consumer-export"

$orders = Invoke-RestMethod "$BaseUrl/orders?status=paid" -Headers $admin
if ($orders.data.Count -gt 0) {
  $orderId = $orders.data[0].id
  Assert-Forbidden { Invoke-RestMethod "$BaseUrl/orders/$orderId/ship" -Method Post -Headers $consumer -ContentType "application/json" -Body '{}' } "consumer-ship"
}

$manual = @{ userId = 'c-01'; patientName = '王先生'; itemName = '胆南星直服饮片' } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/admin/prescriptions/manual" -Method Post -Headers $admin -ContentType 'application/json' -Body $manual | Out-Null
$salesPrescriptions = Invoke-RestMethod "$BaseUrl/prescriptions" -Headers $sales
$memberPrescriptions = Invoke-RestMethod "$BaseUrl/prescriptions" -Headers $consumer
$salesOnly = @($salesPrescriptions.data | Where-Object { $_.userId -eq 'c-01' })
$memberSeesSales = @($memberPrescriptions.data | Where-Object { $_.userId -eq 'c-01' })
if ($salesOnly.Count -gt 0 -and $memberSeesSales.Count -gt 0) { throw "member can see sales scoped prescriptions" }

$xlsx = Invoke-WebRequest "$BaseUrl/admin/customers/export.xlsx" -Headers $admin
if ($xlsx.StatusCode -ne 200 -or $xlsx.Headers['Content-Type'] -notmatch 'spreadsheetml') { throw "admin XLSX export failed" }

Write-Output "Security smoke passed"
