@echo off
chcp 65001 >nul
title FinanceMarvis 开发模式
cd /d "%~dp0.."

echo ============================================
echo  FinanceMarvis - 开发模式（热更新）
echo ============================================
echo.

if not exist node_modules (
    echo 首次启动：正在安装依赖，请稍候...
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :fail
)

rem 本机若开启了 7897 出海代理，则自动带给 /cboe 与 /convex 使用
netstat -ano | findstr ":7897 " >nul && set "HTTPS_PROXY=http://127.0.0.1:7897"

echo.
echo 开发地址：http://localhost:5173
echo 修改代码后页面会自动刷新，关闭此窗口即可停止。
call npm run dev -- --open
goto :eof

:fail
echo.
echo 启动失败，请根据上方错误信息处理。
pause
