// 元素检查器 - 的元素选择功能
class ElementInspector {
    constructor() {
        this.isActive = false;
        this.highlightedElement = null;
        this.selectedElement = null;
        this.overlay = null;
        this.originalCursor = null;
        this.boundEvents = {
            mouseover: this.handleMouseOver.bind(this),
            click: this.handleClick.bind(this),
            keydown: this.handleKeyDown.bind(this)
        };
        
        this.init();
    }

    init() {
        console.log('🔧 Element Inspector: 正在初始化...');
        
        // 监听来自扩展的消息
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('📨 Element Inspector: 收到消息:', message.action);
            
            try {
                if (message.action === 'startElementCapture') {
                    console.log('▶️ Element Inspector: 处理启动元素捕获请求');
                    this.startInspection();
                    sendResponse({ success: true, message: 'Element inspection started' });
                    return true; // 保持消息通道开放
                } else if (message.action === 'stopElementCapture') {
                    console.log('⏹️ Element Inspector: 处理停止元素捕获请求');
                    this.stopInspection();
                    sendResponse({ success: true, message: 'Element inspection stopped' });
                    return true; // 保持消息通道开放
                } else {
                    console.log('❓ Element Inspector: 未知消息类型:', message.action);
                    sendResponse({ success: false, message: 'Unknown action: ' + message.action });
                }
            } catch (error) {
                console.error('❌ Element Inspector: 处理消息时出错:', error);
                sendResponse({ success: false, message: 'Error: ' + error.message });
            }
        });
        
        console.log('✅ Element Inspector: 初始化完成，消息监听器已设置');
    }

    startInspection() {
        if (this.isActive) {
            console.log('⚠️ Element Inspector: 检查模式已经处于活跃状态');
            return;
        }

        console.log('🚀 Element Inspector: 开始启动检查模式...');
        
        this.isActive = true;
        this.createOverlay();
        this.addEventListeners();
        this.originalCursor = document.body.style.cursor;
        document.body.style.cursor = 'crosshair';
        
        // 显示提示信息
        this.showInspectionTip();
        
        console.log('✅ Element Inspector: 元素检查模式已成功启动');
        console.log('🎯 Element Inspector: 当前状态 - isActive:', this.isActive);
    }

    stopInspection() {
        if (!this.isActive) return;

        console.log('🛑 停止元素检查模式...');
        
        this.isActive = false;
        
        // 强制清理所有事件监听器
        this.removeEventListeners();
        
        // 清理所有UI元素
        this.removeOverlay();
        this.removeHighlight();
        this.removeSelectedHighlight();  // 确保移除选中高亮
        this.removeInspectionTip();
        this.removeCaptureToolbar();  // 确保移除工具栏
        
        // 恢复原始光标
        if (this.originalCursor !== null) {
            document.body.style.cursor = this.originalCursor;
            this.originalCursor = null;
        }
        
        // 重置选中的元素
        this.selectedElement = null;
        this.highlightedElement = null;
        
        console.log('🔍 元素检查模式已停止');
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'mcp-element-inspector-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 999999;
            background: rgba(0, 123, 255, 0.1);
        `;
        document.body.appendChild(this.overlay);
    }

    removeOverlay() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    showInspectionTip() {
        const tip = document.createElement('div');
        tip.id = 'mcp-inspection-tip';
        tip.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                font-size: 14px;
                z-index: 1000000;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                max-width: 300px;
                line-height: 1.4;
            ">
                <div style="font-weight: bold; margin-bottom: 8px;">🔍 元素检查模式</div>
                <div style="margin-bottom: 4px;">• 移动鼠标高亮元素</div>
                <div style="margin-bottom: 4px;">• 点击捕获选中元素</div>
            </div>
        `;
        document.body.appendChild(tip);
    }

    removeInspectionTip() {
        const tip = document.getElementById('mcp-inspection-tip');
        if (tip) {
            tip.remove();
        }
    }

    addEventListeners() {
        // 使用 capture=true 和最高优先级来确保我们的事件处理器先执行
        document.addEventListener('mouseover', this.boundEvents.mouseover, true);
        document.addEventListener('click', this.boundEvents.click, true);
        
        // 为键盘事件使用多种监听方式确保可靠性
        document.addEventListener('keydown', this.boundEvents.keydown, true);
        window.addEventListener('keydown', this.boundEvents.keydown, true);
        document.body.addEventListener('keydown', this.boundEvents.keydown, true);
        
        console.log('🎯 Element Inspector: 事件监听器已添加');
    }

    removeEventListeners() {
        document.removeEventListener('mouseover', this.boundEvents.mouseover, true);
        document.removeEventListener('click', this.boundEvents.click, true);
        document.removeEventListener('keydown', this.boundEvents.keydown, true);
        window.removeEventListener('keydown', this.boundEvents.keydown, true);
        document.body.removeEventListener('keydown', this.boundEvents.keydown, true);
        
        console.log('🗑️ Element Inspector: 所有事件监听器已移除');
    }

    handleMouseOver(event) {
        if (!this.isActive) return;

        event.preventDefault();
        event.stopPropagation();

        // 忽略我们自己创建的元素
        if (event.target.id === 'mcp-element-inspector-overlay' || 
            event.target.id === 'mcp-inspection-tip' ||
            event.target.closest('#mcp-inspection-tip') ||
            event.target.closest('#mcp-selected-highlight') ||
            event.target.closest('#mcp-selected-info') ||
            event.target.id === 'mcp-capture-toolbar' ||
            event.target.closest('#mcp-capture-toolbar')) {
            return;
        }

        this.highlightElement(event.target);
    }

    handleClick(event) {
        if (!this.isActive) return;
        
        console.log('🖱️ 点击事件，目标元素:', event.target);
        
        event.preventDefault();
        event.stopPropagation();
        
        const element = event.target;
        
        // 忽略我们自己的UI元素
        if (element.closest('#mcp-element-highlight') || 
            element.closest('#mcp-element-info') ||
            element.closest('#mcp-selected-highlight') ||
            element.closest('#mcp-selected-info') ||
            element.closest('#mcp-overlay') ||
            element.closest('#mcp-inspection-tip') ||
            element.closest('#mcp-capture-toolbar')) {
            console.log('⏭️ 跳过内部UI元素');
            return;
        }
        
        console.log('✅ 有效元素被点击，显示工具栏');
        
        // 显示捕获工具栏
        this.showCaptureToolbar(element);
    }

    handleKeyDown(event) {
        console.log('⌨️ Element Inspector: 键盘事件，按键:', event.key, '检查模式:', this.isActive);
        
        if (!this.isActive) return;

        if (event.key === 'Escape' || event.keyCode === 27 || event.which === 27) {
            console.log('🔤 Element Inspector: 检测到 ESC 键，开始停止检查');
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation(); // 阻止其他监听器
            
            this.stopInspection();
            
            // 通知扩展检查已停止
            try {
                chrome.runtime.sendMessage({
                    action: 'elementInspectionStopped',
                    reason: 'user_cancelled'
                }, (response) => {
                    console.log('✅ Element Inspector: ESC 停止消息发送成功');
                });
            } catch (error) {
                console.error('❌ Element Inspector: 发送停止消息失败:', error);
            }
            
            return false; // 确保事件不会继续传播
        }
    }

    highlightElement(element) {
        this.removeHighlight();
        
        this.highlightedElement = element;
        const rect = element.getBoundingClientRect();
        
        // 创建高亮边框
        const highlight = document.createElement('div');
        highlight.id = 'mcp-element-highlight';
        highlight.style.cssText = `
            position: fixed;
            top: ${rect.top}px;
            left: ${rect.left}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            border: 2px solid #007bff;
            background: rgba(0, 123, 255, 0.1);
            pointer-events: none;
            z-index: 999998;
            box-sizing: border-box;
        `;
        
        // 创建元素信息提示
        const info = document.createElement('div');
        info.id = 'mcp-element-info';
        info.style.cssText = `
            position: fixed;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: Monaco, Consolas, monospace;
            font-size: 12px;
            z-index: 999999;
            pointer-events: none;
            white-space: nowrap;
            max-width: 400px;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        
        // 计算信息框位置
        let infoTop = rect.top - 30;
        let infoLeft = rect.left;
        
        if (infoTop < 10) {
            infoTop = rect.bottom + 10;
        }
        
        if (infoLeft + 400 > window.innerWidth) {
            infoLeft = window.innerWidth - 410;
        }
        
        info.style.top = `${infoTop}px`;
        info.style.left = `${infoLeft}px`;
        
        // 生成元素信息
        const tagName = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const className = element.className ? 
            (typeof element.className === 'string' ? 
                `.${element.className.split(' ').filter(c => c).join('.')}` : '') : '';
        const text = element.textContent ? 
            element.textContent.trim().substring(0, 50) : '';
        
        info.textContent = `${tagName}${id}${className}${text ? ` "${text}..."` : ''}`;
        
        document.body.appendChild(highlight);
        document.body.appendChild(info);
    }

    removeHighlight() {
        const highlight = document.getElementById('mcp-element-highlight');
        const info = document.getElementById('mcp-element-info');
        
        if (highlight) highlight.remove();
        if (info) info.remove();
        
        this.highlightedElement = null;
    }

    showSelectedHighlight(element) {
        // 先移除之前的高亮
        this.removeHighlight();
        this.removeSelectedHighlight();
        
        if (!element) return;
        
        const rect = element.getBoundingClientRect();
        
        // 创建选中高亮框（绿色边框，表示已选中）
        const selectedHighlight = document.createElement('div');
        selectedHighlight.id = 'mcp-selected-highlight';
        selectedHighlight.style.cssText = `
            position: absolute;
            top: ${rect.top + window.scrollY}px;
            left: ${rect.left + window.scrollX}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            border: 2px solid #00ff00;
            background: rgba(0, 255, 0, 0.1);
            pointer-events: none;
            z-index: 1000000;
            box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
        `;
        
        // 创建选中信息框
        const selectedInfo = document.createElement('div');
        selectedInfo.id = 'mcp-selected-info';
        selectedInfo.style.cssText = `
            position: absolute;
            background: #00ff00;
            color: #000000;
            padding: 4px 8px;
            font-size: 12px;
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-weight: bold;
            border-radius: 3px;
            z-index: 1000001;
            pointer-events: none;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        `;
        
        // 计算信息框位置
        let infoTop = rect.top + window.scrollY - 30;
        let infoLeft = rect.left + window.scrollX;
        
        if (infoTop < 10) {
            infoTop = rect.bottom + window.scrollY + 10;
        }
        
        if (infoLeft + 400 > window.innerWidth) {
            infoLeft = window.innerWidth - 410;
        }
        
        selectedInfo.style.top = `${infoTop}px`;
        selectedInfo.style.left = `${infoLeft}px`;
        
        // 生成元素信息
        const tagName = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const className = element.className ? 
            (typeof element.className === 'string' ? 
                `.${element.className.split(' ').filter(c => c).join('.')}` : '') : '';
        const text = element.textContent ? 
            element.textContent.trim().substring(0, 30) : '';
        
        selectedInfo.textContent = `✓ 已选中: ${tagName}${id}${className}${text ? ` "${text}..."` : ''}`;
        
        document.body.appendChild(selectedHighlight);
        document.body.appendChild(selectedInfo);
    }

    removeSelectedHighlight() {
        const selectedHighlight = document.getElementById('mcp-selected-highlight');
        const selectedInfo = document.getElementById('mcp-selected-info');
        
        if (selectedHighlight) selectedHighlight.remove();
        if (selectedInfo) selectedInfo.remove();
    }

    showCaptureToolbar(element) {
        console.log('🎯 显示捕获工具栏，元素:', element);
        
        // 选中元素
        this.selectedElement = element;
        
        // 停止鼠标移动和点击行为，但保持ESC键监听
        document.removeEventListener('mouseover', this.boundEvents.mouseover, true);
        document.removeEventListener('click', this.boundEvents.click, true);
        // 重要：不要移除 keydown 事件监听器，保持ESC键功能
        
        // 显示选中元素的高亮（不同于鼠标悬停高亮）
        this.showSelectedHighlight(element);
        
        // 创建工具栏
        this.removeCaptureToolbar(); // 确保之前的工具栏被移除
        
        const toolbar = document.createElement('div');
        toolbar.id = 'mcp-capture-toolbar';
        toolbar.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #2d2d30;
            border: 1px solid #464647;
            border-radius: 3px;
            padding: 8px;
            z-index: 1000001;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            font-size: 13px;
            color: #cccccc;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            display: flex;
            gap: 8px;
            align-items: center;
            min-width: 300px;
            user-select: none;
        `;
        
        // 阻止工具栏事件冒泡
        toolbar.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        toolbar.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        toolbar.addEventListener('mouseover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        // 创建标题
        const title = document.createElement('span');
        title.textContent = '选择操作：';
        title.style.cssText = `
            color: #cccccc;
            font-weight: 500;
            margin-right: 12px;
        `;
        
        // 创建获取信息按钮
        const getInfoBtn = document.createElement('button');
        getInfoBtn.textContent = '获取信息';
        getInfoBtn.style.cssText = `
            background: transparent;
            border: 1px solid #464647;
            color: #cccccc;
            padding: 6px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
            font-family: inherit;
            transition: all 0.2s;
            min-width: 80px;
        `;
        
        // 创建截图按钮
        const screenshotBtn = document.createElement('button');
        screenshotBtn.textContent = '截图';
        screenshotBtn.style.cssText = `
            background: transparent;
            border: 1px solid #464647;
            color: #cccccc;
            padding: 6px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
            font-family: inherit;
            transition: all 0.2s;
            min-width: 80px;
        `;
        
        // 创建取消按钮
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `
            background: transparent;
            border: 1px solid #464647;
            color: #cccccc;
            padding: 6px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
            font-family: inherit;
            transition: all 0.2s;
            min-width: 60px;
        `;
        
        // 添加按钮事件 - 使用箭头函数确保this指向正确
        getInfoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔘 获取信息按钮被点击');
            this.getElementInfoAndShowFeedback();
        });
        
        screenshotBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔘 截图按钮被点击');
            this.captureElement(element);
        });
        
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔘 取消按钮被点击');
            this.cancelCapture();
        });
        
        // 添加元素到工具栏
        toolbar.appendChild(title);
        toolbar.appendChild(getInfoBtn);
        toolbar.appendChild(screenshotBtn);
        toolbar.appendChild(cancelBtn);
        
        // 添加到页面
        document.body.appendChild(toolbar);
        
        // 添加按钮样式事件（VSCode 风格）
        const buttons = [getInfoBtn, screenshotBtn, cancelBtn];
        buttons.forEach(btn => {
            btn.addEventListener('mouseenter', (e) => {
                e.target.style.background = '#37373d';
                e.target.style.color = '#ffffff';
            });
            
            btn.addEventListener('mouseleave', (e) => {
                e.target.style.background = 'transparent';
                e.target.style.color = '#cccccc';
            });
            
            btn.addEventListener('mousedown', (e) => {
                e.target.style.background = '#4f4f55';
            });
            
            btn.addEventListener('mouseup', (e) => {
                e.target.style.background = '#37373d';
            });
        });
        
        console.log('✅ 工具栏创建完成，包含3个功能按钮');
    }

    removeCaptureToolbar() {
        const toolbar = document.getElementById('mcp-capture-toolbar');
        if (toolbar) {
            toolbar.remove();
        }
    }

    getElementInfoAndShowFeedback() {
        if (!this.selectedElement) {
            console.error('未选中有效元素');
            return;
        }
        
        console.log('📋 开始获取元素信息...');
        
        // 移除工具栏
        this.removeCaptureToolbar();
        
        // 获取元素信息
        const elementInfo = this.getElementInfo(this.selectedElement);
        
        // 生成元素信息文本
        const elementInfoText = this.generateElementInfoText(elementInfo);
        
        console.log('✅ 元素信息已生成，长度:', elementInfoText.length);
        
        // 停止检查
        this.stopInspection();
        
        // 发送消息到侧边栏，填充反馈文本框
        chrome.runtime.sendMessage({
            action: 'fillFeedbackText',
            data: {
                text: elementInfoText
            }
        }, (response) => {
            if (response && response.success) {
                console.log('✅ 元素信息已成功发送到侧边栏');
            } else {
                console.error('❌ 发送元素信息失败:', response);
            }
        });
        
        // 同时发送到content script显示反馈表单
        chrome.runtime.sendMessage({
            action: 'showFeedbackForm',
            data: {
                prefilledText: elementInfoText
            }
        });
    }

    generateElementInfoText(elementInfo) {
        const tagName = elementInfo.tagName.toLowerCase();
        const id = elementInfo.id ? `#${elementInfo.id}` : '';
        const classes = elementInfo.className ? 
            elementInfo.className.toString().trim().split(' ').map(c => `.${c}`).join('') : '';
        const text = elementInfo.textContent ? elementInfo.textContent.trim() : '';
        
        let info = `=== 页面元素信息 ===\n`;
        info += `页面URL: ${window.location.href}\n`;
        info += `时间: ${new Date().toLocaleString()}\n\n`;
        
        info += `=== 元素基本信息 ===\n`;
        info += `标签: ${tagName}\n`;
        if (id) info += `ID: ${id}\n`;
        if (classes) info += `类名: ${classes}\n\n`;
        
        info += `=== 元素位置信息 ===\n`;
        info += `位置: (${Math.round(elementInfo.rect.left)}, ${Math.round(elementInfo.rect.top)})\n`;
        info += `大小: ${Math.round(elementInfo.rect.width)} × ${Math.round(elementInfo.rect.height)}\n\n`;
        
        if (text && text.length > 0) {
            info += `=== 元素文本内容 ===\n`;
            info += `${text.length > 200 ? text.substring(0, 200) + '...' : text}\n\n`;
        }
        
        // 显示重要属性
        const importantAttrs = elementInfo.attributes.filter(attr => 
            ['src', 'href', 'alt', 'title', 'value', 'placeholder', 'type', 'name'].includes(attr.name) ||
            attr.name.startsWith('data-')
        );
        
        if (importantAttrs.length > 0) {
            info += `=== 重要属性 ===\n`;
            importantAttrs.forEach(attr => {
                info += `${attr.name}: ${attr.value}\n`;
            });
            info += '\n';
        }
        
        info += `=== 用户反馈 ===\n`;
        info += `请在此描述您的问题或建议：\n\n`;
        
        return info;
    }

    cancelCapture() {
        console.log('🚫 用户取消捕获，直接退出检查模式');
        
        // 移除工具栏
        this.removeCaptureToolbar();
        
        // 移除选中高亮
        this.removeSelectedHighlight();
        
        // 重置选中元素
        this.selectedElement = null;
        
        // 直接停止整个检查模式
        this.stopInspection();
    }

    async captureElement(element) {
        try {
            console.log('🎯 开始捕获元素...');
            
            // 移除工具栏
            this.removeCaptureToolbar();
            
            // 获取元素信息
            const elementInfo = this.getElementInfo(element);
            console.log('📋 元素信息已获取:', elementInfo);
            
            // 捕获截图
            console.log('📷 请求截图...');
            const screenshot = await this.takeElementScreenshot(element);
            console.log('✅ 截图获取成功，数据长度:', screenshot.length);
            
            // 停止检查模式
            this.stopInspection();
            
            // 发送结果到扩展
            console.log('📤 发送截图数据到扩展...');
            chrome.runtime.sendMessage({
                action: 'elementCaptured',
                data: {
                    elementInfo: elementInfo,
                    screenshot: screenshot
                }
            }, (response) => {
                if (response && response.success) {
                    console.log('✅ 截图数据发送成功');
                } else {
                    console.error('❌ 截图数据发送失败:', response);
                }
            });
            
            console.log('✅ 元素捕获流程完成');
            
        } catch (error) {
            console.error('❌ 元素捕获失败:', error);
            this.stopInspection();
            
            chrome.runtime.sendMessage({
                action: 'elementInspectionStopped',
                reason: 'capture_failed',
                error: error.message
            });
        }
    }

    getElementInfo(element) {
        return {
            tagName: element.tagName,
            id: element.id,
            className: element.className,
            textContent: element.textContent ? element.textContent.trim().substring(0, 200) : '',
            outerHTML: element.outerHTML ? element.outerHTML.substring(0, 500) : '',
            attributes: Array.from(element.attributes || []).map(attr => ({
                name: attr.name,
                value: attr.value
            })),
            rect: element.getBoundingClientRect(),
            styles: window.getComputedStyle(element)
        };
    }

    async takeElementScreenshot(element) {
        console.log('📸 takeElementScreenshot: 开始请求截图...');
        
        // 这里我们请求background script来截图
        return new Promise((resolve, reject) => {
            const elementRect = element.getBoundingClientRect();
            console.log('📐 元素位置信息:', elementRect);
            
            chrome.runtime.sendMessage({
                action: 'captureElementScreenshot',
                elementRect: elementRect
            }, (response) => {
                console.log('📨 收到background响应:', response);
                
                if (chrome.runtime.lastError) {
                    console.error('❌ Chrome runtime 错误:', chrome.runtime.lastError);
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                
                if (response && response.success) {
                    console.log('✅ 截图成功，数据大小:', response.screenshot ? response.screenshot.length : 'undefined');
                    resolve(response.screenshot);
                } else {
                    console.error('❌ 截图失败:', response?.error || '未知错误');
                    reject(new Error(response?.error || '截图失败'));
                }
            });
        });
    }
}

// 初始化元素检查器
if (!window.mcpElementInspector) {
    window.mcpElementInspector = new ElementInspector();
} 