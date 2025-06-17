// chrome extension Background Script

class MCPFeedbackBackground {
    constructor() {
        this.mcpConnection = null;
        this.isConnected = false;
        this.feedbackData = [];
        
        // 初始化统计信息
        this.messageStats = {
            sent: 0,
            received: 0
        };
        this.connectTime = null;
        this.lastActivity = null;
        
        this.initializeExtension();
        this.setupMessageHandlers();
    }
    
    initializeExtension() {
        // 安装时的初始化
        chrome.runtime.onInstalled.addListener(() => {
            console.log('chrome extension 插件已安装');
            
            // 设置默认配置
            chrome.storage.local.set({
                mcpFeedbackConfig: {
                    mcpServerUrl: 'ws://127.0.0.1:8797',
                    autoConnect: false,
                    maxFeedbackItems: 50
                }
            });
            
            // 为所有标签页启用侧边栏
            chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
        });
    }
    
    setupMessageHandlers() {
        // 处理来自 content script 和 sidepanel 的消息
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('收到消息:', request);
            
            switch (request.action) {
                case 'connectToMCP':
                    this.handleMCPConnection(request.serverUrl)
                        .then(result => sendResponse(result))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true; // 保持消息通道开放
                    
                case 'disconnectFromMCP':
                    this.handleMCPDisconnection()
                        .then(result => sendResponse(result))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                    
                case 'submitFeedback':
                    this.handleFeedbackSubmission(request.data)
                        .then(result => sendResponse(result))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                    
                case 'getFeedbackHistory':
                    this.getFeedbackHistory()
                        .then(result => sendResponse(result))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                    
                case 'clearFeedbackHistory':
                    this.clearFeedbackHistory()
                        .then(result => sendResponse(result))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                    
                case 'getConnectionStatus':
                    sendResponse({ 
                        isConnected: this.isConnected,
                        serverUrl: this.mcpConnection?.url || null
                    });
                    break;
                    
                case 'getMCPInfo':
                    this.getMCPInfo()
                        .then(result => sendResponse(result))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                    
                case 'getConnectionStatus':
                    sendResponse({
                        success: true,
                        isConnected: this.isConnected,
                        serverUrl: this.isConnected ? this.mcpConnection?.url : null,
                        connectTime: this.connectTime,
                        lastActivity: this.lastActivity
                    });
                    break;
                    
                case 'elementCaptured':
                    // 转发元素捕获消息到侧边栏
                    console.log('📤 Background: 收到elementCaptured消息，开始转发到侧边栏');
                    console.log('🖼️ Background: 截图数据长度:', request.data?.screenshot?.length || 'undefined');
                    
                    this.broadcastToSidepanels({
                        action: 'elementCaptured',
                        data: request.data
                    });
                    
                    // 同时尝试直接向侧边栏发送消息
                    chrome.runtime.sendMessage({
                        action: 'elementCaptured',
                        data: request.data
                    }).catch((error) => {
                        console.log('📤 Background: 直接发送到侧边栏失败:', error.message);
                    });
                    
                    sendResponse({ success: true });
                    break;
                    
                case 'elementInspectionStopped':
                    // 通知侧边栏元素检查已停止
                    console.log('📨 Background: 收到元素检查停止通知，原因:', request.reason);
                    this.broadcastToSidepanels({
                        action: 'elementInspectionStopped',
                        reason: request.reason || 'unknown'
                    });
                    console.log('📤 Background: 已转发停止消息到侧边栏');
                    sendResponse({ success: true });
                    break;
                    
                case 'elementInspectionCompleted':
                    // 通知侧边栏元素检查已完成
                    console.log('Background: 收到元素检查完成通知，原因:', request.reason);
                    this.broadcastToSidepanels({
                        action: 'elementInspectionCompleted',
                        reason: request.reason || 'unknown'
                    });
                    sendResponse({ success: true });
                    break;
                    
                case 'captureElementScreenshot':
                    // 捕获当前标签页截图
                    console.log('📤 Background: 收到截图请求，开始处理...');
                    this.captureTabScreenshot()
                        .then(result => {
                            console.log('📤 Background: 截图处理完成，发送响应:', result.success);
                            sendResponse(result);
                        })
                        .catch(error => {
                            console.error('📤 Background: 截图处理失败:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                    return true;
                    
                default:
                    console.warn('未知的消息类型:', request.action);
                    sendResponse({ success: false, error: '未知的消息类型' });
            }
        });
    }
    
    async handleMCPConnection(serverUrl) {
        try {
            if (this.isConnected) {
                await this.handleMCPDisconnection();
            }
            
            console.log('🔄 开始连接到 MCP 服务器:', serverUrl);
            
            return new Promise((resolve, reject) => {
                try {
                this.mcpConnection = new WebSocket(serverUrl);
                    console.log('📡 WebSocket 对象已创建');
                    
                    // 增加连接超时时间，并添加更详细的日志
                    const connectionTimeout = setTimeout(() => {
                        if (!this.isConnected) {
                            console.error('❌ WebSocket 连接超时（10秒）');
                            if (this.mcpConnection.readyState === WebSocket.CONNECTING) {
                                console.error('   连接状态: 仍在连接中');
                            } else if (this.mcpConnection.readyState === WebSocket.CLOSED) {
                                console.error('   连接状态: 已关闭');
                            }
                            this.mcpConnection.close();
                            reject(new Error('连接超时（10秒）'));
                        }
                    }, 10000); // 增加到10秒
                
                this.mcpConnection.onopen = () => {
                        console.log('✅ WebSocket 连接已建立');
                        clearTimeout(connectionTimeout);
                    this.isConnected = true;
                    this.connectTime = new Date().toISOString();
                    this.lastActivity = new Date().toISOString();
                    
                    // 通知侧边栏连接状态变化
                    this.notifyConnectionStatus(true);
                    
                    // 发送初始化消息
                        console.log('📤 发送初始化消息到 MCP 服务器');
                    this.sendToMCP({
                            action: 'init',
                        source: 'chrome-extension',
                        timestamp: new Date().toISOString()
                    });
                    
                    resolve({ success: true, message: 'MCP 连接成功' });
                };
                
                this.mcpConnection.onmessage = (event) => {
                        console.log('📨 收到 MCP 服务器消息');
                    this.handleMCPMessage(event.data);
                };
                
                this.mcpConnection.onerror = (error) => {
                        console.error('❌ WebSocket 连接错误:', error);
                        console.error('   错误类型:', error.type);
                        console.error('   WebSocket 状态:', this.mcpConnection.readyState);
                        clearTimeout(connectionTimeout);
                    this.isConnected = false;
                        
                        // 提供更具体的错误信息
                        let errorMessage = 'WebSocket 连接失败';
                        if (error.target) {
                            const ws = error.target;
                            if (ws.readyState === WebSocket.CLOSED) {
                                errorMessage += ' - 连接被拒绝或服务器不可达';
                            } else if (ws.readyState === WebSocket.CLOSING) {
                                errorMessage += ' - 连接正在关闭';
                            }
                        }
                        
                        reject(new Error(errorMessage));
                };
                
                    this.mcpConnection.onclose = (event) => {
                        console.log('🔌 WebSocket 连接已关闭');
                        console.log('   关闭代码:', event.code);
                        console.log('   关闭原因:', event.reason);
                        console.log('   是否正常关闭:', event.wasClean);
                        clearTimeout(connectionTimeout);
                    this.isConnected = false;
                    this.notifyConnectionStatus(false);
                        
                        // 如果是非正常关闭且没有手动断开，可能需要重连
                        if (!event.wasClean && event.code !== 1000) {
                            console.warn('⚠️  非正常关闭，代码:', event.code);
                        }
                    };
                    
                } catch (createError) {
                    console.error('❌ 创建 WebSocket 连接时出错:', createError);
                    reject(new Error('无法创建 WebSocket 连接: ' + createError.message));
                    }
            });
        } catch (error) {
            console.error('❌ MCP 连接处理失败:', error);
            throw error;
        }
    }
    
    async handleMCPDisconnection() {
        try {
            if (this.mcpConnection) {
                this.mcpConnection.close();
                this.mcpConnection = null;
            }
            this.isConnected = false;
            this.notifyConnectionStatus(false);
            
            return { success: true, message: 'MCP 连接已断开' };
        } catch (error) {
            console.error('断开 MCP 连接失败:', error);
            throw error;
        }
    }
    
    handleMCPMessage(data) {
        try {
            const message = JSON.parse(data);
            console.log('📨 Background: 收到 MCP 消息:', message);
            
            // 更新统计信息
            this.messageStats.received++;
            this.lastActivity = new Date().toISOString();
            
            // 处理不同类型的消息
            switch (message.type) {
                case 'connectionEstablished':
                    console.log('📨 Background: MCP服务器连接确认:', message.message);
                    this.broadcastToSidepanels({
                        action: 'mcpConnected',
                        data: message
                    });
                    break;
                    
                case 'initConfirmed':
                    console.log('📨 Background: MCP服务器初始化确认:', message.message);
                    break;
                    
                case 'requestFeedback':
                    // MCP服务器请求用户反馈
                    console.log('📨 Background: 收到反馈请求:', message.data);
                    this.broadcastToSidepanels({
                        action: 'requestFeedback',  // 修改为与sidepanel期望的消息类型一致
                        data: message.data
                    });
                    
                    // 通知内容脚本显示反馈表单
                    this.broadcastToContentScripts({
                        action: 'showFeedbackForm',
                        data: message.data
                    });
                    break;
                    
                case 'feedbackReceived':
                    console.log('📨 Background: 处理feedbackReceived消息');
                this.broadcastToSidepanels({
                    action: 'feedbackReceived',
                    data: message
                });
                    
                    // 同时通知content script重新启用反馈表单
                    this.broadcastToContentScripts({
                        action: 'feedbackConfirmed',
                        data: message
                    });
                    break;
                    
                case 'pong':
                    // 心跳响应
                    console.log('📨 Background: 收到服务器心跳响应');
                    break;
                    
                case 'error':
                    console.error('📨 Background: MCP服务器错误:', message.content);
                    this.broadcastToSidepanels({
                        action: 'mcpError',
                        data: message
                    });
                    break;
                    
                default:
                    console.log('📨 Background: 未知的 MCP 消息类型:', message.type);
                this.broadcastToSidepanels({
                    action: 'serverMessage',
                    data: message
                });
            }
        } catch (error) {
            console.error('处理 MCP 消息失败:', error);
        }
    }
    
    async handleFeedbackSubmission(feedbackData) {
        try {
            if (!this.isConnected) {
                throw new Error('未连接到 MCP 服务器');
            }
            
            const feedback = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                url: feedbackData.url,
                title: feedbackData.title,
                text: feedbackData.textFeedback,
                images: feedbackData.images || [],
                metadata: feedbackData.metadata || {},
                pageInfo: {
                    url: feedbackData.url,
                    title: feedbackData.title
                }
            };
            
            // 发送到 MCP 服务器
            this.sendToMCP({
                action: 'submitFeedback',
                data: feedback
            });
            
            // 保存到本地历史
            this.feedbackData.push(feedback);
            await this.saveFeedbackHistory();
            
            return { 
                success: true, 
                message: '反馈已提交',
                feedbackId: feedback.id
            };
        } catch (error) {
            console.error('提交反馈失败:', error);
            throw error;
        }
    }
    
