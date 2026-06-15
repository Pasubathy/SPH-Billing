# SPH Billing - Native PowerShell Backend Server
# Runs a local HTTP server that hosts the frontend and handles database REST APIs.

$port = 3000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Prefixes.Add("http://localhost:$port/")

$dbPath = Join-Path $PSScriptRoot "../db/data.json"
$frontendPath = Join-Path $PSScriptRoot "../frontend"

# Helper to read Database
function Read-Database {
    if (Test-Path $dbPath) {
        $content = Get-Content -Raw -Path $dbPath -ErrorAction SilentlyContinue
        if ($content) {
            return $content
        }
    }
    # Fallback default DB structure
    return '{"categories":[],"units":[],"items":[],"customers":[],"sales":[],"invoice_counter":1,"payments":[],"payment_counter":1,"tagSettings":{}}'
}

# Helper to write Database
function Write-Database ($dbObject) {
    $payments = if ($dbObject.payments) { [System.Collections.ArrayList]@($dbObject.payments | ForEach-Object { $_ }) } else { [System.Collections.ArrayList]@() }
    $paymentCounter = if ($null -ne $dbObject.payment_counter) { $dbObject.payment_counter } else { 1 }

    $cleanDb = [PSCustomObject]@{
        categories      = [System.Collections.ArrayList]@($dbObject.categories | ForEach-Object { $_ })
        units           = [System.Collections.ArrayList]@($dbObject.units | ForEach-Object { $_ })
        items           = [System.Collections.ArrayList]@($dbObject.items | ForEach-Object { $_ })
        customers       = [System.Collections.ArrayList]@($dbObject.customers | ForEach-Object { $_ })
        sales           = [System.Collections.ArrayList]@($dbObject.sales | ForEach-Object { $_ })
        invoice_counter = $dbObject.invoice_counter
        payments        = $payments
        payment_counter = $paymentCounter
        tagSettings     = if ($null -ne $dbObject.tagSettings) { $dbObject.tagSettings } else { @{} }
    }
    $jsonString = ConvertTo-Json -InputObject $cleanDb -Depth 5 -Compress
    Set-Content -Path $dbPath -Value $jsonString -Encoding utf8
}

# Helper to read POST body
function Get-RequestBody ($request) {
    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
    $body = $reader.ReadToEnd()
    $reader.Close()
    return $body
}

