/**
 * Cursor MCP 适配器
 * 专门用于连接和通信 Cursor 的 MCP Tools 服务
 */
class CursorMCPAdapter {
    constructor() {
        this.isConnected = false;
        this.messageId = 1;
        this.pendingRequests = new Map();
        this.capabilities = {};
        this.sessionId = null;
        this.eventSource = null;
        this.messageEndpoint = null;
        this.serverUrl = null;
        this.tools = [];
    }

    /**
     * 连接到 Cursor MCP 服务
     * @param {string} serverUrl - MCP 服务器 URL
     */
    async connect(serverUrl) {
        this.serverUrl = serverUrl;
        console.log('🎯 开始连接到 Cursor MCP 服务:', serverUrl);

        try {
            // 检测连接类型并尝试连接
            if (this.isWebSocketUrl(serverUrl)) {
                return await this.connectViaWebSocket(serverUrl);
            } else {
                return await this.connectViaHTTP(serverUrl);
            }
        } catch (error) {
            console.error('❌ Cursor MCP 连接失败:', error);
            throw error;
        }
    }

    /**
     * 检测是否是 WebSocket URL
     */
    isWebSocketUrl(url) {
        return url.startsWith('ws://') || url.startsWith('wss://');
    }

    /**
     * 通过 WebSocket 连接（如果 Cursor 支持）
     */
    async connectViaWebSocket(serverUrl) {
        console.log('🔄 尝试 WebSocket 连接');
        
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(serverUrl);
            
            ws.onopen = () => {
                console.log('✅ WebSocket 连接成功');
                this.ws = ws;
                this.sendInitializeRequest()
                    .then(() => resolve(true))
                    .catch(reject);
            };

            ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            ws.onerror = (error) => {
                console.error('❌ WebSocket 连接失败:', error);
                reject(new Error('WebSocket 连接失败'));
            };

            ws.onclose = () => {
                console.log('🔌 WebSocket 连接已关闭');
                this.isConnected = false;
            };
        });
    }

    /**
     * 通过 HTTP/SSE 连接
     */
    async connectViaHTTP(serverUrl) {
        console.log('🔄 尝试 HTTP/SSE 连接');
        
        // 转换 WebSocket URL 为 HTTP URL
        const httpUrl = serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
        
        try {
            // 首先尝试 Streamable HTTP
            const streamableResult = await this.tryStreamableHTTP(httpUrl);
            if (streamableResult) {
                return streamableResult;
            }

            // 然后尝试传统的 SSE
            return await this.trySSEConnection(httpUrl);
        } catch (error) {
            console.error('❌ HTTP 连接失败:', error);
            throw error;
        }
    }

    /**
     * 尝试 Streamable HTTP 连接
     */
    async tryStreamableHTTP(httpUrl) {
        console.log('🔄 尝试 Streamable HTTP 连接');
        
        const initRequest = {
            jsonrpc: "2.0",
            id: this.getNextMessageId(),
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {
                    tools: {},
                    resources: {},
                    prompts: {},
                    sampling: {}
                },
                clientInfo: {
                    name: "Chrome Extension MCP Client",
                    version: "1.0.0"
                }
            }
        };

        try {
            const response = await fetch(httpUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/event-stream'
                },
                body: JSON.stringify(initRequest)
            });

            if (response.ok) {
                const contentType = response.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                    const result = await response.json();
                    this.handleInitializeResponse(result);
                    this.messageEndpoint = httpUrl;
                    this.isConnected = true;
                    console.log('✅ Streamable HTTP 连接成功');
                    return true;
                } else if (contentType && contentType.includes('text/event-stream')) {
                    this.handleSSEStream(response);
                    this.messageEndpoint = httpUrl;
                    this.isConnected = true;
                    console.log('✅ Streamable HTTP (SSE) 连接成功');
                    return true;
                }
            }
        } catch (error) {
            console.log('⚠️ Streamable HTTP 连接失败，尝试其他方式');
        }

        return false;
    }

    /**
     * 尝试传统的 SSE 连接
     */
    async trySSEConnection(httpUrl) {
        console.log('🔄 尝试传统 SSE 连接');
        
        // 尝试不同的 SSE 端点
        const sseEndpoints = [
            `${httpUrl}/sse`,
            `${httpUrl}`,
            `${httpUrl}/mcp`
        ];

        for (const endpoint of sseEndpoints) {
            try {
                const success = await this.connectToSSEEndpoint(endpoint);
                if (success) {
                    return true;
                }
            } catch (error) {
                console.log(`⚠️ SSE 端点 ${endpoint} 连接失败:`, error.message);
            }
        }

        throw new Error('所有 SSE 端点连接失败');
    }

    /**
     * 连接到特定的 SSE 端点
     */
    async connectToSSEEndpoint(endpoint) {
        return new Promise((resolve, reject) => {
            console.log('🔄 连接到 SSE 端点:', endpoint);
            
            const eventSource = new EventSource(endpoint);
            let connected = false;

            const timeout = setTimeout(() => {
                if (!connected) {
                    eventSource.close();
                    reject(new Error('SSE 连接超时'));
                }
            }, 10000);

            eventSource.onopen = () => {
                console.log('✅ SSE 连接已建立');
                connected = true;
                clearTimeout(timeout);
                this.eventSource = eventSource;
            };

            eventSource.addEventListener('endpoint', (event) => {
                console.log('📨 收到 endpoint 事件:', event.data);
                this.messageEndpoint = event.data;
                this.initializeSSESession()
                    .then(() => {
                        this.isConnected = true;
                        resolve(true);
                    })
                    .catch(reject);
            });

            eventSource.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('❌ 解析 SSE 消息失败:', error);
                }
            });

            eventSource.onerror = (error) => {
                console.error('❌ SSE 连接错误:', error);
                clearTimeout(timeout);
                eventSource.close();
                if (!connected) {
                    reject(new Error('SSE 连接失败'));
                }
            };
        });
    }

    /**
     * 初始化 SSE 会话
     */
    async initializeSSESession() {
        if (!this.messageEndpoint) {
            throw new Error('没有消息端点');
        }

        const initRequest = {
            jsonrpc: "2.0",
            id: this.getNextMessageId(),
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {
                    tools: {},
                    resources: {},
                    prompts: {},
                    sampling: {}
                },
                clientInfo: {
                    name: "Chrome Extension MCP Client",
                    version: "1.0.0"
                }
            }
        };

        const response = await fetch(this.messageEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(initRequest)
        });

        if (response.ok) {
            const result = await response.json();
            this.handleInitializeResponse(result);
            console.log('✅ SSE 会话初始化成功');
        } else {
            throw new Error('SSE 会话初始化失败');
        }
    }

    /**
     * 发送初始化请求
     */
    async sendInitializeRequest() {
        const initRequest = {
            jsonrpc: "2.0",
            id: this.getNextMessageId(),
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {
                    tools: {},
                    resources: {},
                    prompts: {},
                    sampling: {}
                },
                clientInfo: {
                    name: "Chrome Extension MCP Client",
                    version: "1.0.0"
                }
            }
        };

        return this.sendRequest(initRequest);
    }

    /**
     * 处理初始化响应
     */
    handleInitializeResponse(response) {
        console.log('📨 收到初始化响应:', response);
        
        if (response.result) {
            this.capabilities = response.result.capabilities || {};
            this.sessionId = response.result.sessionId;
            
            console.log('✅ MCP 初始化成功');
            console.log('🔧 服务器能力:', this.capabilities);
            
            // 发送 initialized 通知
            this.sendNotification("notifications/initialized");
            
            // 获取工具列表
            this.requestToolsList();
        } else if (response.error) {
            console.error('❌ 初始化失败:', response.error);
            throw new Error(`初始化失败: ${response.error.message}`);
        }
    }

    /**
     * 请求工具列表
     */
    async requestToolsList() {
        const request = {
            jsonrpc: "2.0",
            id: this.getNextMessageId(),
            method: "tools/list"
        };

        try {
            const result = await this.sendRequest(request);
            this.tools = result.tools || [];
            console.log('🔧 可用工具:', this.tools);
            return this.tools;
        } catch (error) {
            console.error('❌ 获取工具列表失败:', error);
            return [];
        }
    }

    /**
     * 调用工具
     */
    async callTool(toolName, args) {
        const request = {
            jsonrpc: "2.0",
            id: this.getNextMessageId(),
            method: "tools/call",
            params: {
                name: toolName,
                arguments: args
            }
        };

        return this.sendRequest(request);
    }

    /**
     * 发送请求并等待响应
     */
    async sendRequest(request) {
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(request.id, { resolve, reject });
            this.sendMessage(request);
            
            // 设置超时
            setTimeout(() => {
                if (this.pendingRequests.has(request.id)) {
                    this.pendingRequests.delete(request.id);
                    reject(new Error('请求超时'));
                }
            }, 30000);
        });
    }

    /**
     * 发送通知
     */
    sendNotification(method, params = {}) {
        const notification = {
            jsonrpc: "2.0",
            method: method,
            params: params
        };

        this.sendMessage(notification);
    }

    /**
     * 发送消息
     */
    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else if (this.messageEndpoint) {
            fetch(this.messageEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.sessionId && { 'Mcp-Session-Id': this.sessionId })
                },
                body: JSON.stringify(message)
            }).catch(error => {
                console.error('❌ 发送 HTTP 消息失败:', error);
            });
        } else {
            console.error('❌ 没有可用的连接方式');
        }
    }

    /**
     * 处理收到的消息
     */
    handleMessage(message) {
        console.log('📨 收到 MCP 消息:', message);

        // 处理响应
        if (message.id && this.pendingRequests.has(message.id)) {
            const { resolve, reject } = this.pendingRequests.get(message.id);
            this.pendingRequests.delete(message.id);

            if (message.error) {
                reject(new Error(message.error.message));
            } else {
                resolve(message.result);
            }
            return;
        }

        // 处理通知
        switch (message.method) {
            case 'notifications/message':
                console.log('🔔 收到通知:', message.params);
                break;
            case 'tools/list':
                this.tools = message.result?.tools || [];
                console.log('🔧 工具列表更新:', this.tools);
                break;
            default:
                console.log('📝 未处理的消息类型:', message.method);
        }
    }

    /**
     * 处理 SSE 流
     */
    handleSSEStream(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const readStream = () => {
            reader.read().then(({ done, value }) => {
                if (done) {
                    console.log('📡 SSE 流结束');
                    return;
                }

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            this.handleMessage(data);
                        } catch (error) {
                            console.error('❌ 解析 SSE 数据失败:', error);
                        }
                    }
                }

                readStream();
            });
        };

        readStream();
    }

    /**
     * 获取下一个消息 ID
     */
    getNextMessageId() {
        return this.messageId++;
    }

    /**
     * 断开连接
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        this.isConnected = false;
        this.messageEndpoint = null;
        this.sessionId = null;
        this.pendingRequests.clear();
        
        console.log('🔌 Cursor MCP 连接已断开');
    }

    /**
     * 获取连接状态
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            serverUrl: this.serverUrl,
            sessionId: this.sessionId,
            capabilities: this.capabilities,
            tools: this.tools,
            messageEndpoint: this.messageEndpoint
        };
    }
}

// 导出适配器
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CursorMCPAdapter;
} else if (typeof window !== 'undefined') {
    window.CursorMCPAdapter = CursorMCPAdapter;
} 