    sendToMCP(data) {
        if (this.isConnected && this.mcpConnection) {
            this.mcpConnection.send(JSON.stringify(data));
            this.messageStats.sent++;
            this.lastActivity = new Date().toISOString();
        } else {
            console.warn('MCP 未连接，无法发送消息');
        }
    }
    
    async getFeedbackHistory() {
        try {
            const result = await chrome.storage.local.get(['mcpFeedbackHistory']);
            return {
                success: true,
                data: result.mcpFeedbackHistory || []
            };
        } catch (error) {
            console.error('获取反馈历史失败:', error);
            throw error;
        }
    }
    
    async saveFeedbackHistory() {
        try {
            await chrome.storage.local.set({
                mcpFeedbackHistory: this.feedbackData
            });
        } catch (error) {
            console.error('保存反馈历史失败:', error);
            throw error;
        }
    }
    
    async clearFeedbackHistory() {
        try {
            this.feedbackData = [];
            await chrome.storage.local.remove(['mcpFeedbackHistory']);
            return { success: true, message: '反馈历史已清除' };
        } catch (error) {
            console.error('清除反馈历史失败:', error);
            throw error;
        }
    }
    
    notifyConnectionStatus(isConnected) {
        console.log('📨 Background: 通知连接状态变化:', isConnected);
        
        // 通知侧边栏
        this.broadcastToSidepanels({
            action: 'connectionStatusChanged',
            isConnected: isConnected
        });
        
        // 通知所有content script
        this.broadcastToContentScripts({
            action: 'connectionStatusChanged',
            isConnected: isConnected
        });
    }
    
