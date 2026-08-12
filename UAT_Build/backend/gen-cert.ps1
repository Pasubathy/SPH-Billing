$cert = New-SelfSignedCertificate -DnsName '192.168.1.8', 'localhost' -CertStoreLocation 'cert:\CurrentUser\My' -NotAfter (Get-Date).AddYears(5)
$certPwd = ConvertTo-SecureString -String 'sph1234' -Force -AsPlainText
$pfxPath = Join-Path $PSScriptRoot 'cert.pfx'
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $certPwd
Write-Host "cert.pfx created at: $pfxPath"
