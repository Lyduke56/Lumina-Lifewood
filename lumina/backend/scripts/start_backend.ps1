# Start both backend services for Lumina (web HTTP + OpenClaw MCP).
$ErrorActionPreference = "Stop"

$AppDir = Join-Path $PSScriptRoot "..\app"
Set-Location $AppDir

$VenvPython = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
$VenvUvicorn = Join-Path $PSScriptRoot "..\.venv\Scripts\uvicorn.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "Create a venv first: python -m venv ..\.venv; ..\.venv\Scripts\pip install -r ..\requirements.txt"
    exit 1
}

$env:MCP_TRANSPORT = if ($env:MCP_TRANSPORT) { $env:MCP_TRANSPORT } else { "streamable-http" }
$env:MCP_HOST = if ($env:MCP_HOST) { $env:MCP_HOST } else { "0.0.0.0" }
$env:MCP_PORT = if ($env:MCP_PORT) { $env:MCP_PORT } else { "8001" }

Write-Host "Starting MCP server on http://$($env:MCP_HOST):$($env:MCP_PORT)/mcp"
$mcp = Start-Process -FilePath $VenvPython -ArgumentList "server.py" -PassThru -NoNewWindow

Write-Host "Starting HTTP API on http://0.0.0.0:8000"
$http = Start-Process -FilePath $VenvUvicorn -ArgumentList "http_api:app","--host","0.0.0.0","--port","8000" -PassThru -NoNewWindow

Write-Host "MCP PID=$($mcp.Id)  HTTP PID=$($http.Id)"
Write-Host "Press Ctrl+C to stop both."

try {
    Wait-Process -Id $mcp.Id, $http.Id
} finally {
    Stop-Process -Id $mcp.Id, $http.Id -Force -ErrorAction SilentlyContinue
}