    broadcastToSidepanels(message) {
        console.log('📤 Background: broadcastToSidepanels 发送消息:', message.action);
        
        // 方法1: 使用 chrome.runtime.sendMessage (用于sidepanel)
        chrome.runtime.sendMessage(message).catch((error) => {
            console.log('📤 Background: sendMessage 失败:', error.message);
        });
        
        // 方法2: 通过存储进行通信 (备用方案)
        chrome.storage.local.set({
            lastMessage: {
                ...message,
                timestamp: Date.now()
            }
        }).catch((error) => {
            console.error('📤 Background: 存储消息失败:', error);
        });
    }

    async broadcastToContentScripts(message) {
        try {
            // 获取所有标签页
            const tabs = await chrome.tabs.query({});
            console.log(`📤 Background: 向 ${tabs.length} 个标签页广播消息:`, message.action);
            
            // 向每个标签页的content script发送消息
            for (const tab of tabs) {
                try {
                    await chrome.tabs.sendMessage(tab.id, message);
                    console.log(`✅ Background: 成功发送到标签页 ${tab.id}`);
                } catch (error) {
                    // 某些标签页可能没有content script，忽略错误
                    console.log(`⚠️ Background: 标签页 ${tab.id} 无法接收消息:`, error.message);
                }
            }
        } catch (error) {
            console.error('📤 Background: 广播到content script失败:', error);
        }
    }
    
