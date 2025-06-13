// 元素检查器 - 的元素选择功能
class ElementInspector {
    constructor() {
        this.isActive = false;
        this.highlightedElement = null;
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
        // 监听来自扩展的消息
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'startElementCapture') {
                this.startInspection();
                sendResponse({ success: true });
            } else if (message.action === 'stopElementCapture') {
                this.stopInspection();
                sendResponse({ success: true });
            }
        });
    }

    startInspection() {
        if (this.isActive) return;

        this.isActive = true;
        this.createOverlay();
        this.addEventListeners();
        this.originalCursor = document.body.style.cursor;
        document.body.style.cursor = 'crosshair';
        
        // 显示提示信息
        this.showInspectionTip();
        
        console.log('🔍 元素检查模式已启动');
    }

    stopInspection() {
        if (!this.isActive) return;

        this.isActive = false;
        this.removeEventListeners();
        this.removeOverlay();
        this.removeHighlight();
        this.removeInspectionTip();
        
        if (this.originalCursor !== null) {
            document.body.style.cursor = this.originalCursor;
        }
        
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
                <div style="margin-bottom: 8px;">• 按 ESC 退出检查</div>
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
        document.addEventListener('mouseover', this.boundEvents.mouseover, true);
        document.addEventListener('click', this.boundEvents.click, true);
        document.addEventListener('keydown', this.boundEvents.keydown, true);
    }

    removeEventListeners() {
        document.removeEventListener('mouseover', this.boundEvents.mouseover, true);
        document.removeEventListener('click', this.boundEvents.click, true);
        document.removeEventListener('keydown', this.boundEvents.keydown, true);
    }

    handleMouseOver(event) {
        if (!this.isActive) return;

        event.preventDefault();
        event.stopPropagation();

        // 忽略我们自己创建的元素
        if (event.target.id === 'mcp-element-inspector-overlay' || 
            event.target.id === 'mcp-inspection-tip' ||
            event.target.closest('#mcp-inspection-tip')) {
            return;
        }

        this.highlightElement(event.target);
    }

    handleClick(event) {
        if (!this.isActive) return;

        event.preventDefault();
        event.stopPropagation();

        // 忽略我们自己创建的元素
        if (event.target.id === 'mcp-element-inspector-overlay' || 
            event.target.id === 'mcp-inspection-tip' ||
            event.target.closest('#mcp-inspection-tip')) {
            return;
        }

        this.captureElement(event.target);
    }

    handleKeyDown(event) {
        if (!this.isActive) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            this.stopInspection();
            
            // 通知扩展检查已停止
            chrome.runtime.sendMessage({
                action: 'elementInspectionStopped',
                reason: 'user_cancelled'
            });
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

    async captureElement(element) {
        try {
            // 获取元素信息
            const elementInfo = this.getElementInfo(element);
            
            // 高亮选中的元素
            this.highlightElement(element);
            
            // 等待一小段时间让高亮显示
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 截取页面
            const screenshot = await this.takeElementScreenshot(element);
            
            // 停止检查模式
            this.stopInspection();
            
            // 发送结果到扩展
            chrome.runtime.sendMessage({
                action: 'elementCaptured',
                data: {
                    elementInfo: elementInfo,
                    screenshot: screenshot
                }
            });
            
            console.log('✅ 元素捕获完成');
            
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
        // 这里我们请求background script来截图
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'captureElementScreenshot',
                elementRect: element.getBoundingClientRect()
            }, (response) => {
                if (response && response.success) {
                    resolve(response.screenshot);
                } else {
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