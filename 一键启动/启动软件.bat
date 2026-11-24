@echo off
chcp 65001 >nul
title FinanceMarvis 一键启动
cd /d "%~dp0.."

echo ============================================
echo  FinanceMarvis - 正式版一键启动
echo ============================================
echo.

netstat -ano | findstr ":8080 " >nul
if not errorlevel 1 (
    echo 检测到服务已在运行，直接打开浏览器...
    start "" http://127.0.0.1:8080
    goto :eof
)

if not exist node_modules (
    echo 首次启动：正在安装依赖，请稍候...
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :fail
)

echo 正在构建前端...
call npm run build
if errorlevel 1 goto :fail

rem 本机若开启了 7897 出海代理，则自动带给 /cboe 与 /convex 使用
netstat -ano | findstr ":7897 " >nul && set "HTTPS_PROXY=http://127.0.0.1:7897"

echo.
echo 服务地址：http://127.0.0.1:8080
echo 正在打开浏览器，关闭此窗口即可停止软件。
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 4; Start-Process 'http://127.0.0.1:8080'"

call npm run serve
goto :eof

:fail
echo.
echo 启动失败，请根据上方错误信息处理。
pause
