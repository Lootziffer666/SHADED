param(
  [ValidateSet('depth-anything-v2','depth-anything-3','both')]
  [string]$Provider = 'depth-anything-v2',
  [string]$InputImage = 'file_00000000974871f49fe71f6b456f9579.png',
  [ValidateRange(256,4096)]
  [int]$MaxEdge = 1024,
  [ValidateRange(1000,4000000)]
  [int]$PointBudget = 500000
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

function Require-Command([string]$Name, [string]$Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name fehlt. $Hint"
  }
}

function Invoke-Checked([scriptblock]$Command, [string]$Label) {
  Write-Host "`n== $Label ==" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Label fehlgeschlagen (Exit $LASTEXITCODE)." }
}

Require-Command 'node' 'Node.js 20+ installieren und Terminal neu öffnen.'
Require-Command 'npm' 'Node.js inklusive npm installieren.'
Require-Command 'python' 'Python 3.11 installieren und bei der Installation „Add Python to PATH“ aktivieren.'
Require-Command 'nvidia-smi' 'NVIDIA-Treiber installieren/aktualisieren.'

if (-not (Test-Path $InputImage -PathType Leaf)) {
  throw "Eingabebild nicht gefunden: $InputImage"
}

Write-Host 'SHADED RTX – Windows local runner' -ForegroundColor Green
Write-Host "Provider: $Provider"
Write-Host "Bild:     $InputImage"
Write-Host "MaxEdge:  $MaxEdge"
Write-Host "Punkte:   $PointBudget"

Invoke-Checked { nvidia-smi --query-gpu=index,name,driver_version,memory.total --format=csv } 'NVIDIA-GPU prüfen'
Invoke-Checked { npm ci } 'SHADED Node-Werkzeuge installieren'

$Venv = Join-Path $RepoRoot '.venv-depth-win'
$Python = Join-Path $Venv 'Scripts\python.exe'
if (-not (Test-Path $Python)) {
  Invoke-Checked { python -m venv $Venv } 'Python-Umgebung erstellen'
}
Invoke-Checked { & $Python -m pip install --upgrade pip } 'pip aktualisieren'

# IMPORTANT: A plain `pip install torch` is not an acceptable Windows GPU setup.
# Install an explicit NVIDIA CUDA wheel from PyTorch's official wheel index first.
# PyTorch 2.10 + cu126 is an official Windows/Linux combination and is a conservative
# choice for an RTX 3060. The wheel bundles the CUDA runtime; the PC only needs a
# compatible NVIDIA display driver, not a separately installed CUDA Toolkit.
$TorchVersion = '2.10.0'
$TorchVisionVersion = '0.25.0'
$CudaIndex = 'https://download.pytorch.org/whl/cu126'
Invoke-Checked {
  & $Python -m pip install --upgrade --force-reinstall "torch==$TorchVersion" "torchvision==$TorchVisionVersion" --index-url $CudaIndex
} 'PyTorch mit CUDA 12.6 installieren'

# Fail immediately if pip somehow produced a CPU build. Do this before the much larger
# provider installs so the error is obvious and cheap to diagnose.
Invoke-Checked {
  & $Python -c "import json,torch; info={'torch':torch.__version__,'cudaAvailable':torch.cuda.is_available(),'cudaRuntime':torch.version.cuda,'device':torch.cuda.get_device_name(0) if torch.cuda.is_available() else None}; print(json.dumps(info, indent=2)); assert torch.version.cuda is not None, 'CPU-only PyTorch build installed'; assert torch.cuda.is_available(), 'CUDA build is installed, but the NVIDIA driver/GPU is not available to PyTorch'"
} 'PyTorch/CUDA Basis prüfen'

if ($Provider -eq 'depth-anything-v2' -or $Provider -eq 'both') {
  Invoke-Checked { & $Python -m pip install -r 'tools/providers/requirements-depth-v2.txt' } 'Depth Anything V2 installieren'
}
if ($Provider -eq 'depth-anything-3' -or $Provider -eq 'both') {
  Invoke-Checked { & $Python -m pip install -r 'tools/providers/requirements-depth-v3.txt' } 'Depth Anything 3 installieren'
}

$config = Get-Content 'tools/gpu-providers.example.json' -Raw | ConvertFrom-Json
$names = @($config.providers.PSObject.Properties.Name)
foreach ($name in $names) {
  if ($Provider -ne 'both' -and $name -ne $Provider) {
    $config.providers.PSObject.Properties.Remove($name)
  } else {
    $config.providers.$name.command = $Python
  }
}
$configPath = Join-Path $RepoRoot '.runner-gpu-providers.windows.json'
$config | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $configPath

# Provider dependency resolution is allowed to add packages, but not to silently
# downgrade us back to a CPU-only torch. Re-check after provider installation.
Invoke-Checked {
  & $Python -c "import json,torch; print(json.dumps({'torch':torch.__version__,'cudaAvailable':torch.cuda.is_available(),'cudaRuntime':torch.version.cuda,'device':torch.cuda.get_device_name(0) if torch.cuda.is_available() else None}, indent=2)); assert torch.version.cuda is not None, 'Provider install replaced CUDA PyTorch with a CPU build'; assert torch.cuda.is_available(), 'CUDA is not available to PyTorch'"
} 'PyTorch/CUDA nach Provider-Installation prüfen'
Invoke-Checked { node tools/gpu-spatial.mjs doctor --config $configPath } 'Provider prüfen'

$OutputRoot = Join-Path $RepoRoot 'provider-output-windows'
New-Item -ItemType Directory -Force $OutputRoot | Out-Null

function Run-Provider([string]$Name, [string]$Folder, [string]$Bundle) {
  $out = Join-Path $OutputRoot $Folder
  Invoke-Checked {
    node tools/gpu-spatial.mjs run --config $configPath --provider $Name --input $InputImage --out $out --device cuda:0 --precision fp16 --max-edge $MaxEdge --point-budget $PointBudget
  } "$Name auf RTX ausführen"
  Invoke-Checked { node tools/gpu-spatial.mjs validate --manifest (Join-Path $out 'result.json') } "$Name Ergebnis validieren"
  Invoke-Checked { node tools/gpu-spatial.mjs bundle --manifest (Join-Path $out 'result.json') --out (Join-Path $OutputRoot $Bundle) } "$Name Import-Bundle bauen"
}

if ($Provider -eq 'depth-anything-3' -or $Provider -eq 'both') {
  Run-Provider 'depth-anything-3' 'da3' 'depth-anything-3.shaded-provider.json'
}
if ($Provider -eq 'depth-anything-v2' -or $Provider -eq 'both') {
  Run-Provider 'depth-anything-v2' 'da2' 'depth-anything-v2.shaded-provider.json'
}
if ($Provider -eq 'both') {
  Invoke-Checked {
    node tools/gpu-spatial.mjs compare --a (Join-Path $OutputRoot 'da3\result.json') --b (Join-Path $OutputRoot 'da2\result.json') --out (Join-Path $OutputRoot 'provider-agreement.json')
  } 'Provider vergleichen'
}

Write-Host "`nFERTIG. Importierbare Dateien liegen hier:" -ForegroundColor Green
Write-Host $OutputRoot -ForegroundColor Yellow
Start-Process explorer.exe $OutputRoot
