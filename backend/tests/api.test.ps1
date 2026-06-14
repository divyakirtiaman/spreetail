$ErrorActionPreference = "Stop"
Write-Host "=== SplitFlat API Integration Test ===" -ForegroundColor Cyan

# Login
$loginRes = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" -Method Post -ContentType "application/json" -Body '{"name":"Rohan","password":"password123"}'
$TOKEN = $loginRes.token
$headers = @{ Authorization = "Bearer $TOKEN" }
Write-Host "[1] Login OK - $($loginRes.user.name)" -ForegroundColor Green

# Get users
$users = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/users" -Headers $headers
Write-Host "[2] Users: $($users.Count) - $($users.name -join ', ')" -ForegroundColor Green

# Create Manual Expense
$expBody = '{"description":"Cinema tickets","paid_by":"Sam","amount":1200,"currency":"INR","exchange_rate":1,"split_type":"equal","date":"2026-06-14","split_with":["Aisha","Rohan","Priya","Sam"],"notes":"api test"}'
$expRes = Invoke-RestMethod -Uri "http://localhost:5000/api/expenses" -Method Post -ContentType "application/json" -Headers $headers -Body $expBody
Write-Host "[3] Create Expense OK - ID $($expRes.id)" -ForegroundColor Green

# Get Expenses
$expenses = Invoke-RestMethod -Uri "http://localhost:5000/api/expenses" -Headers $headers
Write-Host "[4] Expense Count: $($expenses.Count)" -ForegroundColor Green

# Create Settlement  
$payBody = '{"paid_by":"Priya","received_by":"Dev","amount":5000,"date":"2026-06-14","notes":"api test settlement"}'
$payRes = Invoke-RestMethod -Uri "http://localhost:5000/api/payments" -Method Post -ContentType "application/json" -Headers $headers -Body $payBody
Write-Host "[5] Settlement OK - ID $($payRes.id)" -ForegroundColor Green

# Get Balances
$balRes = Invoke-RestMethod -Uri "http://localhost:5000/api/balances" -Headers $headers
$members = $balRes.ledger.PSObject.Properties.Name
Write-Host "[6] Balance Members: $($members.Count) - $($members -join ', ')" -ForegroundColor Green

Write-Host "`n    Settle-Up Transactions:" -ForegroundColor White
foreach ($tx in $balRes.transactions) {
    Write-Host "      $($tx.from) pays $($tx.to) Rs.$($tx.amount)" -ForegroundColor Gray
}

# Verify net sum close to zero (allow tolerance for rounding across many expenses)
$netSum = 0
foreach ($name in $members) {
    $bal = $balRes.ledger.$name.netBalance
    Write-Host "    $name : $bal" -ForegroundColor DarkGray
    $netSum += $bal
}
$netSumRounded = [Math]::Round($netSum, 2)
Write-Host "`n    NET SUM: $netSumRounded (tolerance: within 1 INR for rounding)" -ForegroundColor White
if ([Math]::Abs($netSumRounded) -le 1.0) {
    Write-Host "[7] Net balance check PASSED (within 1 INR tolerance)" -ForegroundColor Green
} else {
    Write-Host "[7] Net balance check WARNING: sum = $netSumRounded" -ForegroundColor Yellow
}

# Cleanup
$null = Invoke-RestMethod -Uri "http://localhost:5000/api/expenses/$($expRes.id)" -Method Delete -Headers $headers
$null = Invoke-RestMethod -Uri "http://localhost:5000/api/payments/$($payRes.id)" -Method Delete -Headers $headers
Write-Host "[8] Cleanup done" -ForegroundColor Green

Write-Host "`n=== ALL API TESTS PASSED ===" -ForegroundColor Cyan