    // 捕获标签页截图
    async captureTabScreenshot() {
        try {
            console.log('🔥 Background: 开始捕获标签页截图...');
            // 获取当前活动标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                console.log('❌ Background: 无法获取当前标签页');
                throw new Error('无法获取当前标签页');
            }
            
            console.log('📄 Background: 找到标签页:', tab.id, tab.url);
            
            // 捕获可见区域截图
            const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
                format: 'png',
                quality: 90
            });
            
            console.log('✅ Background: 截图成功，数据长度:', dataUrl.length);
            console.log('🖼️ Background: 数据前缀:', dataUrl.substring(0, 50));
            
            return {
                success: true,
                screenshot: dataUrl
            };
        } catch (error) {
            console.log('💥 Background: 捕获截图失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async getMCPInfo() {
        if (!this.isConnected || !this.mcpConnection) {
            throw new Error('MCP服务器未连接');
        }
        
        // 收集MCP服务器信息
        const mcpInfo = {
            version: 'MCP v1.0', // 可以从服务器获取实际版本
            connectTime: this.connectTime || new Date().toISOString(),
            serverUrl: this.mcpConnection.url,
            readyState: this.mcpConnection.readyState,
            sentCount: this.messageStats?.sent || 0,
            receivedCount: this.messageStats?.received || 0,
            lastActivity: this.lastActivity || new Date().toISOString()
        };
        
        return {
            success: true,
            data: mcpInfo
        };
    }
}

// 初始化背景脚本
const mcpFeedbackBackground = new MCPFeedbackBackground();

// 导出用于测试
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MCPFeedbackBackground;
}