// 调试WebSocket连接的脚本
// 在Chrome扩展的控制台中运行此脚本

function testWebSocketConnection() {
    const serverUrl = 'ws://127.0.0.1:8797';
    console.log('🔄 开始测试WebSocket连接到:', serverUrl);
    
    const ws = new WebSocket(serverUrl);
    
    ws.onopen = function(event) {
        console.log('✅ WebSocket连接成功!');
        console.log('连接事件:', event);
        
        // 发送测试消息
        const testMessage = {
            action: 'init',
            source: 'debug-script',
            timestamp: new Date().toISOString()
        };
        
        ws.send(JSON.stringify(testMessage));
        console.log('📤 发送测试消息:', testMessage);
    };
    
    ws.onmessage = function(event) {
        console.log('📨 收到消息:', event.data);
        try {
            const data = JSON.parse(event.data);
            console.log('📨 解析后的消息:', data);
        } catch (e) {
            console.log('📨 原始消息:', event.data);
        }
    };
    
    ws.onerror = function(error) {
        console.error('❌ WebSocket错误:', error);
        console.error('错误详情:', {
            type: error.type,
            target: error.target,
            readyState: error.target ? error.target.readyState : 'unknown'
        });
    };
    
    ws.onclose = function(event) {
        console.log('🔌 WebSocket连接关闭');
        console.log('关闭详情:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
        });
    };
    
    // 5秒后关闭连接
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            console.log('🔌 主动关闭连接');
            ws.close();
        }
    }, 5000);
    
    return ws;
}

// 检查Chrome扩展权限
function checkPermissions() {
    if (typeof chrome !== 'undefined' && chrome.permissions) {
        chrome.permissions.getAll((permissions) => {
            console.log('🔐 当前权限:', permissions);
        });
    } else {
        console.log('⚠️ 无法访问Chrome权限API');
    }
}

// 运行测试
console.log('🧪 开始WebSocket连接调试');
checkPermissions();
const testWs = testWebSocketConnection();

// 导出到全局作用域以便在控制台中使用
if (typeof window !== 'undefined') {
    window.testWebSocketConnection = testWebSocketConnection;
    window.checkPermissions = checkPermissions;
} 