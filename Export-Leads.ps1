Import-Module LeadsTools -Force
# 環境 or Secret から自動で文脈が入る前提。必要なら明示セット：
# Set-LeadsContext -BaseUrl $env:LEADS_BASEURL -AdminToken (Get-Secret LEADS_ADMIN_TOKEN -AsPlainText)
$out = Join-Path $HOME ("leads_{0:yyyyMMdd_HHmm}.csv" -f (Get-Date))
Export-LeadsCsv -LeadsJson (Get-DiagLeads) -Path $out