try {
    $listener.Start()
    Write-Output "=================================================="
    Write-Output "  SPH Billing Server is running!"
    Write-Output "  PC  : http://127.0.0.1:$port"
    Write-Output "  Mobile: http://192.168.1.8:$port"
    Write-Output "=================================================="

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Set CORS headers
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

        $urlPath = [System.Uri]::UnescapeDataString($request.Url.LocalPath)
        $method = $request.HttpMethod

        # Handle preflight OPTIONS request
        if ($method -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.OutputStream.Close()
            continue
        }

        # REST API Routes
        if ($urlPath.StartsWith("/api/")) {
            $response.ContentType = "application/json; charset=utf-8"
            $dbJson = Read-Database | ConvertFrom-Json

            if ($null -eq $dbJson.psobject.Properties['payments']) {
                $dbJson | Add-Member -MemberType NoteProperty -Name "payments" -Value @()
            }
            if ($null -eq $dbJson.psobject.Properties['payment_counter']) {
                $dbJson | Add-Member -MemberType NoteProperty -Name "payment_counter" -Value 1
            }
            if ($null -eq $dbJson.psobject.Properties['tagSettings']) {
                $dbJson | Add-Member -MemberType NoteProperty -Name "tagSettings" -Value @{}
            }

            switch -Regex ($urlPath) {

                # 1. Categories
                "^/api/categories$" {
                    if ($method -eq "GET") {
                        $json = ConvertTo-Json -InputObject @($dbJson.categories) -Depth 5 -Compress
                        if ($null -eq $json -or $json -eq "") { $json = "[]" }
                        if (-not $json.StartsWith("[")) { $json = "[$json]" }
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    } elseif ($method -eq "POST") {
                        $body = Get-RequestBody $request
                        $dbJson.categories = ConvertFrom-Json $body
                        Write-Database $dbJson
                        $resJson = '{"success":true}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    }
                }

                # 2. Units
                "^/api/units$" {
                    if ($method -eq "GET") {
                        $json = ConvertTo-Json -InputObject @($dbJson.units) -Depth 5 -Compress
                        if ($null -eq $json -or $json -eq "") { $json = "[]" }
                        if (-not $json.StartsWith("[")) { $json = "[$json]" }
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    } elseif ($method -eq "POST") {
                        $body = Get-RequestBody $request
                        $dbJson.units = ConvertFrom-Json $body
                        Write-Database $dbJson
                        $resJson = '{"success":true}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    }
                }

                # 3. Items
                "^/api/items$" {
                    if ($method -eq "GET") {
                        $json = ConvertTo-Json -InputObject @($dbJson.items) -Depth 5 -Compress
                        if ($null -eq $json -or $json -eq "") { $json = "[]" }
                        if (-not $json.StartsWith("[")) { $json = "[$json]" }
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    } elseif ($method -eq "POST") {
                        $body = Get-RequestBody $request
                        $dbJson.items = ConvertFrom-Json $body
                        Write-Database $dbJson
                        $resJson = '{"success":true}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    }
                }

                # 4. Customers
                "^/api/customers$" {
                    if ($method -eq "GET") {
                        $json = ConvertTo-Json -InputObject @($dbJson.customers) -Depth 5 -Compress
                        if ($null -eq $json -or $json -eq "") { $json = "[]" }
                        if (-not $json.StartsWith("[")) { $json = "[$json]" }
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    } elseif ($method -eq "POST") {
                        $body = Get-RequestBody $request
                        $dbJson.customers = ConvertFrom-Json $body
                        Write-Database $dbJson
                        $resJson = '{"success":true}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    }
                }

                # 5. Sales
                "^/api/sales$" {
                    if ($method -eq "GET") {
                        $json = ConvertTo-Json -InputObject @($dbJson.sales) -Depth 5 -Compress
                        if ($null -eq $json -or $json -eq "") { $json = "[]" }
                        if (-not $json.StartsWith("[")) { $json = "[$json]" }
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    } elseif ($method -eq "POST") {
                        $body = Get-RequestBody $request
                        $dbJson.sales = ConvertFrom-Json $body
                        Write-Database $dbJson
                        $resJson = '{"success":true}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    }
                }

                # 6. Invoice Counter
                "^/api/invoice-counter$" {
                    if ($method -eq "GET") {
                        $json = '{"counter":' + $dbJson.invoice_counter + '}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    } elseif ($method -eq "POST") {
                        $body = Get-RequestBody $request
                        $bodyObj = ConvertFrom-Json $body
                        $dbJson.invoice_counter = [int]$bodyObj.counter
                        Write-Database $dbJson
                        $resJson = '{"success":true}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    }
                }

                # 7. Payments Received
                "^/api/payments$" {
                    if ($method -eq "GET") {
                        $paymentsList = if ($dbJson.payments) { [System.Collections.ArrayList]@($dbJson.payments) } else { [System.Collections.ArrayList]@() }
                        $json = ConvertTo-Json -InputObject $paymentsList -Depth 5 -Compress
                        if ($null -eq $json -or $json -eq "") { $json = "[]" }
                        if (-not $json.StartsWith("[")) { $json = "[$json]" }
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    } elseif ($method -eq "POST") {
                        $body = Get-RequestBody $request
                        $dbJson.payments = ConvertFrom-Json $body
                        Write-Database $dbJson
                        $resJson = '{"success":true}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    }
                }

                # 8. Payment Counter
                "^/api/payment-counter$" {
                    if ($method -eq "GET") {
                        $counter = if ($null -ne $dbJson.payment_counter) { $dbJson.payment_counter } else { 1 }
                        $json = '{"counter":' + $counter + '}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    } elseif ($method -eq "POST") {
                        $body = Get-RequestBody $request
                        $bodyObj = ConvertFrom-Json $body
                        $dbJson.payment_counter = [int]$bodyObj.counter
                        Write-Database $dbJson
                        $resJson = '{"success":true}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    }
                }

                # 9. Tag Settings
                "^/api/settings/tag$" {
                    if ($method -eq "GET") {
                        $json = ConvertTo-Json -InputObject $dbJson.tagSettings -Depth 5 -Compress
                        if ($null -eq $json -or $json -eq "") { $json = "{}" }
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    } elseif ($method -eq "POST") {
                        $body = Get-RequestBody $request
                        $dbJson.tagSettings = ConvertFrom-Json $body
                        Write-Database $dbJson
                        $resJson = '{"success":true}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    }
                }

                default {
                    $response.StatusCode = 404
                    $resJson = '{"error":"Not Found"}'
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            }
        } else {
            # Static File Serving
            if ($urlPath -eq "/") {
                $urlPath = "/index.html"
            }

            $filePath = Join-Path $frontendPath $urlPath.TrimStart('/')

            if (Test-Path $filePath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $contentType = switch ($ext) {
                    ".html" { "text/html" }
                    ".css"  { "text/css" }
                    ".js"   { "application/javascript" }
                    ".png"  { "image/png" }
                    ".jpg"  { "image/jpeg" }
                    ".jpeg" { "image/jpeg" }
                    ".svg"  { "image/svg+xml" }
                    default { "application/octet-stream" }
                }

                $response.ContentType = $contentType
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                # Fallback to index.html for SPA behavior or return 404
                $fallbackPath = Join-Path $frontendPath "index.html"
                if (Test-Path $fallbackPath -PathType Leaf) {
                    $response.ContentType = "text/html"
                    $bytes = [System.IO.File]::ReadAllBytes($fallbackPath)
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                } else {
                    $response.StatusCode = 404
                }
            }
        }

        $response.OutputStream.Close()
    }
} catch {
    Write-Error $_
} finally {
    $listener.Stop()
}
