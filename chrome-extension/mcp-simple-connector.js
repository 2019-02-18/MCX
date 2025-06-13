/**
 * 简化的MCP连接器
 * 直接调用本地MCP服务，类似mcp-feedback-enhanced的工作方式
 */
class SimpleMCPConnector {
    constructor() {
        this.isConnected = false;
        this.serverUrl = 'http://127.0.0.1:8797'; // HTTP服务器地址
        this.feedbackCallbacks = new Map();
    }

    /**
     * 连接到MCP服务
     */
    async connect() {
        try {
            console.log('🔄 连接到简化MCP服务...');
            
            // 测试连接
            const response = await fetch(`${this.serverUrl}/status`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok || response.status === 404) {
                // 404也算连接成功，因为服务器在运行
                this.isConnected = true;
                console.log('✅ 简化MCP服务连接成功');
                return true;
            } else {
                throw new Error('服务器响应异常');
            }
        } catch (error) {
            console.error('❌ 连接失败:', error);
            this.isConnected = false;
            throw new Error(`连接失败: ${error.message}`);
        }
    }

    /**
     * 断开连接
     */
    disconnect() {
        this.isConnected = false;
        this.feedbackCallbacks.clear();
        console.log('🔌 简化MCP连接已断开');
    }

    /**
     * 提交反馈
     */
    async submitFeedback(feedbackData) {
        if (!this.isConnected) {
            throw new Error('MCP服务未连接');
        }

        try {
            console.log('📤 提交反馈到MCP服务:', feedbackData);

            const response = await fetch(`${this.serverUrl}/feedback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    feedbackId: Date.now().toString(),
                    text: feedbackData.text || '',
                    images: feedbackData.images || [],
                    timestamp: new Date().toISOString(),
                    source: 'chrome-extension',
                    metadata: {
                        url: feedbackData.url,
                        title: feedbackData.title,
                        userAgent: navigator.userAgent
                    }
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ 反馈提交成功:', result);
                return result;
            } else {
                throw new Error('提交失败');
            }
        } catch (error) {
            console.error('❌ 提交反馈失败:', error);
            throw error;
        }
    }

    /**
     * 模拟interactive_feedback工具的行为
     */
    async requestInteractiveFeedback(summary, timeout = 600) {
        if (!this.isConnected) {
            throw new Error('MCP服务未连接');
        }

        console.log('🎯 请求交互式反馈...');
        console.log('📝 摘要:', summary);

        // 显示反馈界面
        return new Promise((resolve, reject) => {
            const feedbackId = Date.now().toString();
            
            // 存储回调
            this.feedbackCallbacks.set(feedbackId, { resolve, reject });

            // 显示反馈表单
            this.showFeedbackForm(feedbackId, summary);

            // 设置超时
            setTimeout(() => {
                if (this.feedbackCallbacks.has(feedbackId)) {
                    this.feedbackCallbacks.delete(feedbackId);
                    reject(new Error('反馈超时'));
                }
            }, timeout * 1000);
        });
    }

    /**
     * 显示反馈表单
     */
    showFeedbackForm(feedbackId, summary) {
        // 通知sidepanel显示反馈表单
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({
                action: 'showFeedbackForm',
                data: {
                    feedbackId,
                    summary,
                    timestamp: new Date().toISOString()
                }
            });
        }

        // 如果在sidepanel中，直接显示
        if (window.location.pathname.includes('sidepanel.html')) {
            this.displayFeedbackInSidepanel(feedbackId, summary);
        }
    }

    /**
     * 在sidepanel中显示反馈表单
     */
    displayFeedbackInSidepanel(feedbackId, summary) {
        // 创建反馈显示区域
        const existingFeedback = document.getElementById('mcp-feedback-display');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        const feedbackDisplay = document.createElement('div');
        feedbackDisplay.id = 'mcp-feedback-display';
        feedbackDisplay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;

        feedbackDisplay.innerHTML = `
            <div style="
                background: white;
                border-radius: 10px;
                padding: 30px;
                max-width: 600px;
                width: 100%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <h2 style="margin: 0 0 20px 0; color: #333;">🤖 AI 请求反馈</h2>
                
                <div style="
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    border-left: 4px solid #007bff;
                ">
                    <h3 style="margin: 0 0 10px 0; color: #333;">AI 工作摘要:</h3>
                    <div style="color: #666; line-height: 1.6; white-space: pre-wrap;">${summary}</div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #333;">
                        您的反馈:
                    </label>
                    <textarea 
                        id="mcp-feedback-text-${feedbackId}"
                        style="
                            width: 100%;
                            min-height: 120px;
                            padding: 12px;
                            border: 2px solid #ddd;
                            border-radius: 6px;
                            font-family: inherit;
                            font-size: 14px;
                            resize: vertical;
                        "
                        placeholder="请输入您的反馈、建议或问题..."
                    ></textarea>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button 
                        onclick="window.simpleMCPConnector.submitMCPFeedback('${feedbackId}', '')"
                        style="
                            padding: 10px 20px;
                            border: 1px solid #ddd;
                            background: #f8f9fa;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                        "
                    >
                        跳过
                    </button>
                    <button 
                        onclick="window.simpleMCPConnector.submitMCPFeedback('${feedbackId}')"
                        style="
                            padding: 10px 20px;
                            border: none;
                            background: #007bff;
                            color: white;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                        "
                    >
                        提交反馈
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(feedbackDisplay);

        // 聚焦到文本框
        setTimeout(() => {
            const textarea = document.getElementById(`mcp-feedback-text-${feedbackId}`);
            if (textarea) {
                textarea.focus();
            }
        }, 100);
    }

    /**
     * 提交MCP反馈
     */
    async submitMCPFeedback(feedbackId, text = null) {
        try {
            if (text === null) {
                const textarea = document.getElementById(`mcp-feedback-text-${feedbackId}`);
                text = textarea ? textarea.value.trim() : '';
            }

            console.log('📤 提交MCP反馈:', { feedbackId, text });

            // 移除反馈显示
            const feedbackDisplay = document.getElementById('mcp-feedback-display');
            if (feedbackDisplay) {
                feedbackDisplay.remove();
            }

            // 调用回调
            if (this.feedbackCallbacks.has(feedbackId)) {
                const { resolve } = this.feedbackCallbacks.get(feedbackId);
                this.feedbackCallbacks.delete(feedbackId);
                
                resolve({
                    text: text,
                    timestamp: new Date().toISOString(),
                    source: 'chrome-extension'
                });
            }

            // 同时提交到服务器
            await this.submitFeedback({
                text: text,
                url: window.location.href,
                title: document.title
            });

        } catch (error) {
            console.error('❌ 提交MCP反馈失败:', error);
            
            if (this.feedbackCallbacks.has(feedbackId)) {
                const { reject } = this.feedbackCallbacks.get(feedbackId);
                this.feedbackCallbacks.delete(feedbackId);
                reject(error);
            }
        }
    }

    /**
     * 获取连接状态
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            serverUrl: this.serverUrl,
            type: 'simple-mcp-connector'
        };
    }
}

// 全局实例
if (typeof window !== 'undefined') {
    window.SimpleMCPConnector = SimpleMCPConnector;
    window.simpleMCPConnector = new SimpleMCPConnector();
} 