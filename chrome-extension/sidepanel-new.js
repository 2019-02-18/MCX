class MCPFeedbackSidePanel {
    constructor() {
        this.isConnected = false;
        this.mcpSocket = null;
        this.feedbackHistory = [];
        this.selectedFiles = [];
        this.currentFeedbackRequest = null;  // 存储当前的AI反馈请求
        
        this.settings = {
            serverUrl: 'ws://127.0.0.1:8797',
            autoConnect: true,
            maxHistory: 100
        };
        
        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadHistory();
        this.initializeElements();
        this.setupEventListeners();
        this.setupSettingsEvents();
        this.setupCollapsibleSections();
        this.updateUI();
        this.updateHistoryDisplay();
        
        if (this.settings.autoConnect) {
            setTimeout(() => this.connectToMCP(), 1000);
        }
    }

    initializeElements() {
        // 连接相关元素
        this.connectBtn = document.getElementById('connectBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.serverUrlInput = document.getElementById('serverUrl');
        this.connectionStatus = document.querySelector('.status-indicator');
        this.statusText = document.getElementById('statusText');
        
        // 反馈相关元素
        this.feedbackText = document.getElementById('feedbackText');
        this.submitFeedbackBtn = document.getElementById('submitFeedbackBtn');
        this.captureElementBtn = document.getElementById('captureElementBtn');
        this.takeScreenshotBtn = document.getElementById('takeScreenshotBtn');
        this.imageUpload = document.getElementById('imageUpload');
        this.imagePreviews = document.getElementById('imagePreviews');
        this.pasteArea = document.getElementById('pasteArea');
        
        // 历史记录元素
        this.historyList = document.getElementById('historyList');
        this.clearHistoryBtn = document.getElementById('clearHistoryBtn');
        
        // 通知元素
        this.notification = document.getElementById('notification');
    }

    setupEventListeners() {
        // 连接事件
        if (this.connectBtn) {
            this.connectBtn.addEventListener('click', () => this.connectToMCP());
        }
        if (this.disconnectBtn) {
            this.disconnectBtn.addEventListener('click', () => this.disconnectFromMCP());
        }
        
        // 反馈事件
        if (this.submitFeedbackBtn) {
            this.submitFeedbackBtn.addEventListener('click', () => this.submitFeedback());
        }
        if (this.captureElementBtn) {
            this.captureElementBtn.addEventListener('click', () => this.captureElement());
        }
        if (this.takeScreenshotBtn) {
            this.takeScreenshotBtn.addEventListener('click', () => this.takeScreenshot());
        }
        
        // 图片上传事件
        if (this.imageUpload) {
            this.imageUpload.addEventListener('change', (e) => this.handleImageUpload(e));
        }
        
        // 粘贴事件
        document.addEventListener('paste', (e) => this.handleImagePaste(e));
        
        // 拖拽事件
        if (this.pasteArea) {
            this.pasteArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.pasteArea.classList.add('drag-over');
            });
            
            this.pasteArea.addEventListener('dragleave', (e) => {
                e.preventDefault();
                this.pasteArea.classList.remove('drag-over');
            });
            
            this.pasteArea.addEventListener('drop', (e) => {
                e.preventDefault();
                this.pasteArea.classList.remove('drag-over');
                
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    Array.from(files).forEach(file => {
                        this.addImageFile(file);
                    });
                }
            });
        }
        
        // 历史记录事件
        if (this.clearHistoryBtn) {
            this.clearHistoryBtn.addEventListener('click', () => this.clearHistory());
        }
        
        // 消息监听
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
        });
        
        // 添加存储监听器作为备用消息传递方案
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (changes.lastMessage && namespace === 'local') {
                const message = changes.lastMessage.newValue;
                if (message && Date.now() - message.timestamp < 5000) { // 5秒内的消息
                    console.log('📨 Sidepanel: 通过存储接收到消息:', message.action);
                    this.handleMessage(message);
                }
            }
        });
    }

    async connectToMCP() {
        try {
            if (this.connectBtn) this.connectBtn.disabled = true;
            
            const serverUrl = (this.serverUrlInput ? this.serverUrlInput.value.trim() : '') || this.settings.serverUrl;
            
            this.showNotification('正在连接到MCP Chrome Feedback服务...', 'info');
            
            // 创建WebSocket连接
            this.mcpSocket = new WebSocket(serverUrl);
            
            this.mcpSocket.onopen = () => {
                this.isConnected = true;
                this.updateConnectionStatus('connected', '已连接到MCP服务');
                this.showNotification('成功连接到MCP Chrome Feedback服务！', 'success');
                
                // 发送初始化消息
                this.sendWebSocketMessage({
                    action: 'init',
                    clientType: 'chrome-extension',
                    source: 'chrome-extension',
                    timestamp: new Date().toISOString()
                });
                
                this.updateUI();
            };
            
            this.mcpSocket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMCPMessage(message);
                } catch (error) {
                    console.error('❌ 解析MCP消息失败:', error);
                }
            };
            
            this.mcpSocket.onclose = () => {
                this.isConnected = false;
                this.updateConnectionStatus('disconnected', '连接已断开');
                this.showNotification('MCP连接已断开', 'warning');
                this.updateUI();
            };
            
            this.mcpSocket.onerror = (error) => {
                console.error('❌ WebSocket错误:', error);
                this.isConnected = false;
                this.updateConnectionStatus('disconnected', '连接错误');
                this.showNotification('连接失败，请检查MCP服务是否运行', 'error');
                this.updateUI();
            };
            
            this.settings.serverUrl = serverUrl;
            
        } catch (error) {
            console.error('❌ 连接MCP失败:', error);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', '连接失败: ' + error.message);
            this.showNotification('连接失败: ' + error.message, 'error');
        } finally {
            if (this.connectBtn) this.connectBtn.disabled = false;
        }
    }

    async disconnectFromMCP() {
        try {
            if (this.disconnectBtn) this.disconnectBtn.disabled = true;
            
            if (this.mcpSocket) {
                this.mcpSocket.close();
                this.mcpSocket = null;
            }
            
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', '已断开连接');
            this.showNotification('已断开MCP连接', 'info');
            this.updateUI();
            
        } catch (error) {
            console.error('❌ 断开连接失败:', error);
            this.showNotification('断开连接失败: ' + error.message, 'error');
        } finally {
            if (this.disconnectBtn) this.disconnectBtn.disabled = false;
        }
    }

    handleMCPMessage(message) {
        console.log('📨 收到MCP消息:', message);
        
        switch (message.type) {
            case 'connectionEstablished':
                console.log('✅ MCP连接已建立');
                break;
                
            case 'initConfirmed':
                console.log('✅ MCP初始化确认');
                break;
                
            case 'requestFeedback':
                this.handleFeedbackRequest(message.data);
                break;
                
            default:
                console.log('🔄 未知MCP消息类型:', message.type);
        }
    }

    handleFeedbackRequest(data) {
        console.log('🎯 收到反馈请求:', data);
        
        const { feedbackId, summary, timeout } = data;
        
        // 存储当前反馈请求信息
        this.currentFeedbackRequest = {
            feedbackId,
            summary,
            timeout,
            timestamp: new Date().toISOString()
        };
        
        // 在AI处理信息区域显示消息
        this.displayAIMessage(summary, feedbackId);
        
        // 启用反馈提交功能
        this.enableFeedbackSubmission();
        
        // 显示通知
        this.showNotification('收到AI反馈请求，请在下方提交您的反馈', 'info');
        
        // 设置超时自动清除 (确保使用服务器发送的超时时间，默认600秒)
        const timeoutMs = (timeout || 600) * 1000;
        setTimeout(() => {
            if (this.currentFeedbackRequest && this.currentFeedbackRequest.feedbackId === feedbackId) {
                this.clearCurrentFeedbackRequest();
                this.showNotification(`反馈请求已超时 (${timeout || 600}秒)`, 'warning');
            }
        }, timeoutMs);
    }

    displayAIMessage(summary, feedbackId) {
        const aiResults = document.getElementById('aiResults');
        if (!aiResults) return;

        // 清空现有内容
        aiResults.innerHTML = '';
        
        // 创建AI消息显示
        const messageDiv = document.createElement('div');
        messageDiv.className = 'ai-result active-request';
        messageDiv.style.cssText = `
            background: #e3f2fd;
            border: 2px solid #2196f3;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            position: relative;
        `;
        
        messageDiv.innerHTML = `
            <div class="timestamp">${new Date().toLocaleString()} - AI 工作摘要</div>
            <div class="content" style="margin-top: 8px; line-height: 1.6;">${summary}</div>
            <div style="margin-top: 12px; padding: 8px; background: rgba(33, 150, 243, 0.1); border-radius: 4px; font-size: 13px; color: #1976d2;">
                <strong>💡 请在下方"反馈收集"区域输入您的反馈内容，然后点击"提交反馈"按钮</strong>
            </div>
        `;
        
        aiResults.appendChild(messageDiv);
        
        // 滚动到AI处理信息区域
        const aiSection = document.querySelector('[data-section="results"]');
        if (aiSection) {
            aiSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    enableFeedbackSubmission() {
        // 启用反馈相关按钮
        if (this.submitFeedbackBtn) {
            this.submitFeedbackBtn.disabled = false;
            this.submitFeedbackBtn.textContent = '提交反馈给AI';
            this.submitFeedbackBtn.style.background = '#4caf50';
            this.submitFeedbackBtn.style.borderColor = '#4caf50';
        }
        
        // 聚焦到反馈文本框
        if (this.feedbackText) {
            this.feedbackText.focus();
            this.feedbackText.placeholder = '请输入您对AI工作的反馈、建议或问题...';
        }
        
        // 展开反馈收集区域
        const feedbackSection = document.querySelector('[data-section="feedback"]').nextElementSibling;
        const feedbackHeader = document.querySelector('[data-section="feedback"]');
        if (feedbackSection && feedbackSection.classList.contains('collapsed')) {
            feedbackSection.classList.remove('collapsed');
            feedbackHeader.classList.remove('collapsed');
            feedbackHeader.querySelector('.chevron').textContent = '▼';
        }
    }

    clearCurrentFeedbackRequest() {
        this.currentFeedbackRequest = null;
        
        // 恢复提交按钮状态
        if (this.submitFeedbackBtn) {
            this.submitFeedbackBtn.textContent = '提交反馈';
            this.submitFeedbackBtn.style.background = '';
            this.submitFeedbackBtn.style.borderColor = '';
        }
        
        // 恢复反馈文本框
        if (this.feedbackText) {
            this.feedbackText.placeholder = '请输入您的反馈内容...';
        }
        
        // 移除active-request样式
        const activeRequest = document.querySelector('.active-request');
        if (activeRequest) {
            activeRequest.classList.remove('active-request');
            activeRequest.style.background = '#f3f2f1';
            activeRequest.style.border = '1px solid #edebe9';
        }
    }



    sendWebSocketMessage(message) {
        if (this.mcpSocket && this.mcpSocket.readyState === WebSocket.OPEN) {
            this.mcpSocket.send(JSON.stringify(message));
        } else {
            console.error('❌ WebSocket未连接，无法发送消息');
        }
    }

    updateConnectionStatus(status, text) {
        if (this.statusText) this.statusText.textContent = text;
        
        if (this.connectionStatus) {
            // 移除所有状态类
            this.connectionStatus.classList.remove('status-connected', 'status-disconnected', 'status-connecting');
            // 添加当前状态类
            this.connectionStatus.classList.add(`status-${status}`);
        }
    }

    updateUI() {
        // 更新连接相关按钮状态
        if (this.connectBtn) this.connectBtn.disabled = this.isConnected;
        if (this.disconnectBtn) this.disconnectBtn.disabled = !this.isConnected;
        
        // 更新反馈相关按钮状态
        if (this.captureElementBtn) this.captureElementBtn.disabled = !this.isConnected;
        if (this.takeScreenshotBtn) this.takeScreenshotBtn.disabled = !this.isConnected;
        if (this.submitFeedbackBtn) this.submitFeedbackBtn.disabled = !this.isConnected;
        
        // 更新服务器地址输入框
        if (this.serverUrlInput && this.serverUrlInput.value !== this.settings.serverUrl) {
            this.serverUrlInput.value = this.settings.serverUrl;
        }
    }

    showNotification(message, type = 'info') {
        if (this.notification) {
            this.notification.textContent = message;
            this.notification.className = `notification ${type}`;
            this.notification.classList.add('show');
            
            setTimeout(() => {
                this.notification.classList.remove('show');
            }, 3000);
        }
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get('mcpFeedbackSettings');
            if (result.mcpFeedbackSettings) {
                this.settings = { ...this.settings, ...result.mcpFeedbackSettings };
            }
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    }

    async saveSettings() {
        try {
            await chrome.storage.local.set({ mcpFeedbackSettings: this.settings });
        } catch (error) {
            console.error('保存设置失败:', error);
        }
    }

    async loadHistory() {
        try {
            const result = await chrome.storage.local.get('mcpFeedbackHistory');
            if (result.mcpFeedbackHistory) {
                this.feedbackHistory = result.mcpFeedbackHistory;
            }
        } catch (error) {
            console.error('加载历史记录失败:', error);
        }
    }

    async saveHistory() {
        try {
            await chrome.storage.local.set({ mcpFeedbackHistory: this.feedbackHistory });
        } catch (error) {
            console.error('保存历史记录失败:', error);
        }
    }

    clearHistory() {
        if (confirm('确定要清空所有历史记录吗？')) {
            this.feedbackHistory = [];
            this.saveHistory();
            this.updateHistoryDisplay();
            this.showNotification('历史记录已清空', 'success');
        }
    }

    // 图片上传处理
    handleImageUpload(event) {
        const files = event.target.files;
        if (files.length > 0) {
            Array.from(files).forEach(file => {
                this.addImageFile(file);
            });
        }
    }

    // 图片粘贴处理
    handleImagePaste(event) {
        const items = event.clipboardData?.items;
        if (items) {
            Array.from(items).forEach(item => {
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    if (file) {
                        this.addImageFile(file);
                    }
                }
            });
        }
    }

    // 添加图片文件
    addImageFile(file) {
        if (file.type.indexOf('image') === -1) {
            this.showNotification('请选择图片文件', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB 限制
            this.showNotification('图片大小不能超过5MB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            // 确保有文件名，如果没有则生成一个
            const fileName = file.name || `pasted-image-${Date.now()}.${file.type.split('/')[1] || 'png'}`;
            
            const imageData = {
                id: Date.now().toString(),
                name: fileName,
                data: e.target.result, // 这已经是 base64 格式 (data:image/...)
                size: file.size
            };
            
            this.selectedFiles.push(imageData);
            this.updateImagePreviews();
            this.showNotification(`已添加图片: ${fileName}`, 'success');
            
            // 添加调试日志
            console.log('📷 图片已添加:', {
                name: fileName,
                size: file.size,
                dataLength: e.target.result ? e.target.result.length : 0,
                dataPrefix: e.target.result ? e.target.result.substring(0, 50) : 'No data'
            });
        };
        reader.readAsDataURL(file);
    }

    // 更新图片预览
    updateImagePreviews() {
        if (!this.imagePreviews) return;

        this.imagePreviews.innerHTML = '';
        
        this.selectedFiles.forEach((image, index) => {
            const previewDiv = document.createElement('div');
            previewDiv.className = 'image-preview';
            previewDiv.style.cssText = `
                position: relative;
                display: inline-block;
                margin: 4px;
                border: 1px solid #ddd;
                border-radius: 4px;
                overflow: hidden;
            `;
            
            previewDiv.innerHTML = `
                <img src="${image.data}" alt="${image.name}" style="width: 100px; height: 100px; object-fit: cover;">
                <div class="image-info" style="
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: rgba(0,0,0,0.7);
                    color: white;
                    padding: 2px 4px;
                    font-size: 11px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                ">${image.name}</div>
                <button class="image-remove-btn" data-index="${index}" style="
                    position: absolute;
                    top: 4px;
                    right: 4px;
                    width: 20px;
                    height: 20px;
                    border: none;
                    background: rgba(220, 53, 69, 0.8);
                    color: white;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">×</button>
            `;
            
            this.imagePreviews.appendChild(previewDiv);
        });

        // 为删除按钮添加事件监听器
        const removeButtons = this.imagePreviews.querySelectorAll('.image-remove-btn');
        removeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const index = parseInt(button.getAttribute('data-index'));
                this.removeImage(index);
            });
        });
    }

    // 移除图片
    removeImage(index) {
        this.selectedFiles.splice(index, 1);
        this.updateImagePreviews();
        this.showNotification('图片已移除', 'info');
    }

    // 元素捕获
    async captureElement() {
        try {
            this.showNotification('启动元素检查模式...', 'info');
            
            // 向当前活跃标签页发送消息开始元素捕获
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            if (!tabs[0]) {
                this.showNotification('没有找到活跃的标签页', 'error');
                return;
            }

            const tabId = tabs[0].id;
            console.log('📍 正在向标签页发送启动检查消息:', tabId);

            try {
                // 首先尝试注入element-inspector.js到页面
                console.log('💉 注入element-inspector.js脚本...');
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['element-inspector.js']
                });
                console.log('✅ 脚本注入成功');
            } catch (injectError) {
                console.log('⚠️ 脚本注入失败或已存在:', injectError.message);
            }

            // 等待一下确保脚本加载完成
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 发送开始检查的消息
            console.log('📤 发送startElementCapture消息...');
            chrome.tabs.sendMessage(tabId, {
                action: 'startElementCapture'
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ 发送消息失败:', chrome.runtime.lastError.message);
                    this.showNotification('无法启动元素检查: ' + chrome.runtime.lastError.message, 'error');
                } else if (response && response.success) {
                    console.log('✅ 元素检查启动成功');
                    this.showNotification('元素检查模式已启动', 'success');
                } else {
                    console.error('❌ 启动失败，响应:', response);
                    this.showNotification('启动元素检查失败', 'error');
                }
            });
        } catch (error) {
            console.error('❌ 元素捕获失败:', error);
            this.showNotification('元素捕获失败: ' + error.message, 'error');
        }
    }

    // 截图
    async takeScreenshot() {
        try {
            this.showNotification('正在截取页面...', 'info');
            
            // 使用chrome.tabs.captureVisibleTab API
            const dataUrl = await chrome.tabs.captureVisibleTab(null, {format: 'png'});
            
            const imageData = {
                id: Date.now().toString(),
                name: `screenshot-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.png`,
                data: dataUrl,
                size: dataUrl.length
            };
            
            this.selectedFiles.push(imageData);
            this.updateImagePreviews();
            this.showNotification('页面截图已添加', 'success');
            
        } catch (error) {
            console.error('截图失败:', error);
            this.showNotification('截图失败: ' + error.message, 'error');
        }
    }

    // 提交反馈
    async submitFeedback() {
        try {
            const text = this.feedbackText ? this.feedbackText.value.trim() : '';
            
            if (!text && this.selectedFiles.length === 0) {
                this.showNotification('请输入反馈内容或添加图片', 'warning');
                return;
            }

            // 检查是否是回复AI请求
            if (this.currentFeedbackRequest) {
                // 这是对AI请求的回复
                const replyData = {
                    feedbackId: this.currentFeedbackRequest.feedbackId,
                    text: text,
                    images: this.selectedFiles,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        url: window.location.href,
                        title: document.title,
                        userAgent: navigator.userAgent
                    }
                };

                // 添加调试日志
                console.log('📤 发送AI反馈回复:', {
                    feedbackId: replyData.feedbackId,
                    textLength: text.length,
                    imageCount: this.selectedFiles.length,
                    imageDetails: this.selectedFiles.map(img => ({
                        name: img.name,
                        size: img.size,
                        dataLength: img.data ? img.data.length : 0,
                        hasValidData: img.data && img.data.startsWith('data:')
                    }))
                });

                // 发送回复到MCP服务器
                this.sendWebSocketMessage({
                    action: 'submitFeedback',
                    data: replyData
                });

                // 更新AI处理信息显示
                this.updateAIMessageWithReply(text, this.selectedFiles);
                
                // 清除当前反馈请求
                this.clearCurrentFeedbackRequest();
                
                this.showNotification('反馈已发送给AI', 'success');
            } else {
                // 普通反馈提交
                const feedbackData = {
                    id: Date.now().toString(),
                    text: text,
                    images: this.selectedFiles,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        url: window.location.href,
                        title: document.title,
                        userAgent: navigator.userAgent
                    }
                };

                // 发送到MCP服务器
                this.sendWebSocketMessage({
                    action: 'submitFeedback',
                    data: feedbackData
                });

                // 保存到历史记录
                this.feedbackHistory.unshift(feedbackData);
                if (this.feedbackHistory.length > this.settings.maxHistory) {
                    this.feedbackHistory = this.feedbackHistory.slice(0, this.settings.maxHistory);
                }
                await this.saveHistory();
                this.updateHistoryDisplay();
                
                this.showNotification('反馈已提交', 'success');
            }

            // 清空表单
            if (this.feedbackText) this.feedbackText.value = '';
            this.selectedFiles = [];
            this.updateImagePreviews();

        } catch (error) {
            console.error('提交反馈失败:', error);
            this.showNotification('提交反馈失败: ' + error.message, 'error');
        }
    }

    updateAIMessageWithReply(replyText, images) {
        const activeRequest = document.querySelector('.active-request');
        if (activeRequest) {
            // 添加用户回复部分
            const replyDiv = document.createElement('div');
            replyDiv.style.cssText = `
                margin-top: 12px;
                padding: 12px;
                background: #f8f9fa;
                border-left: 4px solid #28a745;
                border-radius: 4px;
            `;
            
            let replyContent = `<div style="font-weight: bold; color: #28a745; margin-bottom: 8px;">您的回复:</div>`;
            replyContent += `<div style="line-height: 1.6;">${replyText || '(无文字内容)'}</div>`;
            
            if (images && images.length > 0) {
                replyContent += `<div style="margin-top: 8px; color: #6c757d; font-size: 13px;">📷 包含 ${images.length} 张图片</div>`;
            }
            
            replyContent += `<div style="margin-top: 8px; color: #6c757d; font-size: 12px;">已发送时间: ${new Date().toLocaleString()}</div>`;
            
            replyDiv.innerHTML = replyContent;
            activeRequest.appendChild(replyDiv);
            
            // 更新原提示信息
            const hint = activeRequest.querySelector('[style*="rgba(33, 150, 243, 0.1)"]');
            if (hint) {
                hint.innerHTML = '<strong>✅ 反馈已提交，感谢您的回复！</strong>';
                hint.style.background = 'rgba(40, 167, 69, 0.1)';
                hint.style.color = '#28a745';
            }
        }
    }

    // 更新历史记录显示
    updateHistoryDisplay() {
        if (!this.historyList) return;

        if (this.feedbackHistory.length === 0) {
            this.historyList.innerHTML = '<div class="empty-state">暂无历史记录</div>';
            return;
        }

        this.historyList.innerHTML = '';
        
        this.feedbackHistory.slice(0, 10).forEach((feedback, index) => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.style.cssText = `
                padding: 12px;
                border: 1px solid #e1e1e1;
                border-radius: 4px;
                margin-bottom: 8px;
                background: #f8f8f8;
            `;
            
            const timestamp = new Date(feedback.timestamp).toLocaleString();
            const textPreview = feedback.text.length > 100 ? 
                feedback.text.substring(0, 100) + '...' : feedback.text;
            
            historyItem.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 4px;">反馈 #${feedback.id}</div>
                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">${timestamp}</div>
                <div style="margin-bottom: 8px;">${textPreview || '(仅图片反馈)'}</div>
                ${feedback.images && feedback.images.length > 0 ? 
                    `<div style="font-size: 12px; color: #007bff;">📷 ${feedback.images.length} 张图片</div>` : ''}
            `;
            
            this.historyList.appendChild(historyItem);
        });
    }

    // 设置事件处理
    setupSettingsEvents() {
        const saveSettingsBtn = document.getElementById('saveSettingsBtn');
        const autoConnectCheck = document.getElementById('autoConnect');
        const maxHistoryInput = document.getElementById('maxHistory');

        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', async () => {
                if (autoConnectCheck) {
                    this.settings.autoConnect = autoConnectCheck.checked;
                }
                if (maxHistoryInput) {
                    this.settings.maxHistory = parseInt(maxHistoryInput.value) || 50;
                }
                
                await this.saveSettings();
                this.showNotification('设置已保存', 'success');
            });
        }

        // 加载设置到UI
        if (autoConnectCheck) {
            autoConnectCheck.checked = this.settings.autoConnect;
        }
        if (maxHistoryInput) {
            maxHistoryInput.value = this.settings.maxHistory;
        }
    }

    // 折叠面板功能
    setupCollapsibleSections() {
        const sectionHeaders = document.querySelectorAll('.section-header');
        
        sectionHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                const chevron = header.querySelector('.chevron');
                
                if (content && chevron) {
                    const isCollapsed = content.classList.contains('collapsed');
                    
                    if (isCollapsed) {
                        content.classList.remove('collapsed');
                        header.classList.remove('collapsed');
                        chevron.textContent = '▼';
                    } else {
                        content.classList.add('collapsed');
                        header.classList.add('collapsed');
                        chevron.textContent = '▶';
                    }
                }
            });
        });
    }

    handleMessage(message, sender, sendResponse) {
        console.log('收到消息:', message);
        
        switch (message.action) {
            case 'elementCaptured':
                if (message.data) {
                    this.handleElementCaptured(message.data);
                }
                break;
                
            case 'fillFeedbackText':
                if (message.data && message.data.text && this.feedbackText) {
                    this.feedbackText.value = message.data.text;
                    this.showNotification('元素信息已填充到反馈内容', 'success');
                }
                break;
                
            case 'requestFeedback':
                if (message.data) {
                    this.handleFeedbackRequest(message.data);
                }
                break;
                
            default:
                console.log('未知消息类型:', message.action);
        }
        
        if (sendResponse) {
            sendResponse({ success: true });
        }
    }

    // 处理元素捕获结果（仅处理截图）
    handleElementCaptured(data) {
        console.log('🖼️ Sidepanel: handleElementCaptured 被调用');
        console.log('📋 Sidepanel: 收到数据:', data);
        
        if (data && data.screenshot) {
            console.log('✅ Sidepanel: 发现截图数据，长度:', data.screenshot.length);
            
            const imageData = {
                id: Date.now().toString(),
                name: `element-capture-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.png`,
                data: data.screenshot,
                size: data.screenshot.length
            };
            
            console.log('📁 Sidepanel: 创建图片数据对象:', imageData.name);
            
            this.selectedFiles.push(imageData);
            this.updateImagePreviews();
            this.showNotification('元素截图已添加到文件列表', 'success');
            
            console.log('✅ Sidepanel: 截图已成功添加到文件列表，当前文件数:', this.selectedFiles.length);
        } else {
            console.error('❌ Sidepanel: 未找到截图数据');
            console.log('📋 Sidepanel: 完整数据结构:', JSON.stringify(data, null, 2));
        }
        
        // 移除自动填充元素信息的功能，这由 fillFeedbackText 消息单独处理
    }
}

// 初始化
window.mcpFeedbackPanel = new MCPFeedbackSidePanel(); 