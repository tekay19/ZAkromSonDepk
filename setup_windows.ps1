# Windows Setup Script for PazarlamaMaps
$ErrorActionPreference = "Stop"

Write-Host "Starting Windows Setup for PazarlamaMaps..." -ForegroundColor Cyan

# 1. Check for Dependencies (Node.js & Docker)
Write-Host "Checking system requirements..."
$missingDeps = $false

if (!(Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not installed or not in PATH." -ErrorAction Continue
    Write-Host "-> Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    $missingDeps = $true
}

if (!(Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Error "npm is not installed or not in PATH." -ErrorAction Continue
    $missingDeps = $true
}

if (!(Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed or not in PATH." -ErrorAction Continue
    Write-Host "-> Please install Docker Desktop from https://www.docker.com/" -ForegroundColor Red
    $missingDeps = $true
}

if ($missingDeps) {
    Write-Error "Missing required dependencies. Please install them and try again."
}

# 2. Install Dependencies
Write-Host "Installing dependencies (npm install)..." -ForegroundColor Yellow
# Use cmd /c to ensure npm.cmd is found if not directly executable
Start-Process -FilePath "cmd" -ArgumentList "/c npm install" -Wait -NoNewWindow
if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed." }

# 3. Start Docker Services
Write-Host "Starting Docker services (Postgres & Redis)..." -ForegroundColor Yellow
docker-compose up -d
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to start Docker services." }

# Wait for DB to be potentially ready
Write-Host "Waiting 5 seconds for Database to initialize..."
Start-Sleep -Seconds 5

# 4. Generate Prisma Client
Write-Host "Generating Prisma Client..." -ForegroundColor Yellow
Start-Process -FilePath "cmd" -ArgumentList "/c npx prisma generate" -Wait -NoNewWindow
if ($LASTEXITCODE -ne 0) { Write-Error "Prisma generate failed." }

# 5. Push Database Schema
Write-Host "Pushing database schema..." -ForegroundColor Yellow
Start-Process -FilePath "cmd" -ArgumentList "/c npx prisma db push" -Wait -NoNewWindow
if ($LASTEXITCODE -ne 0) { Write-Error "Prisma db push failed." }

# 6. Create Admin User
Write-Host "Creating/Updating Admin User..." -ForegroundColor Yellow
Start-Process -FilePath "cmd" -ArgumentList "/c npx tsx create-admin-user.ts" -Wait -NoNewWindow
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to create admin user." }

Write-Host "Setup Complete! You can now run 'npm run dev' to start the application." -ForegroundColor Green
Write-Host "Don't forget to check your .env file matches the docker-compose settings."
