const WebSocket = require('ws');

async function diagnoseConnection() {
    console.log('🔍 开始诊断 MCP WebSocket 连接问题...\n');
    
    const ports = [8795, 8796]; // 检查常用端口
    
    for (const port of ports) {
        console.log(`📊 检查端口 ${port}:`);
        
        try {
            // 尝试连接
            const ws = new WebSocket(`ws://localhost:${port}`);
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('连接超时'));
                }, 3000);
                
                ws.on('open', () => {
                    clearTimeout(timeout);
                    console.log(`  ✅ 端口 ${port} - WebSocket 连接成功`);
                    
                    // 发送测试消息
                    ws.send(JSON.stringify({
                        action: 'ping',
                        source: 'diagnostic-tool'
                    }));
                });
                
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        console.log(`  📨 端口 ${port} - 收到响应:`, message.type, message.message || '');
                        
                        // 检查是否是我们的MCP反馈服务器
                        if (message.type === 'connectionEstablished') {
                            console.log(`  🎯 端口 ${port} - 这是 MCP 反馈服务器!`);
                        } else {
                            console.log(`  ⚠️  端口 ${port} - 这可能是其他WebSocket服务`);
                        }
                    } catch (e) {
                        console.log(`  📨 端口 ${port} - 收到非JSON消息:`, data.toString().substring(0, 100));
                    }
                    
                    ws.close();
                    resolve();
                });
                
                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    console.log(`  ❌ 端口 ${port} - 连接错误:`, error.message);
                    reject(error);
                });
                
                ws.on('close', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
            
        } catch (error) {
            console.log(`  ❌ 端口 ${port} - 连接失败:`, error.message);
        }
        
        console.log(''); // 空行分隔
    }
    
    console.log('💡 诊断建议:');
    console.log('1. 如果端口8795显示连接成功但不是MCP反馈服务器，说明mcp-exchange占用了端口');
    console.log('2. 建议修改mcp-exchange配置使用其他端口，或修改我们的服务使用8796端口');
    console.log('3. 确保只有一个WebSocket服务在监听8795端口');
    console.log('\n🔧 解决方案:');
    console.log('方案1: 停止mcp-exchange服务，启动我们的MCP反馈服务器');
    console.log('方案2: 修改Chrome扩展连接到不同端口（如8796）');
    console.log('方案3: 配置mcp-exchange使用其他端口');
}

// 运行诊断
diagnoseConnection().catch(console.error); 