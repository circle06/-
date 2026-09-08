[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet("openai", "anthropic", "deepseek", "glm")]
  [string]$Provider = "deepseek",

  [ValidateSet("start", "stop", "status")]
  [string]$Action = "start",

  [ValidateRange(1, 65535)]
  [int]$Port = 3000,

  [string]$Image = "multi-provider-llm-toolbox:phase3"
)

$ErrorActionPreference = "Stop"
$containerName = "llm-toolbox-live"
$secretBase = Join-Path ([IO.Path]::GetTempPath()) "modelhub-live-secret"
$secretFile = Join-Path $secretBase "provider-api-key"

function Assert-DockerSuccess([string]$Message) {
  if ($LASTEXITCODE -ne 0) { throw $Message }
}

function Remove-SecretDirectory {
  if (-not (Test-Path -LiteralPath $secretBase)) { return }
  $resolvedBase = [IO.Path]::GetFullPath($secretBase)
  $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (-not $resolvedBase.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a secret directory outside the system temporary directory."
  }
  Remove-Item -LiteralPath $resolvedBase -Recurse -Force
}

function Stop-LiveContainer {
  $existing = docker ps -a --filter "name=^/$containerName$" --format "{{.Names}}"
  Assert-DockerSuccess "Cannot query Docker containers. Make sure Docker Desktop is running."
  if ($existing -eq $containerName) {
    docker stop $containerName | Out-Null
    Assert-DockerSuccess "Cannot stop the existing live container."
  }
  Remove-SecretDirectory
}

if ($Action -eq "stop") {
  Stop-LiveContainer
  Write-Host "Live container stopped and temporary secret removed."
  exit 0
}

if ($Action -eq "status") {
  docker ps -a --filter "name=^/$containerName$" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  Assert-DockerSuccess "Cannot query Docker containers. Make sure Docker Desktop is running."
  exit 0
}

docker info *> $null
Assert-DockerSuccess "Cannot connect to Docker. Make sure Docker Desktop is running."
docker image inspect $Image *> $null
Assert-DockerSuccess "Image $Image was not found. Build the image first."
Stop-LiveContainer

$keyEnvironment = switch ($Provider) {
  "openai" { "OPENAI_API_KEY" }
  "anthropic" { "ANTHROPIC_API_KEY" }
  "deepseek" { "DEEPSEEK_API_KEY" }
  "glm" { "GLM_API_KEY" }
}
$keyFileEnvironment = "${keyEnvironment}_FILE"
$secureKey = Read-Host "Enter the $Provider API Key" -AsSecureString
$credential = [System.Net.NetworkCredential]::new("", $secureKey)
$plainKey = $credential.Password
if ([string]::IsNullOrWhiteSpace($plainKey)) { throw "API Key cannot be empty." }

try {
  New-Item -ItemType Directory -Path $secretBase -Force | Out-Null
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $inheritance = [Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
  $propagation = [Security.AccessControl.PropagationFlags]::None
  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($currentUser, "FullControl", $inheritance, $propagation, "Allow")))
  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM", "FullControl", $inheritance, $propagation, "Allow")))
  Set-Acl -LiteralPath $secretBase -AclObject $acl
  [IO.File]::WriteAllText($secretFile, $plainKey, [Text.UTF8Encoding]::new($false))

  docker run --rm -d `
    --name $containerName `
    -p "${Port}:3000" `
    -e LLM_MODE=live `
    -e "${keyFileEnvironment}=/run/secrets/provider_api_key" `
    --mount "type=bind,source=$secretFile,target=/run/secrets/provider_api_key,readonly" `
    $Image | Out-Null
  Assert-DockerSuccess "The live container failed to start. Check the port, image, and Docker logs."
} catch {
  Remove-SecretDirectory
  throw
} finally {
  $plainKey = $null
  $credential = $null
  $secureKey = $null
}

Write-Host "Live mode started: http://localhost:$Port"
Write-Host "Provider configured: $Provider"
Write-Host "Stop safely with: .\run-live.ps1 -Action stop"
