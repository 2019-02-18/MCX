// chrome extension Content Script

class MCPFeedbackContent {
    constructor() {
        console.log('🚀 MCP Feedback Content Script: 开始初始化...', new Date().toLocaleTimeString());
        this.isActive = false;
        this.feedbackOverlay = null;
        this.screenshotData = null;
        this.selectedFiles = [];
        this.capturedScreenshots = []; // 存储截图数据
        
        // 元素检查相关属性
        this.isInspecting = false;
        this.inspectOverlay = null;
        this.highlightBox = null;
        this.currentHoveredElement = null;
        this.tooltip = null;
        
        this.initializeListeners();
        this.addStyles();
        console.log('✅ MCP Feedback Content Script: 初始化完成', new Date().toLocaleTimeString());
    }
    
    initializeListeners() {
        console.log('MCP Feedback Content Script: Initializing listeners');
        
        // 监听来自 background 和 sidepanel 的消息
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Content script received message:', request);
            try {
                switch (request.action) {
                    case 'startFeedbackCollection':
                        console.log('Starting feedback collection...');
                        this.startFeedbackCollection();
                        sendResponse({ success: true });
                        break;
                        
                    case 'stopFeedbackCollection':
                        console.log('Stopping feedback collection...');
                        this.stopFeedbackCollection();
                        sendResponse({ success: true });
                        break;
                        
                    case 'captureScreenshot':
                        this.captureScreenshot()
                            .then(result => sendResponse(result))
                            .catch(error => {
                                console.error('Screenshot capture failed:', error);
                                sendResponse({ success: false, error: error.message });
                            });
                        return true; // 保持消息通道开放
                        
                    case 'getPageInfo':
                        const pageInfo = this.getPageInfo();
                        console.log('Page info:', pageInfo);
                        sendResponse(pageInfo);
                        break;
                        
                    case 'showFeedbackForm':
                        console.log('Showing feedback form...');
                        this.showFeedbackForm(request.data);
                        sendResponse({ success: true });
                        break;
                        
                    case 'startElementInspection':
                        console.log('Starting element inspection...');
                        this.startElementInspection();
                        sendResponse({ success: true });
                        break;
                        
                    case 'stopElementInspection':
                        console.log('Stopping element inspection...');
                        this.stopElementInspection();
                        sendResponse({ success: true });
                        break;
                        
                    case 'startElementCapture':
                        console.log('Content script: startElementCapture消息已收到，但由element-inspector.js处理');
                        // 这个消息由element-inspector.js处理，content.js不需要处理
                        // 但我们需要返回一个响应以避免错误
                        sendResponse({ success: true, message: 'Message forwarded to element-inspector' });
                        break;
                        
                    case 'stopElementCapture':
                        console.log('Content script: stopElementCapture消息已收到，但由element-inspector.js处理');
                        sendResponse({ success: true, message: 'Message forwarded to element-inspector' });
                        break;
                        
                    case 'hideFeedbackForm':
                        console.log('Hiding feedback form...');
                        this.hideFeedbackForm();
                        sendResponse({ success: true });
                        break;
                        
                    case 'feedbackConfirmed':
                        console.log('收到MCP服务器确认，重新启用反馈表单');
                        this.enableFeedbackForm();
                        this.showMessage('反馈提交成功！表单已重新启用', 'success');
                        sendResponse({ success: true });
                        break;
                        
                    case 'connectionStatusChanged':
                        console.log('MCP连接状态变化:', request.isConnected);
                        if (request.isConnected) {
                            this.enableFeedbackForm();
                            this.showMessage('MCP服务器已连接', 'success');
                        } else {
                            this.setFormDisabledState('MCP服务器连接断开');
                            this.showMessage('MCP服务器连接断开', 'warning');
                        }
                        sendResponse({ success: true });
                        break;

                    case 'automation':
                        console.log('收到自动化命令:', request);
                        this.handleAutomationCommand(request)
                            .then(result => sendResponse(result))
                            .catch(error => {
                                console.error('自动化命令执行失败:', error);
                                sendResponse({ success: false, error: error.message });
                            });
                        return true; // 保持消息通道开放

                    default:
                        console.warn('Unknown message action:', request.action);
                        sendResponse({ success: false, error: 'Unknown action' });
                }
            } catch (error) {
                console.error('Error handling message:', error);
                sendResponse({ success: false, error: error.message });
            }
        });
        
        // 监听键盘事件
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        console.log('MCP Feedback Content Script: Listeners initialized successfully');
    }
    
    addStyles() {
        if (document.getElementById('mcp-feedback-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'mcp-feedback-styles';
        style.textContent = `
            .mcp-feedback-overlay {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.5) !important;
                z-index: 999999 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-family: 'Segoe UI', system-ui, sans-serif !important;
            }
            
            .mcp-feedback-form {
                background: white !important;
                border-radius: 12px !important;
                padding: 24px !important;
                max-width: 500px !important;
                width: 90% !important;
                max-height: 80vh !important;
                overflow-y: auto !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                position: relative !important;
            }
            
            .mcp-feedback-header {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                margin-bottom: 20px !important;
                padding-bottom: 16px !important;
                border-bottom: 1px solid #e0e0e0 !important;
            }
            
            .mcp-feedback-title {
                font-size: 20px !important;
                font-weight: 600 !important;
                color: #333 !important;
                margin: 0 !important;
            }
            
            .mcp-feedback-close {
                background: none !important;
                border: none !important;
                font-size: 24px !important;
                cursor: pointer !important;
                color: #666 !important;
                padding: 4px !important;
                border-radius: 4px !important;
                transition: background-color 0.2s !important;
            }
            
            .mcp-feedback-close:hover {
                background-color: #f0f0f0 !important;
            }
            
            .mcp-feedback-section {
                margin-bottom: 20px !important;
            }
            
            .mcp-feedback-label {
                display: block !important;
                font-weight: 500 !important;
                color: #333 !important;
                margin-bottom: 8px !important;
                font-size: 14px !important;
            }
            
            .mcp-feedback-textarea {
                width: 100% !important;
                min-height: 120px !important;
                padding: 12px !important;
                border: 2px solid #e0e0e0 !important;
                border-radius: 8px !important;
                font-family: inherit !important;
                font-size: 14px !important;
                resize: vertical !important;
                transition: border-color 0.2s !important;
                box-sizing: border-box !important;
            }
            
            .mcp-feedback-textarea:focus {
                outline: none !important;
                border-color: #007bff !important;
            }
            
            .mcp-feedback-file-input {
                display: none !important;
            }
            
            .mcp-feedback-drop-zone {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 100% !important;
                height: 120px !important;
                background: #f8f9fa !important;
                border: 2px dashed #dee2e6 !important;
                border-radius: 8px !important;
                cursor: pointer !important;
                transition: all 0.2s !important;
                margin-bottom: 12px !important;
                position: relative !important;
                overflow: hidden !important;
            }
            
            .mcp-feedback-drop-zone:hover {
                background: #e9ecef !important;
                border-color: #adb5bd !important;
            }
            
            .mcp-feedback-drop-zone.active {
                background: #e8f4ff !important;
                border-color: #007bff !important;
            }
            
            .mcp-feedback-drop-content {
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                text-align: center !important;
                padding: 16px !important;
            }
            
            .mcp-feedback-drop-icon {
                font-size: 32px !important;
                margin-bottom: 8px !important;
                color: #6c757d !important;
            }
            
            .mcp-feedback-drop-text {
                font-size: 16px !important;
                font-weight: 500 !important;
                color: #495057 !important;
                margin-bottom: 4px !important;
            }
            
            .mcp-feedback-drop-hint {
                font-size: 12px !important;
                color: #6c757d !important;
            }
            
            .mcp-feedback-preview {
                margin-top: 12px !important;
                display: flex !important;
                flex-wrap: wrap !important;
                gap: 8px !important;
            }
            
            .mcp-feedback-preview-item {
                position: relative !important;
                display: inline-block !important;
            }
            
            .mcp-feedback-preview-image {
                width: 80px !important;
                height: 80px !important;
                object-fit: cover !important;
                border-radius: 6px !important;
                border: 1px solid #dee2e6 !important;
            }
            
            .mcp-feedback-preview-remove {
                position: absolute !important;
                top: -6px !important;
                right: -6px !important;
                width: 20px !important;
                height: 20px !important;
                background: #dc3545 !important;
                color: white !important;
                border: none !important;
                border-radius: 50% !important;
                cursor: pointer !important;
                font-size: 12px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            }
            
            .mcp-feedback-buttons {
                display: flex !important;
                gap: 12px !important;
                justify-content: flex-end !important;
                margin-top: 24px !important;
                padding-top: 16px !important;
                border-top: 1px solid #e0e0e0 !important;
            }
            
            .mcp-feedback-button {
                padding: 10px 20px !important;
                border: none !important;
                border-radius: 6px !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                cursor: pointer !important;
                transition: all 0.2s !important;
            }
            
            .mcp-feedback-button-primary {
                background: #007bff !important;
                color: white !important;
            }
            
            .mcp-feedback-button-primary:hover {
                background: #0056b3 !important;
            }
            
            .mcp-feedback-button-secondary {
                background: #6c757d !important;
                color: white !important;
            }
            
            .mcp-feedback-button-secondary:hover {
                background: #545b62 !important;
            }
            
            .mcp-feedback-message {
                position: fixed !important;
                top: 20px !important;
                right: 20px !important;
                padding: 12px 20px !important;
                border-radius: 8px !important;
                font-family: 'Segoe UI', system-ui, sans-serif !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                z-index: 1000000 !important;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
                animation: slideIn 0.3s ease-out !important;
            }
            
            .mcp-feedback-message-success {
                background: #28a745 !important;
                color: white !important;
            }
            
            .mcp-feedback-message-error {
                background: #dc3545 !important;
                color: white !important;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(100%) !important;
                    opacity: 0 !important;
                }
                to {
                    transform: translateX(0) !important;
                    opacity: 1 !important;
                }
            }
            
            @keyframes slideOut {
                from {
                    transform: translateX(0) !important;
                    opacity: 1 !important;
                }
                to {
                    transform: translateX(100%) !important;
                    opacity: 0 !important;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    startFeedbackCollection() {
        console.log('Starting feedback collection');
        this.isActive = true;
        this.showMessage('反馈收集已启动，按 F2 打开反馈表单', 'success');
    }
    
    stopFeedbackCollection() {
        console.log('Stopping feedback collection');
        this.isActive = false;
        this.hideFeedbackForm();
        this.showMessage('反馈收集已停止', 'success');
    }
    
    // 开始元素检查
    startElementInspection() {
        if (this.isInspecting) {
            console.log('⚠️ 元素检查已在进行中，跳过重复启动');
            return;
        }
        
        console.log('🎯 开始元素检查...', new Date().toLocaleTimeString());
        this.isInspecting = true;
        
        // 创建检查覆盖层
        this.createInspectionOverlay();
        
        // 绑定事件监听器
        this.bindInspectionEvents();
        
        // 显示提示信息
        this.showInspectionHint();
        
        console.log('✅ 元素检查模式已启动');
    }
    
    // 停止元素检查
    stopElementInspection(reason = 'programmatic') {
        if (!this.isInspecting) return;
        
        console.log('停止元素检查，原因:', reason);
        this.isInspecting = false;
        
        // 移除事件监听器
        this.unbindInspectionEvents();
        
        // 清理覆盖层和高亮
        this.cleanupInspection();
        
        // 通知背景脚本
        console.log('📤 Content: 发送elementInspectionStopped消息，原因:', reason);
        chrome.runtime.sendMessage({
            action: 'elementInspectionStopped',
            reason: reason
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('❌ Content: 发送停止消息失败:', chrome.runtime.lastError);
            } else {
                console.log('✅ Content: 停止消息发送成功:', response);
            }
        });
    }
    
    // 创建检查覆盖层
    createInspectionOverlay() {
        if (this.inspectOverlay) return;
        
        // 创建半透明覆盖层
        this.inspectOverlay = document.createElement('div');
        this.inspectOverlay.id = 'mcp-inspect-overlay';
        this.inspectOverlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: rgba(0, 0, 0, 0.1) !important;
            z-index: 999998 !important;
            pointer-events: none !important;
            cursor: crosshair !important;
        `;
        
        // 创建高亮框
        this.highlightBox = document.createElement('div');
        this.highlightBox.id = 'mcp-highlight-box';
        this.highlightBox.style.cssText = `
            position: absolute !important;
            border: 2px solid #007bff !important;
            background: rgba(0, 123, 255, 0.1) !important;
            pointer-events: none !important;
            z-index: 999999 !important;
            display: none !important;
            box-sizing: border-box !important;
        `;
        
        // 创建工具提示
        this.tooltip = document.createElement('div');
        this.tooltip.id = 'mcp-inspect-tooltip';
        this.tooltip.style.cssText = `
            position: absolute !important;
            background: #333 !important;
            color: white !important;
            padding: 8px 12px !important;
            border-radius: 4px !important;
            font-family: 'Segoe UI', Arial, sans-serif !important;
            font-size: 12px !important;
            line-height: 1.4 !important;
            z-index: 1000000 !important;
            display: none !important;
            max-width: 300px !important;
            word-wrap: break-word !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
        `;
        
        // 添加到页面
        document.body.appendChild(this.inspectOverlay);
        document.body.appendChild(this.highlightBox);
        document.body.appendChild(this.tooltip);
    }
    
    // 绑定检查事件
    bindInspectionEvents() {
        this.onMouseMove = this.handleInspectionMouseMove.bind(this);
        this.onMouseClick = this.handleInspectionClick.bind(this);
        this.onKeyDown = this.handleInspectionKeyDown.bind(this);
        
        // 在多个层级绑定事件，确保能捕获
        document.addEventListener('mousemove', this.onMouseMove, true);
        document.addEventListener('click', this.onMouseClick, true);
        document.addEventListener('keydown', this.onKeyDown, true);
        
        // 在window上也绑定键盘事件
        window.addEventListener('keydown', this.onKeyDown, true);
        
        // 在document.body上也绑定（如果存在）
        if (document.body) {
            document.body.addEventListener('keydown', this.onKeyDown, true);
        }
        
        console.log('🔗 元素检查事件已绑定在多个层级');
    }
    
    // 解绑检查事件
    unbindInspectionEvents() {
        if (this.onMouseMove) {
            document.removeEventListener('mousemove', this.onMouseMove, true);
        }
        if (this.onMouseClick) {
            document.removeEventListener('click', this.onMouseClick, true);
        }
        if (this.onKeyDown) {
            document.removeEventListener('keydown', this.onKeyDown, true);
            window.removeEventListener('keydown', this.onKeyDown, true);
            if (document.body) {
                document.body.removeEventListener('keydown', this.onKeyDown, true);
            }
        }
        console.log('🔓 元素检查事件已从所有层级解绑');
    }
    
    // 绑定工具栏期间的键盘事件监听（专门用于ESC键）
    bindToolbarKeyListener() {
        this.onToolbarKeyDown = this.handleToolbarKeyDown.bind(this);
        
        // 在多个层级绑定键盘事件，确保能捕获ESC键
        document.addEventListener('keydown', this.onToolbarKeyDown, true);
        window.addEventListener('keydown', this.onToolbarKeyDown, true);
        
        if (document.body) {
            document.body.addEventListener('keydown', this.onToolbarKeyDown, true);
        }
        
        console.log('🔗 工具栏ESC键监听已绑定');
    }
    
    // 解绑工具栏期间的键盘事件监听
    unbindToolbarKeyListener() {
        if (this.onToolbarKeyDown) {
            document.removeEventListener('keydown', this.onToolbarKeyDown, true);
            window.removeEventListener('keydown', this.onToolbarKeyDown, true);
            
            if (document.body) {
                document.body.removeEventListener('keydown', this.onToolbarKeyDown, true);
            }
            
            this.onToolbarKeyDown = null;
            console.log('🔓 工具栏ESC键监听已解绑');
        }
    }
    
    // 处理工具栏期间的键盘事件
    handleToolbarKeyDown(event) {
        console.log('🎹 工具栏键盘事件触发:', {
            key: event.key,
            code: event.code,
            keyCode: event.keyCode,
            which: event.which
        });
        
        // 检查多种ESC键的表示方式
        const isEscapeKey = (
            event.key === 'Escape' || 
            event.code === 'Escape' ||
            event.keyCode === 27 ||
            event.which === 27
        );
        
        if (isEscapeKey) {
            console.log('🏃 工具栏期间ESC键被按下，退出捕获流程');
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            this.showDebugMessage('ESC退出捕获流程');
            
            // 执行取消捕获操作
            this.cancelCapture();
        }
    }
    
    // 处理鼠标移动
    handleInspectionMouseMove(event) {
        if (!this.isInspecting) return;
        
        event.preventDefault();
        event.stopPropagation();
        
        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (!element || element === this.inspectOverlay || element === this.highlightBox || element === this.tooltip) {
            return;
        }
        
        // 只在元素变化时输出日志，避免过多日志
        if (this.currentHoveredElement !== element) {
            console.log('🎯 悬停新元素:', element.tagName, element.className, element.id);
        }
        
        this.currentHoveredElement = element;
        this.updateHighlight(element);
        this.updateTooltip(element, event.clientX, event.clientY);
    }
    
    // 处理点击事件
    handleInspectionClick(event) {
        if (!this.isInspecting) {
            console.log('⚠️ 不在检查模式中，忽略点击');
            return;
        }
        
        console.log('🖱️ 元素检查点击事件触发', event);
        this.showDebugMessage('点击事件触发，显示截图工具栏...');
        
        event.preventDefault();
        event.stopPropagation();
        
        const element = this.currentHoveredElement;
        if (!element) {
            console.log('❌ 没有悬停的元素，无法捕获');
            this.showDebugMessage('❌ 没有悬停的元素，无法捕获');
            return;
        }
        
        console.log('🎯 点击的元素:', element.tagName, element.className, element.id);
        this.showDebugMessage(`选中元素: ${element.tagName} ${element.className} ${element.id}`);
        
        // 保存当前选中的元素
        this.selectedElement = element;
        
        // 停止检查模式但保持元素高亮
        this.unbindInspectionEvents();
        this.isInspecting = false;
        
        // 显示截图工具栏
        this.showCaptureToolbar(element);
    }
    
    // 处理键盘事件
    handleInspectionKeyDown(event) {
        console.log('🎹 键盘事件触发:', {
            isInspecting: this.isInspecting,
            key: event.key,
            code: event.code,
            keyCode: event.keyCode,
            which: event.which
        });
        
        if (!this.isInspecting) {
            console.log('⚠️ 不在检查模式，忽略键盘事件');
            return;
        }
        
        // 检查多种ESC键的表示方式
        const isEscapeKey = (
            event.key === 'Escape' || 
            event.code === 'Escape' ||
            event.keyCode === 27 ||
            event.which === 27
        );
        
        if (isEscapeKey) {
            console.log('🏃 ESC键被按下，退出检查模式');
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            this.showDebugMessage('ESC退出检查模式');
            this.stopElementInspection('userEscaped');
        }
    }
    
    // 更新高亮
    updateHighlight(element) {
        if (!this.highlightBox) return;
        
        const rect = element.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        
        this.highlightBox.style.display = 'block';
        this.highlightBox.style.left = (rect.left + scrollX) + 'px';
        this.highlightBox.style.top = (rect.top + scrollY) + 'px';
        this.highlightBox.style.width = rect.width + 'px';
        this.highlightBox.style.height = rect.height + 'px';
    }
    
    // 更新工具提示
    updateTooltip(element, mouseX, mouseY) {
        if (!this.tooltip) return;
        
        const tagName = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const classes = element.className ? `.${element.className.toString().trim().replace(/\s+/g, '.')}` : '';
        const text = element.textContent ? element.textContent.trim().substring(0, 50) : '';
        
        const tooltipContent = `
            <div><strong>${tagName}${id}${classes}</strong></div>
            ${text ? `<div>文本: ${text}${text.length > 50 ? '...' : ''}</div>` : ''}
            <div style="margin-top: 4px; font-size: 11px; opacity: 0.8;">
                位置: ${Math.round(element.getBoundingClientRect().left)}, ${Math.round(element.getBoundingClientRect().top)} | 
                大小: ${Math.round(element.getBoundingClientRect().width)} × ${Math.round(element.getBoundingClientRect().height)}
            </div>
        `;
        
        this.tooltip.innerHTML = tooltipContent;
        this.tooltip.style.display = 'block';
        
        // 计算工具提示位置
        const tooltipRect = this.tooltip.getBoundingClientRect();
        let left = mouseX + 10;
        let top = mouseY - tooltipRect.height - 10;
        
        // 确保工具提示不超出视窗
        if (left + tooltipRect.width > window.innerWidth) {
            left = mouseX - tooltipRect.width - 10;
        }
        if (top < 0) {
            top = mouseY + 10;
        }
        
        this.tooltip.style.left = left + 'px';
        this.tooltip.style.top = top + 'px';
    }
    
    // 捕获元素数据
    async captureElementData(element) {
        console.log('开始捕获元素数据:', element.tagName, element.className, element.id);
        this.showDebugMessage('正在收集元素信息...');
        
        const rect = element.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        
        // 收集元素属性
        const attributes = {};
        for (let attr of element.attributes) {
            attributes[attr.name] = attr.value;
        }
        
        // 生成CSS选择器
        const cssSelector = this.generateCSSSelector(element);
        
        const elementData = {
            tagName: element.tagName,
            id: element.id || null,
            className: element.className || null,
            textContent: element.textContent ? element.textContent.trim() : null,
            attributes: attributes,
            cssSelector: cssSelector,
            rect: {
                x: rect.left + scrollX,
                y: rect.top + scrollY,
                width: rect.width,
                height: rect.height,
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom
            },
            url: window.location.href,
            timestamp: new Date().toISOString()
        };
        
        console.log('元素基本信息已收集');
        
        // 尝试捕获元素截图
        try {
            console.log('开始捕获元素截图...');
            this.showDebugMessage('正在捕获元素截图...');
            const screenshot = await this.captureElementScreenshot(element);
            if (screenshot) {
                console.log('截图捕获成功，数据长度:', screenshot.length);
                this.showDebugMessage(`截图成功! 大小:${screenshot.length}`);
                elementData.screenshot = screenshot;
                
                // 保存截图到实例变量，用于自动添加到反馈表单
                this.capturedScreenshots.push({
                    data: screenshot,
                    elementInfo: `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}${element.className ? '.' + element.className.split(' ')[0] : ''}`,
                    timestamp: new Date().toISOString()
                });
                console.log('截图已保存到 capturedScreenshots，总数:', this.capturedScreenshots.length);
            } else {
                console.error('截图捕获失败：返回为空');
                this.showDebugMessage('截图失败：返回为空');
            }
        } catch (error) {
            console.error('捕获元素截图时发生错误:', error);
            this.showDebugMessage(`截图异常: ${error.message}`);
        }
        
        // 发送数据到背景脚本
        console.log('发送元素数据到背景脚本...');
        this.showDebugMessage('发送数据到侧边栏...');
        chrome.runtime.sendMessage({
            action: 'elementCaptured',
            data: elementData
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('发送消息失败:', chrome.runtime.lastError);
                this.showDebugMessage(`发送失败: ${chrome.runtime.lastError.message}`);
            } else {
                console.log('消息发送成功:', response);
                this.showDebugMessage('数据发送成功!');
            }
        });
    }
    
    // 生成CSS选择器
    generateCSSSelector(element) {
        if (element.id) {
            return `#${element.id}`;
        }
        
        let selector = element.tagName.toLowerCase();
        
        if (element.className) {
            const classes = element.className.toString().trim().split(/\s+/);
            selector += '.' + classes.join('.');
        }
        
        // 如果选择器不唯一，添加父级路径
        if (document.querySelectorAll(selector).length > 1) {
            let parent = element.parentElement;
            let path = [selector];
            
            while (parent && parent !== document.body && path.length < 5) {
                let parentSelector = parent.tagName.toLowerCase();
                if (parent.id) {
                    parentSelector += `#${parent.id}`;
                    path.unshift(parentSelector);
                    break;
                } else if (parent.className) {
                    const classes = parent.className.toString().trim().split(/\s+/);
                    parentSelector += '.' + classes[0]; // 只使用第一个类名
                }
                path.unshift(parentSelector);
                parent = parent.parentElement;
            }
            
            selector = path.join(' > ');
        }
        
        return selector;
    }
    
    // 捕获元素截图（改进版）
    async captureElementScreenshot(element) {
        try {
            console.log('开始捕获元素截图...');
            
            if (element) {
                // 如果元素不在视窗内，先滚动到元素位置
                const rect = element.getBoundingClientRect();
                const isInViewport = (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= window.innerHeight &&
                    rect.right <= window.innerWidth
                );
                
                if (!isInViewport) {
                    console.log('元素不在视窗内，滚动到元素位置...');
                    this.showDebugMessage('滚动到元素位置...');
                    
                    element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'center'
                    });
                    
                    // 等待滚动完成
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            // 使用chrome.tabs API捕获整个页面截图
            return new Promise((resolve) => {
                console.log('发送截图请求到background script...');
                chrome.runtime.sendMessage({
                    action: 'captureElementScreenshot'
                }, (response) => {
                    if (response && response.success && response.screenshot) {
                        console.log('截图成功，数据长度:', response.screenshot.length);
                        resolve(response.screenshot);
                    } else {
                        console.error('截图失败或无数据:', response?.error || '未知错误');
                        resolve(null);
                    }
                });
            });
        } catch (error) {
            console.error('捕获截图异常:', error);
            return null;
        }
    }
    
    // 显示检查提示
    showInspectionHint() {
        const hint = document.createElement('div');
        hint.id = 'mcp-inspection-hint';
        hint.style.cssText = `
            position: fixed !important;
            top: 20px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            background: #333 !important;
            color: white !important;
            padding: 12px 20px !important;
            border-radius: 6px !important;
            font-family: 'Segoe UI', Arial, sans-serif !important;
            font-size: 14px !important;
            z-index: 1000001 !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
            animation: fadeIn 0.3s ease-out !important;
        `;
        hint.innerHTML = '🎯 点击页面元素进行捕获，按 ESC 键退出检查模式';
        
        document.body.appendChild(hint);
        
        // 3秒后自动移除提示
        setTimeout(() => {
            if (hint.parentNode) {
                hint.remove();
            }
        }, 3000);
    }
    
    // 显示调试消息
    showDebugMessage(message) {
        const debugDiv = document.getElementById('mcp-debug-message') || document.createElement('div');
        debugDiv.id = 'mcp-debug-message';
        debugDiv.style.cssText = `
            position: fixed !important;
            top: 60px !important;
            right: 20px !important;
            background: #ff4444 !important;
            color: white !important;
            padding: 10px 15px !important;
            border-radius: 4px !important;
            font-family: monospace !important;
            font-size: 12px !important;
            z-index: 1000002 !important;
            max-width: 300px !important;
            word-wrap: break-word !important;
        `;
        debugDiv.textContent = message;
        
        if (!debugDiv.parentNode) {
            document.body.appendChild(debugDiv);
        }
        
        // 3秒后移除
        setTimeout(() => {
            if (debugDiv.parentNode) {
                debugDiv.remove();
            }
        }, 3000);
    }

    // 显示截图工具栏
    showCaptureToolbar(element) {
        // 移除已存在的工具栏
        this.removeCaptureToolbar();
        
        console.log('🔧 显示截图工具栏');
        this.showDebugMessage('显示截图工具栏');
        
        // 绑定工具栏期间的ESC键监听
        this.bindToolbarKeyListener();
        
        // 获取元素位置
        const rect = element.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        
        // 计算工具栏的最佳位置
        const toolbarWidth = 260; // 预估工具栏宽度
        const toolbarHeight = 40; // 预估工具栏高度
        const gap = 10; // 与元素的间距
        
        let left, top;
        
        // 优先尝试放在元素右侧
        if (rect.right + gap + toolbarWidth <= window.innerWidth) {
            left = rect.right + gap;
            top = Math.max(10, Math.min(rect.top, window.innerHeight - toolbarHeight - 10));
        }
        // 如果右侧空间不够，尝试左侧
        else if (rect.left - gap - toolbarWidth >= 0) {
            left = rect.left - gap - toolbarWidth;
            top = Math.max(10, Math.min(rect.top, window.innerHeight - toolbarHeight - 10));
        }
        // 如果左右都不够，放在元素上方或下方
        else {
            left = Math.max(10, Math.min(rect.left, window.innerWidth - toolbarWidth - 10));
            if (rect.top - gap - toolbarHeight >= 0) {
                top = rect.top - gap - toolbarHeight;
            } else {
                top = rect.bottom + gap;
            }
        }
        
        // 创建工具栏容器
        const toolbar = document.createElement('div');
        toolbar.id = 'mcp-capture-toolbar';
        toolbar.style.cssText = `
            position: fixed !important;
            top: ${top}px !important;
            left: ${left}px !important;
            background: rgba(243, 243, 243, 0.95) !important;
            color: #333333 !important;
            padding: 0 !important;
            border-radius: 6px !important;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif !important;
            font-size: 14px !important;
            font-weight: 400 !important;
            z-index: 1000003 !important;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1) !important;
            display: flex !important;
            align-items: center !important;
            gap: 1px !important;
            animation: toolbarFadeIn 0.2s ease-out !important;
            backdrop-filter: blur(12px) !important;
            border: 1px solid rgba(0, 0, 0, 0.1) !important;
            min-width: 280px !important;
            height: 36px !important;
        `;
        
        // 添加VSCode风格的动画样式
        const existingStyle = document.getElementById('mcp-toolbar-styles');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        const style = document.createElement('style');
        style.id = 'mcp-toolbar-styles';
        style.textContent = `
            @keyframes toolbarFadeIn {
                from {
                    transform: scale(0.95);
                    opacity: 0;
                }
                to {
                    transform: scale(1);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
        
        // Win10风格的工具栏内容
        toolbar.innerHTML = `
            <button id="mcp-insert-text" style="
                background: transparent;
                color: #333333;
                border: none;
                border-right: 1px solid rgba(0, 0, 0, 0.1);
                padding: 0 16px;
                cursor: pointer;
                font-size: 14px;
                font-family: inherit;
                font-weight: 400;
                transition: all 0.15s ease;
                display: flex;
                align-items: center;
                gap: 8px;
                white-space: nowrap;
                height: 36px;
                line-height: 1;
                border-radius: 5px 0 0 5px;
                flex: 1;
            ">
                <span style="font-size: 16px; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">📄</span>
                <span>获取信息</span>
            </button>
            <button id="mcp-confirm-capture" style="
                background: transparent;
                color: #333333;
                border: none;
                border-right: 1px solid rgba(0, 0, 0, 0.1);
                padding: 0 16px;
                cursor: pointer;
                font-size: 14px;
                font-family: inherit;
                font-weight: 400;
                transition: all 0.15s ease;
                display: flex;
                align-items: center;
                gap: 8px;
                white-space: nowrap;
                height: 36px;
                line-height: 1;
                flex: 1;
            ">
                <span style="font-size: 16px; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">📷</span>
                <span>截图</span>
            </button>
            <button id="mcp-cancel-capture" style="
                background: transparent;
                color: #333333;
                border: none;
                padding: 0 16px;
                cursor: pointer;
                font-size: 14px;
                font-family: inherit;
                font-weight: 400;
                transition: all 0.15s ease;
                display: flex;
                align-items: center;
                gap: 8px;
                white-space: nowrap;
                height: 36px;
                line-height: 1;
                border-radius: 0 5px 5px 0;
                flex: 1;
            ">
                <span style="font-size: 16px; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">✕</span>
                <span>关闭</span>
            </button>
        `;
        
        document.body.appendChild(toolbar);
        
        // 绑定事件
        document.getElementById('mcp-insert-text').addEventListener('click', () => {
            console.log('🔘 插入文本按钮被点击');
            this.insertTextToElement();
        });
        
        document.getElementById('mcp-confirm-capture').addEventListener('click', () => {
            console.log('🔘 确认截图按钮被点击');
            this.confirmCapture();
        });
        
        document.getElementById('mcp-cancel-capture').addEventListener('click', () => {
            console.log('🔘 取消按钮被点击');
            this.cancelCapture();
        });
        
        const buttons = toolbar.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.addEventListener('mouseenter', (e) => {
                e.target.style.background = 'rgba(0, 0, 0, 0.04)';
                e.target.style.color = '#333333';
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
            });
            
            btn.addEventListener('mouseleave', (e) => {
                e.target.style.background = 'transparent';
                e.target.style.color = '#333333';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = 'none';
            });
            
            btn.addEventListener('mousedown', (e) => {
                e.target.style.background = 'rgba(0, 0, 0, 0.08)';
                e.target.style.transform = 'translateY(0) scale(0.98)';
                e.target.style.transition = 'all 0.1s ease';
            });
            
            btn.addEventListener('mouseup', (e) => {
                e.target.style.background = 'rgba(0, 0, 0, 0.04)';
                e.target.style.transform = 'translateY(-1px) scale(1)';
                e.target.style.transition = 'all 0.15s ease';
            });
            
            // 添加Win10风格的焦点样式
            btn.addEventListener('focus', (e) => {
                e.target.style.outline = '2px solid #0078d4';
                e.target.style.outlineOffset = '1px';
            });
            
            btn.addEventListener('blur', (e) => {
                e.target.style.outline = 'none';
            });
        });
    }

    // 移除截图工具栏
    removeCaptureToolbar() {
        const toolbar = document.getElementById('mcp-capture-toolbar');
        if (toolbar) {
            toolbar.remove();
        }
        
        // 解绑工具栏期间的ESC键监听
        this.unbindToolbarKeyListener();
    }

    // 确认捕获
    async confirmCapture() {
        console.log('用户确认捕获元素');
        this.showDebugMessage('开始捕获元素...');
        
        // 移除工具栏
        this.removeCaptureToolbar();
        
        // 执行实际的捕获操作
        if (this.selectedElement) {
            await this.captureElementData(this.selectedElement);
            
            // 等待截图处理完成，然后显示反馈表单
            setTimeout(() => {
                console.log('截图捕获完成，显示反馈表单，当前截图数量:', this.capturedScreenshots.length);
                this.showDebugMessage('显示反馈表单...');
                
                // 确保selectedFiles数组被初始化
                this.selectedFiles = [];
                
                this.showFeedbackForm({
                    prefilledText: '=== 元素截图已捕获 ===\n请在下方描述您的问题或建议：\n\n'
                });
            }, 500); // 给一点时间让截图处理完成
        }
        
        // 停止检查并通知完成
        this.stopElementInspection('captureCompleted');
        
        // 清理（但不清理截图数据，因为要用在反馈表单中）
        this.selectedElement = null;
        this.removeCaptureToolbar();
        this.cleanupInspection();
    }

    // 取消捕获
    cancelCapture() {
        console.log('🚫 cancelCapture: 用户取消捕获，开始结束检查流程');
        this.showDebugMessage('结束元素检查');
        
        // 移除工具栏
        console.log('🚫 cancelCapture: 移除工具栏');
        this.removeCaptureToolbar();
        
        // 完全停止检查（不再重新开始）
        console.log('🚫 cancelCapture: 调用stopElementInspection，原因：userCancelled');
        this.stopElementInspection('userCancelled');
        
        // 清理状态
        console.log('🚫 cancelCapture: 清理状态');
        this.cleanupCapture();
        
        console.log('🚫 cancelCapture: 取消流程完成');
    }

    // 获取元素信息并填充到反馈内容
    insertTextToElement() {
        console.log('✏️ 获取元素信息并填充到反馈');
        this.showDebugMessage('正在获取元素信息...');
        
        // 移除工具栏
        this.removeCaptureToolbar();
        
        // 检查选中的元素
        if (!this.selectedElement) {
            this.showMessage('未选中有效元素', 'error');
            return;
        }
        
        // 获取元素信息并填充到反馈表单
        this.captureElementInfoAndShowFeedback();
    }

    // 获取元素信息并显示反馈表单
    async captureElementInfoAndShowFeedback() {
        if (!this.selectedElement) {
            this.showMessage('未选中有效元素', 'error');
            return;
        }
        
        const element = this.selectedElement;
        
        // 收集元素基本信息
        const rect = element.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        
        // 收集元素属性
        const attributes = {};
        for (let attr of element.attributes) {
            attributes[attr.name] = attr.value;
        }
        
        // 生成CSS选择器
        const cssSelector = this.generateCSSSelector(element);
        
        // 生成元素信息文本
        const elementInfo = this.generateElementInfoText(element, cssSelector, rect, attributes);
        
        console.log('元素信息已生成:', elementInfo);
        this.showDebugMessage('元素信息已获取，显示反馈表单');
        
        // 显示反馈表单，并预填充元素信息
        this.showFeedbackForm({
            prefilledText: elementInfo
        });
        
        // 停止检查
        this.stopElementInspection('feedbackShown');
        this.cleanupCapture();
    }
    
    // 生成元素信息文本
    generateElementInfoText(element, cssSelector, rect, attributes) {
        const tagName = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const classes = element.className ? element.className.toString().trim().split(' ').map(c => `.${c}`).join('') : '';
        const text = element.textContent ? element.textContent.trim() : '';
        
        let info = `=== 页面元素信息 ===\n`;
        info += `页面URL: ${window.location.href}\n`;
        info += `时间: ${new Date().toLocaleString()}\n\n`;
        
        info += `=== 元素基本信息 ===\n`;
        info += `标签: ${tagName}\n`;
        if (id) info += `ID: ${id}\n`;
        if (classes) info += `类名: ${classes}\n`;
        info += `CSS选择器: ${cssSelector}\n\n`;
        
        info += `=== 元素位置信息 ===\n`;
        info += `位置: (${Math.round(rect.left + window.scrollX)}, ${Math.round(rect.top + window.scrollY)})\n`;
        info += `大小: ${Math.round(rect.width)} × ${Math.round(rect.height)}\n`;
        info += `可视区域位置: (${Math.round(rect.left)}, ${Math.round(rect.top)})\n\n`;
        
        if (text && text.length > 0) {
            info += `=== 元素文本内容 ===\n`;
            info += `${text.length > 200 ? text.substring(0, 200) + '...' : text}\n\n`;
        }
        
        // 只显示重要的属性
        const importantAttrs = ['src', 'href', 'alt', 'title', 'value', 'placeholder', 'type', 'name'];
        const relevantAttrs = Object.entries(attributes).filter(([key]) => 
            importantAttrs.includes(key) || key.startsWith('data-')
        );
        
        if (relevantAttrs.length > 0) {
            info += `=== 重要属性 ===\n`;
            relevantAttrs.forEach(([key, value]) => {
                info += `${key}: ${value}\n`;
            });
            info += '\n';
        }
        
        info += `=== 用户反馈 ===\n`;
        info += `请在此描述您的问题或建议：\n\n`;
        
        return info;
    }



    // 开始编辑模式
    startEditMode() {
        console.log('✏️ 进入编辑模式');
        this.showDebugMessage('编辑功能开发中...');
        
        // 这里可以添加简单的编辑功能
        // 比如添加文字、箭头等
        alert('编辑功能正在开发中，敬请期待！');
    }

    // 通知侧边栏检查已停止（已废弃，统一使用stopElementInspection）
    // notifyInspectionStopped() - 已移除，功能合并到stopElementInspection

    // 通知侧边栏检查已完成（已废弃，统一使用stopElementInspection）  
    // notifyInspectionCompleted() - 已移除，功能合并到stopElementInspection

    // 清理捕获相关状态
    cleanupCapture() {
        this.selectedElement = null;
        this.removeCaptureToolbar();
        this.cleanupInspection();
    }

    // 清理检查相关元素
    cleanupInspection() {
        // 移除覆盖层
        if (this.inspectOverlay) {
            this.inspectOverlay.remove();
            this.inspectOverlay = null;
        }
        
        // 移除高亮框
        if (this.highlightBox) {
            this.highlightBox.remove();
            this.highlightBox = null;
        }
        
        // 移除工具提示
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }
        
        // 移除提示信息
        const hint = document.getElementById('mcp-inspection-hint');
        if (hint) {
            hint.remove();
        }
        
        // 移除调试消息
        const debugMsg = document.getElementById('mcp-debug-message');
        if (debugMsg) {
            debugMsg.remove();
        }
        
        // 移除截图工具栏
        this.removeCaptureToolbar();
        
        // 重置状态
        this.currentHoveredElement = null;
        this.selectedElement = null;
    }
    
    async captureScreenshot() {
        try {
            // 使用 html2canvas 或类似库来捕获页面截图
            // 这里简化实现，实际应该使用更好的截图方案
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            
            // 简单的页面信息捕获
            const pageInfo = this.getPageInfo();
            
            return {
                success: true,
                screenshot: null, // 实际实现中应该返回截图数据
                pageInfo: pageInfo
            };
        } catch (error) {
            console.error('Screenshot capture failed:', error);
            throw error;
        }
    }
    
    getPageInfo() {
        return {
            url: window.location.href,
            title: document.title,
            timestamp: new Date().toISOString(),
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            scroll: {
                x: window.scrollX,
                y: window.scrollY
            }
        };
    }
    
    showFeedbackForm(data = {}) {
        if (this.feedbackOverlay) {
            this.hideFeedbackForm();
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'mcp-feedback-overlay';
        overlay.innerHTML = `
            <div class="mcp-feedback-form">
                <div class="mcp-feedback-header">
                    <h3 class="mcp-feedback-title">💬 提交反馈</h3>
                    <button class="mcp-feedback-close" onclick="this.closest('.mcp-feedback-overlay').remove()">&times;</button>
                </div>
                
                <div class="mcp-feedback-section">
                    <label class="mcp-feedback-label">📝 您的反馈内容：</label>
                    <textarea 
                        class="mcp-feedback-textarea" 
                        placeholder="请描述您的问题、建议或意见..."
                        id="mcp-feedback-text"
                    >${data.prefilledText || ''}</textarea>
                </div>
                
                <div class="mcp-feedback-section">
                    <label class="mcp-feedback-label">📷 添加图片（可选）：</label>
                    <input 
                        type="file" 
                        class="mcp-feedback-file-input" 
                        id="mcp-feedback-files" 
                        multiple 
                        accept="image/*"
                    >
                    <div class="mcp-feedback-drop-zone" id="mcp-feedback-drop-zone">
                        <div class="mcp-feedback-drop-content">
                            <div class="mcp-feedback-drop-icon">📁</div>
                            <div class="mcp-feedback-drop-text">拖拽图片到此处或点击选择文件</div>
                            <div class="mcp-feedback-drop-hint">支持 JPG、PNG、GIF 格式，自动压缩</div>
                        </div>
                    </div>
                    <div class="mcp-feedback-preview" id="mcp-feedback-preview"></div>
                </div>
                
                <div class="mcp-feedback-buttons">
                    <button class="mcp-feedback-button mcp-feedback-button-secondary" onclick="this.closest('.mcp-feedback-overlay').remove()">
                        取消
                    </button>
                    <button class="mcp-feedback-button mcp-feedback-button-primary" id="mcp-feedback-submit">
                        提交反馈
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        this.feedbackOverlay = overlay;
        
        // 重置文件列表
        this.selectedFiles = [];
        
        // 设置事件监听器
        this.setupFeedbackFormListeners();
        
        // 初始状态为禁用，等待MCP服务器确认
        this.setFormDisabledState('等待MCP服务器连接...');
        
        // 检查MCP连接状态
        this.checkMCPConnectionStatus();
        
        // 自动添加捕获的截图到反馈表单
        this.autoAddCapturedScreenshots();
        
        // 聚焦到文本框
        setTimeout(() => {
            const textarea = document.getElementById('mcp-feedback-text');
            if (textarea) textarea.focus();
        }, 100);
    }
    
    // 自动添加捕获的截图到反馈表单
    async autoAddCapturedScreenshots() {
        console.log('autoAddCapturedScreenshots被调用，截图数量:', this.capturedScreenshots.length);
        
        if (this.capturedScreenshots.length === 0) {
            console.log('没有捕获的截图需要添加');
            return;
        }
        
        console.log('开始自动添加', this.capturedScreenshots.length, '张截图到反馈表单');
        
        // 等待DOM准备好
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const preview = document.getElementById('mcp-feedback-preview');
        if (!preview) {
            console.error('找不到预览容器，将在DOM准备后重试');
            // 延迟重试
            setTimeout(() => this.autoAddCapturedScreenshots(), 1000);
            return;
        }
        
        console.log('找到预览容器，开始处理截图');
        
        // 确保selectedFiles数组存在
        if (!this.selectedFiles) {
            this.selectedFiles = [];
            console.log('初始化selectedFiles数组');
        }
        
        let successCount = 0;
        let failCount = 0;
        
        // 将截图转换为File对象并添加到selectedFiles
        for (let i = 0; i < this.capturedScreenshots.length; i++) {
            const screenshotInfo = this.capturedScreenshots[i];
            try {
                console.log(`处理第${i+1}张截图:`, screenshotInfo.elementInfo);
                
                // 将base64转换为File对象
                const file = await this.base64ToFile(
                    screenshotInfo.data, 
                    `截图-${screenshotInfo.elementInfo}-${Date.now()}.png`,
                    'image/png'
                );
                
                this.selectedFiles.push(file);
                successCount++;
                console.log('截图已添加到文件列表:', file.name, '大小:', file.size);
            } catch (error) {
                failCount++;
                console.error('转换截图为文件时出错:', error);
                this.showMessage(`处理截图 ${i+1} 时出错: ${error.message}`, 'error');
            }
        }
        
        // 更新预览显示
        if (successCount > 0) {
            try {
                this.updateFilePreview(this.selectedFiles, preview);
                console.log('预览更新成功，当前文件数量:', this.selectedFiles.length);
            } catch (updateError) {
                console.error('更新预览时出错:', updateError);
                this.showMessage('截图添加成功但预览更新失败', 'warning');
            }
        }
        
        // 清空已处理的截图，避免重复添加
        this.capturedScreenshots = [];
        
        // 显示结果消息
        if (successCount > 0) {
            this.showMessage(`成功添加 ${successCount} 张截图到反馈中${failCount > 0 ? `，${failCount} 张失败` : ''}`, 'success');
        } else if (failCount > 0) {
            this.showMessage(`所有 ${failCount} 张截图添加失败`, 'error');
        }
    }
    
    // 将base64转换为File对象（增强版）
    async base64ToFile(base64Data, filename, mimeType) {
        try {
            console.log('开始转换base64为File对象:', filename);
            
            // 处理data URL格式，移除data:image/png;base64,前缀
            let base64String = base64Data;
            if (base64String.includes(',')) {
                base64String = base64String.split(',')[1];
            }
            
            console.log('处理后的base64长度:', base64String.length);
            
            // 将base64转换为二进制数据
            const byteCharacters = atob(base64String);
            const byteNumbers = new Array(byteCharacters.length);
            
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });
            
            console.log('Blob创建成功，大小:', blob.size);
            
            // 使用兼容性更好的方式创建File对象
            let file;
            try {
                // 尝试使用File构造函数
                file = new File([blob], filename, {
                    type: mimeType,
                    lastModified: Date.now()
                });
                console.log('File对象创建成功:', file.name, file.size);
            } catch (fileError) {
                console.warn('File构造函数失败，使用Blob替代:', fileError);
                // 如果File构造函数不可用，创建一个类似File的Blob对象
                file = blob;
                file.name = filename;
                file.lastModified = Date.now();
                // 确保type属性存在
                if (!file.type) {
                    Object.defineProperty(file, 'type', { value: mimeType });
                }
            }
            
            return file;
        } catch (error) {
            console.error('base64转File失败:', error);
            throw error;
        }
    }
    
    setupFeedbackFormListeners() {
        const fileInput = document.getElementById('mcp-feedback-files');
        const dropZone = document.getElementById('mcp-feedback-drop-zone');
        const preview = document.getElementById('mcp-feedback-preview');
        const submitBtn = document.getElementById('mcp-feedback-submit');
        
        // 使用实例变量而不是局部变量
        if (!this.selectedFiles) {
            this.selectedFiles = [];
        }
        
        // 文件选择处理
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                await this.handleFileSelection(files, this.selectedFiles, preview);
            });
        }
        
        // 拖拽区域点击处理
        if (dropZone) {
            dropZone.addEventListener('click', () => {
                fileInput.click();
            });
        }
        
        // 拖拽事件处理
        if (dropZone) {
            // 阻止默认拖拽行为
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, this.preventDefaults, false);
                document.body.addEventListener(eventName, this.preventDefaults, false);
            });
            
            // 拖拽进入和离开的视觉反馈
            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.add('active');
                }, false);
            });
            
            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.remove('active');
                }, false);
            });
            
            // 处理文件拖拽放置
            dropZone.addEventListener('drop', async (e) => {
                const dt = e.dataTransfer;
                const files = Array.from(dt.files).filter(file => file.type.startsWith('image/'));
                
                if (files.length > 0) {
                    await this.handleFileSelection(files, this.selectedFiles, preview);
                } else {
                    this.showMessage('请拖拽图片文件', 'error');
                }
            }, false);
        }
        
        // 提交按钮处理
        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                this.submitFeedback(this.selectedFiles);
            });
        }
        
        // 点击遮罩关闭
        if (this.feedbackOverlay) {
            this.feedbackOverlay.addEventListener('click', (e) => {
                if (e.target === this.feedbackOverlay) {
                    this.hideFeedbackForm();
                }
            });
        }
    }
    
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    async handleFileSelection(newFiles, selectedFiles, preview) {
        const compressedFiles = [];
        
        for (const file of newFiles) {
            if (file.type.startsWith('image/')) {
                try {
                    const compressedFile = await this.compressImage(file);
                    compressedFiles.push(compressedFile);
                } catch (error) {
                    console.warn('图片压缩失败，使用原文件:', error);
                    compressedFiles.push(file);
                }
            }
        }
        
        selectedFiles.push(...compressedFiles);
        this.updateFilePreview(selectedFiles, preview);
    }
    
    async compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // 计算新的尺寸
                let { width, height } = img;
                
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width *= ratio;
                    height *= ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // 绘制压缩后的图片
                ctx.drawImage(img, 0, 0, width, height);
                
                // 转换为Blob
                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name, {
                        type: file.type,
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, file.type, quality);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }
    
    updateFilePreview(files, previewContainer) {
        if (!previewContainer) {
            console.error('预览容器不存在');
            return;
        }
        
        console.log('更新文件预览，文件数量:', files.length);
        previewContainer.innerHTML = '';
        
        files.forEach((file, index) => {
            console.log(`处理预览文件 ${index+1}:`, file.name, file.type, file.size);
            
            if (file.type && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    console.log(`文件 ${index+1} 读取成功`);
                    
                    const item = document.createElement('div');
                    item.className = 'mcp-feedback-preview-item';
                    item.dataset.fileIndex = index;
                    
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.className = 'mcp-feedback-preview-image';
                    img.alt = 'Preview';
                    img.onload = () => {
                        console.log(`图片 ${index+1} 预览加载成功`);
                    };
                    img.onerror = () => {
                        console.error(`图片 ${index+1} 预览加载失败`);
                        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAyOEMyNCA0IDI4IDIwIDI4IDIwQzI4IDI0IDI0IDI4IDIwIDI4WiIgZmlsbD0iIzlDQTNBRiIvPgo8L3N2Zz4K';
                        img.title = '图片加载失败';
                    };
                    
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'mcp-feedback-preview-remove';
                    removeBtn.innerHTML = '&times;';
                    removeBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const fileIndex = parseInt(item.dataset.fileIndex);
                        console.log(`删除文件 ${fileIndex+1}`);
                        files.splice(fileIndex, 1);
                        this.selectedFiles = files; // 更新实例变量
                        this.updateFilePreview(this.selectedFiles, previewContainer);
                    };
                    
                    item.appendChild(img);
                    item.appendChild(removeBtn);
                    previewContainer.appendChild(item);
                };
                
                reader.onerror = (error) => {
                    console.error(`文件 ${index+1} 读取失败:`, error);
                };
                
                reader.readAsDataURL(file);
            } else {
                console.warn(`文件 ${index+1} 不是图片类型:`, file.type);
            }
        });
        
        console.log('文件预览更新完成');
    }
    
    async submitFeedback(files) {
        console.log('Submitting feedback with files:', files);
        
        try {
            const textArea = document.getElementById('mcp-feedback-text');
            const feedbackText = textArea ? textArea.value.trim() : '';
            
            if (!feedbackText && files.length === 0) {
                this.showMessage('请至少提供文字反馈或图片', 'error');
                return;
            }
            
            // 显示提交中状态
            const submitButton = document.querySelector('.mcp-feedback-button-primary');
            if (submitButton) {
                submitButton.textContent = '提交中...';
                submitButton.disabled = true;
            }
            
            // 处理图片文件
            const imageData = [];
            if (files && files.length > 0) {
                console.log('Processing', files.length, 'files');
                for (const file of files) {
                    if (file.type.startsWith('image/')) {
                        try {
                            const base64 = await this.fileToBase64(file);
                            imageData.push({
                                name: file.name,
                                type: file.type,
                                size: file.size,
                                data: base64
                            });
                            console.log('Processed image:', file.name);
                        } catch (fileError) {
                            console.error('Error processing file:', file.name, fileError);
                            this.showMessage(`处理文件 ${file.name} 时出错`, 'error');
                        }
                    }
                }
            }
            
            const feedbackData = {
                textFeedback: feedbackText,
                images: imageData,
                pageInfo: this.getPageInfo(),
                timestamp: new Date().toISOString()
            };
            
            console.log('Sending feedback data to background script:', feedbackData);
            
            // 发送到 background script
            chrome.runtime.sendMessage({
                action: 'submitFeedback',
                data: feedbackData
            }, (response) => {
                console.log('Background script response:', response);
                
                if (response && response.success) {
                    // 提交成功后立即清空表单并禁用
                    this.clearAndDisableFeedbackForm();
                    this.showMessage('反馈已提交，等待服务器确认...', 'info');
                    
                    // 不立即关闭表单，等待MCP服务器确认
                } else {
                    const errorMsg = response?.error || '未知错误';
                    this.showMessage('反馈提交失败：' + errorMsg, 'error');
                
                // 恢复提交按钮状态
                if (submitButton) {
                    submitButton.textContent = '提交反馈';
                    submitButton.disabled = false;
                    }
                }
            });
            
        } catch (error) {
            console.error('Submit feedback error:', error);
            let errorMessage = '反馈提交失败：';
            
            if (error.message.includes('Extension context invalidated')) {
                errorMessage += '扩展已重新加载，请刷新页面后重试';
            } else if (error.message.includes('Could not establish connection')) {
                errorMessage += '无法连接到后台服务，请检查扩展状态';
            } else {
                errorMessage += error.message;
            }
            
            this.showMessage(errorMessage, 'error');
            
            // 恢复提交按钮状态
            const submitButton = document.querySelector('.mcp-feedback-button-primary');
            if (submitButton) {
                submitButton.textContent = '提交反馈';
                submitButton.disabled = false;
            }
        }
    }
    
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    clearAndDisableFeedbackForm() {
        console.log('清空并禁用反馈表单');
        
        // 清空文本区域
        const textArea = document.getElementById('mcp-feedback-text');
        if (textArea) {
            textArea.value = '';
            textArea.disabled = true;
            textArea.placeholder = '等待服务器确认中...';
        }
        
        // 清空图片列表
        this.selectedFiles = [];
        this.capturedScreenshots = [];
        const preview = document.getElementById('mcp-feedback-preview');
        if (preview) {
            preview.innerHTML = '';
        }
        
        // 禁用文件上传
        const fileInput = document.getElementById('mcp-feedback-files');
        if (fileInput) {
            fileInput.disabled = true;
            fileInput.value = '';
        }
        
        // 禁用拖拽区域
        const dropZone = document.getElementById('mcp-feedback-drop-zone');
        if (dropZone) {
            dropZone.style.pointerEvents = 'none';
            dropZone.style.opacity = '0.5';
            dropZone.innerHTML = `
                <div class="mcp-feedback-drop-content">
                    <div class="mcp-feedback-drop-icon">⏳</div>
                    <div class="mcp-feedback-drop-text">等待服务器确认中...</div>
                    <div class="mcp-feedback-drop-hint">反馈已提交，请等待确认</div>
                </div>
            `;
        }
        
        // 禁用提交按钮
        const submitButton = document.getElementById('mcp-feedback-submit');
        if (submitButton) {
            submitButton.textContent = '等待确认中...';
            submitButton.disabled = true;
        }
        
        console.log('反馈表单已清空并禁用');
    }

    enableFeedbackForm() {
        console.log('重新启用反馈表单');
        
        // 启用文本区域
        const textArea = document.getElementById('mcp-feedback-text');
        if (textArea) {
            textArea.disabled = false;
            textArea.placeholder = '请描述您的问题、建议或意见...';
        }
        
        // 启用文件上传
        const fileInput = document.getElementById('mcp-feedback-files');
        if (fileInput) {
            fileInput.disabled = false;
        }
        
        // 恢复拖拽区域
        const dropZone = document.getElementById('mcp-feedback-drop-zone');
        if (dropZone) {
            dropZone.style.pointerEvents = 'auto';
            dropZone.style.opacity = '1';
            dropZone.innerHTML = `
                <div class="mcp-feedback-drop-content">
                    <div class="mcp-feedback-drop-icon">📁</div>
                    <div class="mcp-feedback-drop-text">拖拽图片到此处或点击选择文件</div>
                    <div class="mcp-feedback-drop-hint">支持 JPG、PNG、GIF 格式，自动压缩</div>
                </div>
            `;
        }
        
        // 恢复提交按钮
        const submitButton = document.getElementById('mcp-feedback-submit');
        if (submitButton) {
            submitButton.textContent = '提交反馈';
            submitButton.disabled = false;
        }
        
        console.log('反馈表单已重新启用');
    }

    setFormDisabledState(message = '等待服务器连接...') {
        console.log('设置表单为禁用状态:', message);
        
        // 禁用文本区域
        const textArea = document.getElementById('mcp-feedback-text');
        if (textArea) {
            textArea.disabled = true;
            textArea.placeholder = message;
            textArea.value = '';
        }
        
        // 禁用文件上传
        const fileInput = document.getElementById('mcp-feedback-files');
        if (fileInput) {
            fileInput.disabled = true;
            fileInput.value = '';
        }
        
        // 禁用拖拽区域
        const dropZone = document.getElementById('mcp-feedback-drop-zone');
        if (dropZone) {
            dropZone.style.pointerEvents = 'none';
            dropZone.style.opacity = '0.5';
            dropZone.innerHTML = `
                <div class="mcp-feedback-drop-content">
                    <div class="mcp-feedback-drop-icon">🔌</div>
                    <div class="mcp-feedback-drop-text">${message}</div>
                    <div class="mcp-feedback-drop-hint">请先连接到MCP服务器</div>
                </div>
            `;
        }
        
        // 禁用提交按钮
        const submitButton = document.getElementById('mcp-feedback-submit');
        if (submitButton) {
            submitButton.textContent = '请先连接MCP服务器';
            submitButton.disabled = true;
        }
    }

    async checkMCPConnectionStatus() {
        try {
            console.log('检查MCP连接状态...');
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'getConnectionStatus'
                }, resolve);
            });
            
            console.log('MCP连接状态:', response);
            
            if (response && response.isConnected) {
                console.log('MCP已连接，启用反馈表单');
                this.enableFeedbackForm();
                this.showMessage('MCP服务器已连接，可以提交反馈', 'success');
            } else {
                console.log('MCP未连接，保持表单禁用状态');
                this.setFormDisabledState('MCP服务器未连接');
            }
        } catch (error) {
            console.error('检查MCP连接状态失败:', error);
            this.setFormDisabledState('连接状态检查失败');
        }
    }
    
    hideFeedbackForm() {
        if (this.feedbackOverlay) {
            this.feedbackOverlay.remove();
            this.feedbackOverlay = null;
        }
    }
    
    handleKeyDown(event) {
        // F2: 打开反馈表单
        if (event.key === 'F2' && this.isActive) {
            event.preventDefault();
            this.showFeedbackForm();
        }
        
        // ESC: 关闭反馈表单
        if (event.key === 'Escape' && this.feedbackOverlay) {
            event.preventDefault();
            this.hideFeedbackForm();
        }
    }
    
    showMessage(text, type = 'success') {
        const message = document.createElement('div');
        message.className = `mcp-feedback-message mcp-feedback-message-${type}`;
        message.textContent = text;
        
        document.body.appendChild(message);
        
        setTimeout(() => {
            message.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (message.parentNode) {
                    message.remove();
                }
            }, 300);
        }, 3000);
    }
    
    // 处理自动化命令
    async handleAutomationCommand(request) {
        console.log('处理自动化命令:', request.type, request.data);

        try {
            switch (request.type) {
                case 'navigate':
                    return await this.automateNavigate(request.data);

                case 'click':
                    return await this.automateClick(request.data);

                case 'fillInput':
                    return await this.automateFillInput(request.data);

                case 'executeScript':
                    return await this.automateExecuteScript(request.data);

                case 'getPageInfo':
                    return await this.automateGetPageInfo(request.data);

                case 'takeScreenshot':
                    return await this.automateTakeScreenshot(request.data);

                case 'waitForElement':
                    return await this.automateWaitForElement(request.data);

                // 新增：智能表单填写
                case 'fillForm':
                    return await this.automateSmartFillForm(request.data);

                // 新增：智能元素交互
                case 'interactElement':
                    return await this.automateSmartInteract(request.data);

                // 新增：内容提取
                case 'extractContent':
                    return await this.automateExtractContent(request.data);

                default:
                    throw new Error(`Unknown automation command: ${request.type}`);
            }
        } catch (error) {
            console.error('自动化命令执行失败:', error);
            throw error;
        }
    }

    // 新增：智能表单填写方法
    async automateSmartFillForm(data) {
        const { formData, submitAfter = false } = data;
        console.log('智能表单填写:', formData);

        const results = [];
        let successCount = 0;

        for (const [fieldName, value] of Object.entries(formData)) {
            try {
                const result = await this.smartFillField(fieldName, value);
                results.push(result);
                if (result.success) successCount++;
            } catch (error) {
                results.push({
                    success: false,
                    fieldName,
                    error: error.message
                });
            }
        }

        // 如果需要提交表单
        if (submitAfter) {
            try {
                const submitButton = this.findSubmitButton();
                if (submitButton) {
                    await this.waitForDelay(500); // 等待表单状态更新
                    submitButton.click();
                    results.push({ success: true, action: 'submit', message: 'Form submitted' });
                }
            } catch (error) {
                results.push({ success: false, action: 'submit', error: error.message });
            }
        }

        return {
            success: successCount > 0,
            totalFields: Object.keys(formData).length,
            successCount,
            results
        };
    }

    // 智能字段填写
    async smartFillField(fieldName, value) {
        console.log(`填写字段: ${fieldName} = ${value}`);

        // 多种策略尝试定位字段
        const strategies = [
            // 策略1: 基于Vue组件的label识别
            () => this.findFieldByVueLabel(fieldName),
            // 策略2: 基于placeholder识别
            () => this.findFieldByPlaceholder(fieldName),
            // 策略3: 基于label元素识别
            () => this.findFieldByLabel(fieldName),
            // 策略4: 基于name属性识别
            () => this.findFieldByName(fieldName),
            // 策略5: 基于id识别
            () => this.findFieldById(fieldName),
            // 策略6: 智能文本匹配
            () => this.findFieldBySmartText(fieldName)
        ];

        let element = null;
        let strategy = '';

        for (let i = 0; i < strategies.length; i++) {
            element = strategies[i]();
            if (element) {
                strategy = `strategy_${i + 1}`;
                break;
            }
        }

        if (!element) {
            throw new Error(`Field not found: ${fieldName}`);
        }

        // 根据元素类型进行智能填写
        const result = await this.smartFillElement(element, value, fieldName);
        result.strategy = strategy;
        result.fieldName = fieldName;

        return result;
    }

    // 基于Vue组件label查找字段
    findFieldByVueLabel(labelText) {
        // 查找包含指定文本的Vue表单项
        const formItems = document.querySelectorAll('.el-form-item');
        for (const item of formItems) {
            const label = item.querySelector('.el-form-item__label');
            if (label && this.textMatches(label.textContent, labelText)) {
                // 查找对应的输入控件
                return this.findInputInFormItem(item);
            }
        }
        return null;
    }

    // 在表单项中查找输入控件
    findInputInFormItem(formItem) {
        // 按优先级查找各种输入控件
        const selectors = [
            'input[type="text"]',
            'input:not([type="hidden"])',
            'textarea',
            '.el-input input',
            '.el-textarea textarea',
            '.el-select',
            '.el-date-editor',
            '.el-time-picker',
            '.el-checkbox',
            '.el-radio'
        ];

        for (const selector of selectors) {
            const element = formItem.querySelector(selector);
            if (element && this.isInteractableElement(element)) {
                return element;
            }
        }
        return null;
    }

    // 检查元素是否可交互
    isInteractableElement(element) {
        if (!element) return false;
        
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return !element.disabled &&
               style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               rect.width > 0 &&
               rect.height > 0;
    }

    // 文本匹配函数
    textMatches(text1, text2) {
        if (!text1 || !text2) return false;
        
        const normalize = (str) => str.replace(/[*\s:：]/g, '').toLowerCase();
        return normalize(text1).includes(normalize(text2)) || 
               normalize(text2).includes(normalize(text1));
    }

    // 基于placeholder查找
    findFieldByPlaceholder(fieldName) {
        const selector = `input[placeholder*="${fieldName}"], textarea[placeholder*="${fieldName}"]`;
        return document.querySelector(selector);
    }

    // 基于label查找
    findFieldByLabel(fieldName) {
        const labels = document.querySelectorAll('label');
        for (const label of labels) {
            if (this.textMatches(label.textContent, fieldName)) {
                const target = label.getAttribute('for');
                if (target) {
                    return document.getElementById(target);
                }
                // 查找label内部的输入元素
                const input = label.querySelector('input, textarea, select');
                if (input) return input;
            }
        }
        return null;
    }

    // 基于name属性查找
    findFieldByName(fieldName) {
        const normalizedName = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const inputs = document.querySelectorAll('input, textarea, select');
        
        for (const input of inputs) {
            const name = (input.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (name.includes(normalizedName) || normalizedName.includes(name)) {
                return input;
            }
        }
        return null;
    }

    // 基于id查找
    findFieldById(fieldName) {
        const normalizedName = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const inputs = document.querySelectorAll('input, textarea, select');
        
        for (const input of inputs) {
            const id = (input.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (id.includes(normalizedName) || normalizedName.includes(id)) {
                return input;
            }
        }
        return null;
    }

    // 智能文本匹配查找
    findFieldBySmartText(fieldName) {
        // 查找附近有相关文本的输入框
        const inputs = document.querySelectorAll('input, textarea, select');
        
        for (const input of inputs) {
            // 检查父级元素中是否包含相关文本
            let parent = input.parentElement;
            let level = 0;
            
            while (parent && level < 3) {
                if (this.textMatches(parent.textContent, fieldName)) {
                    return input;
                }
                parent = parent.parentElement;
                level++;
            }
        }
        return null;
    }

    // 智能填写元素
    async smartFillElement(element, value, fieldName) {
        console.log(`智能填写元素:`, element.tagName, element.type, value);

        // 滚动到元素位置
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.waitForDelay(300);

        // 根据元素类型选择填写策略
        if (element.classList.contains('el-select') || element.closest('.el-select')) {
            return await this.fillVueSelect(element, value, fieldName);
        } else if (element.classList.contains('el-date-editor') || element.closest('.el-date-editor')) {
            return await this.fillVueDatePicker(element, value, fieldName);
        } else if (element.type === 'checkbox' || element.classList.contains('el-checkbox')) {
            return await this.fillVueCheckbox(element, value, fieldName);
        } else if (element.type === 'radio' || element.classList.contains('el-radio')) {
            return await this.fillVueRadio(element, value, fieldName);
        } else if (element.tagName === 'TEXTAREA' || element.type === 'text') {
            return await this.fillVueInput(element, value, fieldName);
        } else {
            // 默认文本填写
            return await this.fillVueInput(element, value, fieldName);
        }
    }

    // Vue Select填写
    async fillVueSelect(element, value, fieldName) {
        const selectWrapper = element.closest('.el-select') || element;
        const input = selectWrapper.querySelector('input') || selectWrapper;

        // 点击打开下拉框
        selectWrapper.click();
        await this.waitForDelay(500);

        // 查找匹配的选项
        const options = document.querySelectorAll('.el-option');
        let selectedOption = null;

        for (const option of options) {
            if (this.textMatches(option.textContent, value)) {
                selectedOption = option;
                break;
            }
        }

        if (selectedOption) {
            selectedOption.click();
            await this.waitForDelay(200);
            return { success: true, message: `Selected option: ${value}` };
        } else {
            // 如果没找到选项，尝试直接输入
            if (input) {
                input.focus();
                input.value = value;
                this.triggerVueEvents(input);
            }
            return { success: false, message: `Option not found: ${value}` };
        }
    }

    // Vue DatePicker填写
    async fillVueDatePicker(element, value, fieldName) {
        const dateWrapper = element.closest('.el-date-editor') || element;
        const input = dateWrapper.querySelector('input') || dateWrapper;

        // 聚焦并填写日期
        input.focus();
        input.value = value;
        this.triggerVueEvents(input);

        // 失去焦点以触发日期解析
        input.blur();
        await this.waitForDelay(200);

        return { success: true, message: `Date filled: ${value}` };
    }

    // Vue Checkbox填写
    async fillVueCheckbox(element, shouldCheck, fieldName) {
        const checkboxWrapper = element.closest('.el-checkbox') || element;
        const isCurrentlyChecked = element.checked || checkboxWrapper.classList.contains('is-checked');
        
        const needsToggle = (shouldCheck && !isCurrentlyChecked) || (!shouldCheck && isCurrentlyChecked);
        
        if (needsToggle) {
            checkboxWrapper.click();
            await this.waitForDelay(200);
        }

        return { success: true, message: `Checkbox ${shouldCheck ? 'checked' : 'unchecked'}` };
    }

    // Vue Radio填写
    async fillVueRadio(element, value, fieldName) {
        // 查找匹配的radio选项
        const radioGroup = element.closest('.el-radio-group');
        if (radioGroup) {
            const radios = radioGroup.querySelectorAll('.el-radio');
            for (const radio of radios) {
                if (this.textMatches(radio.textContent, value)) {
                    radio.click();
                    await this.waitForDelay(200);
                    return { success: true, message: `Radio selected: ${value}` };
                }
            }
        } else {
            // 单个radio
            if (this.textMatches(element.textContent || element.value, value)) {
                element.click();
                return { success: true, message: `Radio selected: ${value}` };
            }
        }

        return { success: false, message: `Radio option not found: ${value}` };
    }

    // Vue Input填写
    async fillVueInput(element, value, fieldName) {
        // 聚焦元素
        element.focus();
        await this.waitForDelay(100);

        // 清空现有值
        element.value = '';
        this.triggerVueEvents(element);

        // 模拟逐字符输入
        for (let i = 0; i < value.length; i++) {
            element.value += value[i];
            this.triggerVueEvents(element);
            await this.waitForDelay(30); // 模拟真实输入
        }

        // 失去焦点
        element.blur();
        await this.waitForDelay(100);

        return { success: true, message: `Input filled: ${value}` };
    }

    // 触发Vue相关事件
    triggerVueEvents(element) {
        // 触发常见的Vue事件
        const events = ['input', 'change', 'blur', 'focus'];
        events.forEach(eventType => {
            element.dispatchEvent(new Event(eventType, { bubbles: true }));
        });

        // 触发Vue特定事件
        if (element.__vue__ || element._vueParentComponent) {
            // Vue 2/3 兼容性
            const changeEvent = new CustomEvent('vue:change', { 
                bubbles: true, 
                detail: { value: element.value }
            });
            element.dispatchEvent(changeEvent);
        }
    }

    // 查找提交按钮
    findSubmitButton() {
        const selectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            '.el-button--primary',
            'button:contains("提交")',
            'button:contains("立即创建")',
            'button:contains("确定")',
            'button:contains("保存")'
        ];

        for (const selector of selectors) {
            const button = document.querySelector(selector);
            if (button && this.isInteractableElement(button)) {
                return button;
            }
        }

        // 查找包含提交相关文本的按钮
        const buttons = document.querySelectorAll('button');
        for (const button of buttons) {
            const text = button.textContent.trim();
            if (/提交|立即创建|确定|保存|submit/i.test(text)) {
                return button;
            }
        }

        return null;
    }

    // 等待延迟
    async waitForDelay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    cleanup() {
        this.stopFeedbackCollection();

        // 清理截图数据
        this.capturedScreenshots = [];
        this.selectedFiles = [];

        // 移除样式
        const styles = document.getElementById('mcp-feedback-styles');
        if (styles) {
            styles.remove();
        }
    }

    // 新增：智能元素交互
    async automateSmartInteract(data) {
        const { selector, action = 'click', value = null, options = {} } = data;
        console.log('智能元素交互:', selector, action, value);

        const element = document.querySelector(selector);
        if (!element) {
            throw new Error(`Element not found: ${selector}`);
        }

        // 滚动到元素位置
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.waitForDelay(300);

        switch (action) {
            case 'click':
                element.click();
                break;
            case 'doubleClick':
                element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                break;
            case 'hover':
                element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                break;
            case 'focus':
                element.focus();
                break;
            case 'blur':
                element.blur();
                break;
            case 'select':
                if (element.tagName === 'SELECT') {
                    element.value = value;
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                }
                break;
            default:
                throw new Error(`Unknown action: ${action}`);
        }

        return { success: true, message: `Action ${action} performed on ${selector}` };
    }

    // 新增：内容提取
    async automateExtractContent(data) {
        const { selectors = [], type = 'text', options = {} } = data;
        console.log('内容提取:', selectors, type);

        const results = [];

        if (selectors.length === 0) {
            // 如果没有指定选择器，返回页面基本信息
            return {
                success: true,
                data: {
                    url: window.location.href,
                    title: document.title,
                    timestamp: new Date().toISOString()
                }
            };
        }

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            const selectorResults = [];

            for (const element of elements) {
                let content = '';
                switch (type) {
                    case 'text':
                        content = element.textContent?.trim() || '';
                        break;
                    case 'html':
                        content = element.innerHTML;
                        break;
                    case 'value':
                        content = element.value || '';
                        break;
                    case 'href':
                        content = element.href || '';
                        break;
                    case 'src':
                        content = element.src || '';
                        break;
                    case 'attributes':
                        const attrs = {};
                        for (const attr of element.attributes) {
                            attrs[attr.name] = attr.value;
                        }
                        content = attrs;
                        break;
                }
                selectorResults.push(content);
            }

            results.push({
                selector,
                count: elements.length,
                content: selectorResults
            });
        }

        return { success: true, data: results };
    }

    // 原来的方法恢复
    // 导航到指定URL
    async automateNavigate(data) {
        const { url, waitForLoad } = data;
        console.log('导航到:', url);

        window.location.href = url;

        if (waitForLoad) {
            await new Promise((resolve) => {
                if (document.readyState === 'complete') {
                    resolve();
                } else {
                    window.addEventListener('load', resolve, { once: true });
                }
            });
        }

        return { success: true, message: `Successfully navigated to ${url}` };
    }

    // 点击元素
    async automateClick(data) {
        const { selector, waitTime } = data;
        console.log('点击元素:', selector);

        const element = document.querySelector(selector);
        if (!element) {
            throw new Error(`Element not found: ${selector}`);
        }

        // 滚动到元素位置
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 等待一下确保滚动完成
        await new Promise(resolve => setTimeout(resolve, 500));

        // 点击元素
        element.click();

        // 等待指定时间
        if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        return { success: true, message: `Clicked element: ${selector}` };
    }

    // 填写输入框
    async automateFillInput(data) {
        const { selector, text, clearFirst } = data;
        console.log('填写输入框:', selector, '内容:', text);

        const element = document.querySelector(selector);
        if (!element) {
            throw new Error(`Input element not found: ${selector}`);
        }

        // 滚动到元素位置
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 聚焦元素
        element.focus();

        // 清空现有内容
        if (clearFirst) {
            element.value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // 模拟用户输入
        for (let i = 0; i < text.length; i++) {
            element.value += text[i];
            element.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 50)); // 模拟真实输入速度
        }

        // 触发change事件
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();

        return { success: true, message: `Filled input ${selector} with: ${text}` };
    }

    // 执行JavaScript
    async automateExecuteScript(data) {
        const { script, returnResult } = data;
        console.log('执行脚本:', script.substring(0, 100) + '...');

        try {
            const result = eval(script);

            if (returnResult) {
                return {
                    success: true,
                    result: result,
                    message: 'Script executed successfully'
                };
            } else {
                return { success: true, message: 'Script executed successfully' };
            }
        } catch (error) {
            throw new Error(`Script execution failed: ${error.message}`);
        }
    }

    // 获取页面信息
    async automateGetPageInfo(data) {
        const { includeElements, elementSelector } = data;
        console.log('获取页面信息, 包含元素:', includeElements);

        const pageInfo = {
            url: window.location.href,
            title: document.title,
            timestamp: new Date().toISOString()
        };

        if (includeElements) {
            const selector = elementSelector || 'input, button, textarea, select, a';
            const elements = Array.from(document.querySelectorAll(selector));

            pageInfo.elements = elements.map((el, index) => {
                const rect = el.getBoundingClientRect();
                return {
                    index,
                    tagName: el.tagName.toLowerCase(),
                    type: el.type || '',
                    id: el.id || '',
                    className: el.className || '',
                    text: el.textContent?.trim().substring(0, 100) || '',
                    href: el.href || '',
                    visible: rect.width > 0 && rect.height > 0 &&
                             window.getComputedStyle(el).display !== 'none'
                };
            });
        }

        return { success: true, data: pageInfo };
    }

    // 截图
    async automateTakeScreenshot(data) {
        console.log('请求截图');

        // 通过background script请求截图
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'captureElementScreenshot'
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response.success) {
                    resolve({
                        success: true,
                        screenshot: response.screenshot,
                        message: 'Screenshot captured successfully'
                    });
                } else {
                    reject(new Error(response.error || 'Screenshot failed'));
                }
            });
        });
    }

    // 等待元素出现
    async automateWaitForElement(data) {
        const { selector, timeout } = data;
        console.log('等待元素出现:', selector);

        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null) {
                return {
                    success: true,
                    message: `Element found: ${selector}`,
                    waitTime: Date.now() - startTime
                };
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        throw new Error(`Element not found within ${timeout}ms: ${selector}`);
    }
}

// 初始化 content script
// 初始化内容脚本
console.log('🔄 开始加载 MCP Feedback Content Script...');

// 立即初始化
const mcpFeedbackContent = new MCPFeedbackContent();

// 在DOM ready时再次确认初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('📄 DOM 加载完成，Content Script 准备就绪');
    });
} else {
    console.log('📄 DOM 已经加载完成，Content Script 准备就绪');
}

// 导出用于测试
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MCPFeedbackContent;
}