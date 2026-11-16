@echo off
setlocal enabledelayedexpansion

title Instagrous - GitHub Sync Tool
color 0b

echo ==============================================================
echo                 INSTAGROUS - GITHUB SYNC
echo ==============================================================
echo.
echo Target Repository: https://github.com/jakemusicartist-stack/iassist.git
echo Working Directory: %~dp0
echo.

cd /d "%~dp0"

:: Check git availability
where git >nul 2>nul
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Git is not installed or not in your system PATH.
    echo Please install Git from https://git-scm.com and try again.
    echo.
    pause
    exit /b 1
)

:: Initialize git repository if not present
if not exist ".git" (
    echo [*] Initializing fresh Git repository...
    git init -b main
    if %errorlevel% neq 0 (
        color 0c
        echo [ERROR] Failed to initialize git repository.
        pause
        exit /b 1
    )
)

:: Set remote origin
git remote get-url origin >nul 2>nul
if %errorlevel% neq 0 (
    echo [*] Adding remote origin: https://github.com/jakemusicartist-stack/iassist.git
    git remote add origin https://github.com/jakemusicartist-stack/iassist.git
) else (
    echo [*] Updating remote origin URL...
    git remote set-url origin https://github.com/jakemusicartist-stack/iassist.git
)

:: Stage all files
echo [*] Staging all files...
git add -A

:: Check if there are changes to commit
git status --porcelain | findstr /R "." >nul
if %errorlevel% equ 0 (
    echo [*] Committing files...
    git commit -m "Instagrous v0.1.0 - Clean release replacing legacy iassist"
) else (
    echo [*] No local file changes detected since last commit.
)

:: Push to remote and replace previous history/files
echo.
echo ==============================================================
echo [*] Pushing to GitHub (force replacing previous content)...
echo ==============================================================
echo.

git branch -M main
git push -u origin main --force

if %errorlevel% equ 0 (
    color 0a
    echo.
    echo ==============================================================
    echo [SUCCESS] Instagrous has been pushed to GitHub successfully!
    echo URL: https://github.com/jakemusicartist-stack/iassist
    echo ==============================================================
) else (
    color 0c
    echo.
    echo ==============================================================
    echo [FAILED] Push failed.
    echo If prompted, please check your GitHub login or Personal Access Token permissions.
    echo ==============================================================
)

echo.
pause
