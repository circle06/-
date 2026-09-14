[CmdletBinding()]
param(
  [ValidateSet("openai", "anthropic", "deepseek", "glm")]
  [string]$Provider = "deepseek",

  [ValidateRange(1, 65535)]
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $projectRoot ".next\standalone\server.js"

if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "Standalone build not found. Run: npm.cmd run build"
}

$keyEnvironment = switch ($Provider) {
  "openai" { "OPENAI_API_KEY" }
  "anthropic" { "ANTHROPIC_API_KEY" }
  "deepseek" { "DEEPSEEK_API_KEY" }
  "glm" { "GLM_API_KEY" }
}

$secureKey = Read-Host "Enter $Provider API Key" -AsSecureString
$credential = [System.Net.NetworkCredential]::new("", $secureKey)
$plainKey = $credential.Password
if ([string]::IsNullOrWhiteSpace($plainKey)) { throw "API Key cannot be empty." }

$previousValues = @{}
foreach ($name in @("LLM_MODE", "PORT", "HOSTNAME", $keyEnvironment)) {
  $previousValues[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

try {
  [Environment]::SetEnvironmentVariable("LLM_MODE", "live", "Process")
  [Environment]::SetEnvironmentVariable("PORT", $Port.ToString(), "Process")
  [Environment]::SetEnvironmentVariable("HOSTNAME", "0.0.0.0", "Process")
  [Environment]::SetEnvironmentVariable($keyEnvironment, $plainKey, "Process")

  Write-Host "Live source server: http://localhost:$Port"
  Write-Host "Provider: $Provider"
  Write-Host "Select the model in the web UI; changing models does not require a restart."
  Write-Host "Press Ctrl+C when finished. The key is held only in this process and is not written to the project."

  & node $serverPath
  if ($LASTEXITCODE -ne 0) { throw "Live server exited with code $LASTEXITCODE." }
}
finally {
  foreach ($name in $previousValues.Keys) {
    [Environment]::SetEnvironmentVariable($name, $previousValues[$name], "Process")
  }
  $plainKey = $null
  $credential = $null
  $secureKey = $null
}
