@echo off
chcp 65001 >nul
echo ========================================
echo    Instant Snap 测试环境启动脚本
echo ========================================
echo.

echo 1. 检查 Node.js 环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 未找到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js 环境正常

echo.
echo 2. 检查依赖包...
if not exist "node_modules" (
    echo 📦 安装依赖包...
    npm install
    if errorlevel 1 (
        echo ❌ 依赖包安装失败
        pause
        exit /b 1
    )
)
echo ✅ 依赖包已就绪

echo.
echo 3. 启动 MCP 服务器...
echo 🚀 MCP 服务器正在启动 (端口: 8795)
echo 📝 WebSocket 地址: ws://localhost:8795
echo.
echo 💡 使用说明:
echo    1. 在 Chrome 中打开: file:///%CD%/test-page.html
echo    2. 安装并启用 Chrome 插件 (chrome-extension 文件夹)
echo    3. 点击插件图标开始测试
echo    4. 按 Ctrl+C 停止服务器
echo.
echo ========================================
echo 服务器日志:
echo ========================================

node mcp-server.js