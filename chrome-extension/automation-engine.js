class AutomationEngine {
    constructor(sendWebSocketMessageCallback) {
        this.sendWebSocketMessage = sendWebSocketMessageCallback;
    }

    async handleCommand(message) {
        console.log('🤖 AutomationEngine: 收到命令:', message);

        const { type, requestId, data } = message;

        try {
            let result = null;

            switch (type) {
                case 'navigate':
                    result = await this.automationNavigate(data);
                    break;

                case 'click':
                    result = await this.automationClick(data);
                    break;

                case 'fillInput':
                    result = await this.automationFillInput(data);
                    break;

                case 'executeScript':
                    result = await this.automationExecuteScript(data);
                    break;

                case 'getPageInfo':
                    result = await this.automationGetPageInfo(data);
                    break;

                case 'takeScreenshot':
                    result = await this.automationTakeScreenshot(data);
                    break;

                case 'waitForElement':
                    result = await this.automationWaitForElement(data);
                    break;

                case 'fillForm':
                    result = await this.automationFillForm(data);
                    break;

                case 'interactElement':
                    result = await this.automationInteractElement(data);
                    break;

                case 'extractContent':
                    result = await this.automationExtractContent(data);
                    break;

                case 'smartElementLocator':
                    result = await this.automationSmartElementLocator(data);
                    break;

                case 'analyzeFormStructure':
                    result = await this.automationAnalyzeFormStructure(data);
                    break;

                case 'interactiveLocateElement':
                    result = await this.automationInteractiveLocateElement(data);
                    break;

                default:
                    throw new Error(`Unknown automation command: ${type}`);
            }

            this.sendWebSocketMessage({
                action: 'automationResponse',
                requestId,
                success: true,
                data: result,
                timestamp: new Date().toISOString()
            });

            console.log('✅ AutomationEngine: 命令执行成功:', type, result);

        } catch (error) {
            console.error('❌ AutomationEngine: 命令执行失败:', type, error);

            this.sendWebSocketMessage({
                action: 'automationResponse',
                requestId,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async automationNavigate(data) {
        const { url, waitForLoad } = data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.update(tab.id, { url });

        if (waitForLoad) {
            await new Promise((resolve) => {
                const listener = (tabId, changeInfo) => {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });
        }
        return `Successfully navigated to ${url}`;
    }

    async automationClick(data) {
        const { selector, waitTime } = data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (selector) => {
                const framework = window.frameDetector?.detectFramework() || (() => {
                    if (typeof Vue !== 'undefined') return 'Vue';
                    if (typeof React !== 'undefined') return 'React';
                    if (typeof angular !== 'undefined') return 'Angular';
                    if (document.querySelector('[data-elementor]')) return 'Elementor';
                    if (document.querySelector('.el-')) return 'Element UI';
                    if (document.querySelector('.ant-')) return 'Ant Design';
                    if (document.querySelector('.v-')) return 'Vuetify';
                    return 'Unknown';
                })();

                const findElement = (sel) => {
                    let element = document.querySelector(sel);
                    if (element) return element;
                    if (sel.includes('text:')) {
                        const text = sel.replace('text:', '').trim();
                        const elements = Array.from(document.querySelectorAll('button, a, [role="button"], .el-button, .ant-btn'));
                        element = elements.find(el =>
                            el.textContent?.trim().toLowerCase().includes(text.toLowerCase()) ||
                            el.getAttribute('aria-label')?.toLowerCase().includes(text.toLowerCase())
                        );
                        if (element) return element;
                    }
                    const frameworkSelectors = {
                        'Element UI': [sel.replace('button', '.el-button'), sel.replace('input', '.el-input__inner'), `.el-${sel}`, `[class*="el-${sel}"]`],
                        'Ant Design': [sel.replace('button', '.ant-btn'), sel.replace('input', '.ant-input'), `.ant-${sel}`, `[class*="ant-${sel}"]`],
                        'Vuetify': [sel.replace('button', '.v-btn'), sel.replace('input', '.v-text-field__slot input'), `.v-${sel}`, `[class*="v-${sel}"]`]
                    };
                    const alternatives = frameworkSelectors[framework] || [];
                    for (const altSel of alternatives) {
                        element = document.querySelector(altSel);
                        if (element) return element;
                    }
                    const attrSelectors = [`[data-testid="${sel}"]`, `[data-cy="${sel}"]`, `[id*="${sel}"]`, `[class*="${sel}"]`, `[aria-label*="${sel}"]`];
                    for (const attrSel of attrSelectors) {
                        element = document.querySelector(attrSel);
                        if (element) return element;
                    }
                    return null;
                };

                const element = findElement(selector);
                if (!element) throw new Error(`Element not found with selector: ${selector}. Framework: ${framework}`);

                if (!element.offsetParent && element.style.display !== 'none') {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }

                const performClick = (el) => {
                    try { el.click(); return 'native-click'; } catch (e) {}
                    try { el.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true })); return 'event-dispatch'; } catch (e) {}
                    try { ['mousedown', 'mouseup', 'click'].forEach(evt => el.dispatchEvent(new MouseEvent(evt, { view: window, bubbles: true, cancelable: true }))); return 'mouse-sequence'; } catch (e) {}
                    throw new Error('All click methods failed');
                };

                const clickMethod = performClick(element);
                return `Clicked element: ${selector} using ${clickMethod} method. Framework: ${framework}`;
            },
            args: [selector]
        });

        if (waitTime > 0) await new Promise(resolve => setTimeout(resolve, waitTime));
        return result[0].result;
    }

    async automationFillInput(data) {
        const { selector, text, clearFirst } = data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (selector, text, clearFirst) => {
                const findInput = (sel) => {
                    let element = document.querySelector(sel);
                    if (element) return element;
                    const frameworkInputs = [
                        `${sel} .el-input__inner`, `.el-input__inner[placeholder*="${sel}"]`,
                        `${sel} .ant-input`, `.ant-input[placeholder*="${sel}"]`,
                        `${sel} .v-text-field__slot input`, `.v-text-field input[placeholder*="${sel}"]`,
                        `input[name="${sel}"]`, `input[id="${sel}"]`, `input[placeholder*="${sel}"]`,
                        `textarea[name="${sel}"]`, `textarea[placeholder*="${sel}"]`,
                        `[contenteditable="true"][data-placeholder*="${sel}"]`
                    ];
                    for (const inputSel of frameworkInputs) {
                        element = document.querySelector(inputSel);
                        if (element) return element;
                    }
                    return null;
                };

                const element = findInput(selector);
                if (!element) throw new Error(`Input element not found: ${selector}`);

                element.focus();
                if (clearFirst) { element.value = ''; element.textContent = ''; }

                const performInput = (el, value) => {
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        el.value = value;
                        ['input', 'change', 'keyup', 'blur'].forEach(evt => el.dispatchEvent(new Event(evt, { bubbles: true })));
                        return 'form-input';
                    }
                    if (el.contentEditable === 'true') {
                        el.textContent = value;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        return 'contenteditable';
                    }
                    el.value = value;
                    ['focus', 'input', 'change', 'blur'].forEach(evt => el.dispatchEvent(new Event(evt, { bubbles: true })));
                    return 'component-input';
                };

                const inputMethod = performInput(element, text);
                return `Filled input ${selector} with: ${text} using ${inputMethod} method`;
            },
            args: [selector, text, clearFirst]
        });

        return result[0].result;
    }

    async automationExecuteScript(data) {
        const { script, returnResult } = data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (script) => eval(script),
            args: [script]
        });
        return returnResult ? result[0].result : 'Script executed successfully';
    }

    async automationGetPageInfo(data) {
        const { includeElements, elementSelector } = data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (includeElements, elementSelector) => {
                const info = { url: window.location.href, title: document.title, timestamp: new Date().toISOString() };
                if (includeElements) {
                    const selector = elementSelector || 'a, button, input, select, textarea, [onclick], [role="button"]';
                    const elements = Array.from(document.querySelectorAll(selector));
                    info.elements = elements.slice(0, 50).map((el, index) => ({
                        index, tagName: el.tagName.toLowerCase(), text: el.textContent?.trim().substring(0, 100) || '',
                        id: el.id || '', className: el.className || '', type: el.type || '', href: el.href || '', visible: el.offsetParent !== null
                    }));
                }
                return info;
            },
            args: [includeElements, elementSelector || null]
        });

        return result[0].result;
    }

    async automationTakeScreenshot(data) {
        const { fullPage, quality = 80, format = 'png' } = data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const captureOptions = { format: format === 'jpeg' ? 'jpeg' : 'png', quality: Math.max(0, Math.min(quality, 100)) };
        const dataUrl = await chrome.tabs.captureVisibleTab(null, captureOptions);
        return { screenshot: dataUrl, timestamp: new Date().toISOString(), fullPage: fullPage || false, format: captureOptions.format, quality: captureOptions.quality };
    }

    async automationWaitForElement(data) {
        const { selector, timeout } = data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (selector, timeout) => {
                return new Promise((resolve, reject) => {
                    const startTime = Date.now();
                    const findElement = (sel) => {
                        const framework = (() => {
                            if (typeof Vue !== 'undefined') return 'Vue'; if (typeof React !== 'undefined') return 'React'; if (typeof angular !== 'undefined') return 'Angular';
                            if (document.querySelector('.el-')) return 'Element UI'; if (document.querySelector('.ant-')) return 'Ant Design'; if (document.querySelector('.v-')) return 'Vuetify';
                            return 'Unknown';
                        })();
                        let element = document.querySelector(sel); if (element) return element;
                        const frameworkSelectors = {
                            'Element UI': [`.el-${sel}`, `[class*="el-${sel}"]`, sel.replace('button', '.el-button')],
                            'Ant Design': [`.ant-${sel}`, `[class*="ant-${sel}"]`, sel.replace('button', '.ant-btn')],
                            'Vuetify': [`.v-${sel}`, `[class*="v-${sel}"]`, sel.replace('button', '.v-btn')]
                        };
                        const alternatives = frameworkSelectors[framework] || [];
                        for (const altSel of alternatives) { element = document.querySelector(altSel); if (element) return element; }
                        const attrSelectors = [`[data-testid="${sel}"]`, `[data-cy="${sel}"]`, `[id*="${sel}"]`, `[class*="${sel}"]`];
                        for (const attrSel of attrSelectors) { element = document.querySelector(attrSel); if (element) return element; }
                        return null;
                    };
                    const checkElement = () => {
                        const element = findElement(selector);
                        if (element && element.offsetParent !== null) { resolve(`Element found and visible: ${selector}`); return; }
                        if (Date.now() - startTime > timeout) { reject(new Error(`Element not found within ${timeout}ms: ${selector}`)); return; }
                        setTimeout(checkElement, 100);
                    };
                    checkElement();
                });
            },
            args: [selector, timeout]
        });

        return result[0].result;
    }

    async automationFillForm(data) {
        const { formData, submitAfter = false } = data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (formDataString, submitAfter) => {
                const formData = JSON.parse(formDataString);
                const results = []; const errors = [];

                class SmartFormFiller {
                    constructor() { this.locator = new SmartElementLocator(); this.fieldMappings = { 'username': ['username', 'user', 'login', 'email', 'account', '用户名', '账号'], 'password': ['password', 'pwd', 'pass', '密码'], 'email': ['email', 'mail', 'e-mail', '邮箱', '电子邮件'], 'phone': ['phone', 'tel', 'mobile', 'cellphone', '电话', '手机'], 'name': ['name', 'fullname', 'realname', '姓名', '名字'], 'firstname': ['firstname', 'fname', 'given-name', '名', '名字'], 'lastname': ['lastname', 'lname', 'family-name', '姓', '姓氏'] }; }
                    findFormField(fieldName, value) { const located = this.locator.locate(fieldName); if (located.length > 0) { const inputElements = located.filter(item => ['INPUT', 'SELECT', 'TEXTAREA'].includes(item.element.tagName) || item.element.contentEditable === 'true'); if (inputElements.length > 0) return inputElements[0].element; } return this.traditionalFind(fieldName); }
                    traditionalFind(fieldName) { let field = document.querySelector(`[name="${fieldName}"]`) || document.querySelector(`[id="${fieldName}"]`) || document.querySelector(`[data-field="${fieldName}"]`); if (field) return field; const aliases = this.fieldMappings[fieldName.toLowerCase()] || [fieldName]; for (const alias of aliases) { field = document.querySelector(`[name*="${alias}"]`) || document.querySelector(`[id*="${alias}"]`) || document.querySelector(`[placeholder*="${alias}"]`); if (field) return field; } return null; }
                    async fillField(field, value, fieldName) { return new Promise((resolve) => { try { field.scrollIntoView({ behavior: 'smooth', block: 'center' }); field.focus(); setTimeout(() => { if (field.tagName === 'SELECT') { this.handleSelectField(field, value, fieldName); } else if (field.type === 'checkbox' || field.type === 'radio') { this.handleCheckboxRadio(field, value); } else if (field.contentEditable === 'true') { this.handleContentEditable(field, value); } else { this.handleInputField(field, value); } this.triggerFrameworkEvents(field, value); resolve(`Filled ${fieldName}: ${value}`); }, 100); } catch (error) { resolve(`Error filling ${fieldName}: ${error.message}`); } }); }
                    handleInputField(field, value) { field.value = ''; field.value = value; if (field.type === 'text' || field.type === 'email' || field.type === 'password') { field.value = ''; for (let i = 0; i < value.length; i++) { field.value += value[i]; field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: value[i] })); field.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: value[i] })); field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value[i] })); } } }
                    handleSelectField(field, value) { const options = Array.from(field.options); const matchedOption = options.find(opt => opt.value === value || opt.text === value || opt.text.includes(value) || opt.value.includes(value)); if (matchedOption) { field.value = matchedOption.value; matchedOption.selected = true; } }
                    handleCheckboxRadio(field, value) { const shouldCheck = value === true || value === 'true' || value === '1' || value === 'on'; field.checked = shouldCheck; }
                    handleContentEditable(field, value) { field.innerHTML = ''; field.textContent = value; }
                    triggerFrameworkEvents(field, value) { const events = ['input', 'change', 'blur', 'keyup', 'keydown']; events.forEach(eventType => { if (eventType.startsWith('key')) { field.dispatchEvent(new KeyboardEvent(eventType, { bubbles: true, cancelable: true, key: 'Enter' })); } else { field.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true })); } }); if (window.Vue || document.querySelector('[data-v-]')) { field.dispatchEvent(new CustomEvent('vue:update', { bubbles: true, detail: { value } })); } if (window.React || field._valueTracker) { const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; nativeInputValueSetter.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); } }
                }
                const filler = new SmartFormFiller();
                const fillPromises = Object.entries(formData).map(async ([fieldName, value]) => { const field = filler.findFormField(fieldName, value); if (!field) { errors.push(`Field not found: ${fieldName}`); return; } const result = await filler.fillField(field, value, fieldName); results.push(result); });
                Promise.all(fillPromises).then(() => { if (submitAfter && errors.length === 0) { setTimeout(() => { try { const submitBtn = document.querySelector('button[type="submit"]') || document.querySelector('input[type="submit"]') || document.querySelector('.el-button--primary') || document.querySelector('.ant-btn-primary') || document.querySelector('.v-btn--primary') || document.querySelector('button[class*="submit"]') || document.querySelector('button'); if (submitBtn) { submitBtn.click(); results.push('Form submitted successfully'); } else { errors.push('Submit button not found'); } } catch (error) { errors.push(`Submit error: ${error.message}`); } }, 500); } });
                return { results, errors, total: Object.keys(formData).length };
            },
            args: [JSON.stringify(formData), submitAfter]
        });

        return result[0].result;
    }

    async automationInteractElement(data) {
        const { selector, action = 'click', value = null, options = {} } = data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const optionsString = JSON.stringify(options);

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (selector, action, value, optionsString) => {
                const options = JSON.parse(optionsString);
                const findElement = (sel) => {
                    let element = document.querySelector(sel); if (element) return element;
                    const frameworkSelectors = [`.el-${sel}`, `[class*="el-${sel}"]`, `.ant-${sel}`, `[class*="ant-${sel}"]`, `.v-${sel}`, `[class*="v-${sel}"]`, `[data-testid="${sel}"]`, `[aria-label*="${sel}"]`];
                    for (const altSel of frameworkSelectors) { element = document.querySelector(altSel); if (element) return element; }
                    return null;
                };
                const element = findElement(selector); if (!element) throw new Error(`Element not found: ${selector}`);
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const results = [];
                switch (action) {
                    case 'click': element.click(); results.push(`Clicked: ${selector}`); break;
                    case 'doubleClick': element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); results.push(`Double clicked: ${selector}`); break;
                    case 'hover': element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); results.push(`Hovered: ${selector}`); break;
                    case 'rightClick': element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })); results.push(`Right clicked: ${selector}`); break;
                    case 'select': if (element.tagName === 'SELECT') { element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); results.push(`Selected ${value} in: ${selector}`); } else { throw new Error('Element is not a select dropdown'); } break;
                    case 'check': if (element.type === 'checkbox' || element.type === 'radio') { element.checked = value !== false; element.dispatchEvent(new Event('change', { bubbles: true })); results.push(`${element.checked ? 'Checked' : 'Unchecked'}: ${selector}`); } else { throw new Error('Element is not a checkbox or radio'); } break;
                    case 'focus': element.focus(); results.push(`Focused: ${selector}`); break;
                    case 'blur': element.blur(); results.push(`Blurred: ${selector}`); break;
                    default: throw new Error(`Unknown action: ${action}`);
                }
                return { results, element: element.tagName, action };
            },
            args: [selector, action, value, optionsString]
        });

        return result[0].result;
    }

    async automationExtractContent(data) {
        const { selectors = [], type = 'text', options = {} } = data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const selectorsString = JSON.stringify(selectors); const optionsString = JSON.stringify(options);

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (selectorsString, type, optionsString) => {
                const selectors = JSON.parse(selectorsString); const options = JSON.parse(optionsString); const results = {};
                const extractFromElement = (element, extractType) => {
                    switch (extractType) {
                        case 'text': return element.textContent?.trim(); case 'html': return element.innerHTML;
                        case 'value': return element.value || element.textContent?.trim(); case 'href': return element.href;
                        case 'src': return element.src; case 'attributes': const attrs = {}; for (const attr of element.attributes) { attrs[attr.name] = attr.value; } return attrs;
                        default: return element.textContent?.trim();
                    }
                };
                if (selectors.length === 0) {
                    results.title = document.title; results.url = window.location.href;
                    results.headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({ level: h.tagName, text: h.textContent?.trim() }));
                    results.links = Array.from(document.querySelectorAll('a[href]')).slice(0, 20).map(a => ({ text: a.textContent?.trim(), href: a.href }));
                    results.forms = Array.from(document.querySelectorAll('form')).map(form => ({ action: form.action, method: form.method, fields: Array.from(form.querySelectorAll('input, select, textarea')).map(field => ({ name: field.name, type: field.type })) }));
                } else {
                    selectors.forEach((selector, index) => {
                        try {
                            const elements = document.querySelectorAll(selector);
                            if (elements.length === 1) { results[`selector_${index}`] = extractFromElement(elements[0], type); }
                            else if (elements.length > 1) { results[`selector_${index}`] = Array.from(elements).map(el => extractFromElement(el, type)); }
                            else { results[`selector_${index}`] = null; }
                        } catch (error) { results[`selector_${index}_error`] = error.message; }
                    });
                }
                return { results, timestamp: new Date().toISOString(), extractedCount: Object.keys(results).length };
            },
            args: [selectorsString, type, optionsString]
        });

        return result[0].result;
    }

    async automationSmartElementLocator(data) {
        const { selector, action = 'locate', context = {} } = data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (selector, action, context) => {
                class SmartElementLocator {
                    constructor() { this.strategies = [this.byExactSelector.bind(this), this.byFrameworkSpecific.bind(this), this.bySemanticAttributes.bind(this), this.byTextContent.bind(this), this.byVisualPosition.bind(this), this.byFormContext.bind(this)]; }
                    byExactSelector(selector) { const elements = document.querySelectorAll(selector); return Array.from(elements).map(el => ({ element: el, confidence: 1.0, method: 'exact-selector', ref: this.generateRef(el) })); }
                    byFrameworkSpecific(selector) { const results = []; const vueSelectors = [`.el-${selector}`, `[class*="el-${selector}"]`, `.el-input__inner[placeholder*="${selector}"]`, `.el-form-item [placeholder*="${selector}"]`, `[v-model*="${selector}"]`]; const reactSelectors = [`.ant-${selector}`, `[class*="ant-${selector}"]`, `.ant-input[placeholder*="${selector}"]`, `[data-testid*="${selector}"]`]; const vuetifySelectors = [`.v-${selector}`, `[class*="v-${selector}"]`, `.v-text-field input[placeholder*="${selector}"]`]; const allFrameworkSelectors = [...vueSelectors, ...reactSelectors, ...vuetifySelectors]; allFrameworkSelectors.forEach(sel => { try { const elements = document.querySelectorAll(sel); elements.forEach(el => { results.push({ element: el, confidence: 0.8, method: 'framework-specific', ref: this.generateRef(el), selector: sel }); }); } catch (e) {} }); return results; }
                    bySemanticAttributes(selector) { const results = []; const semanticSelectors = [`[aria-label*="${selector}"]`, `[title*="${selector}"]`, `[placeholder*="${selector}"]`, `[data-testid*="${selector}"]`, `[data-test*="${selector}"]`, `[data-cy*="${selector}"]`, `[name*="${selector}"]`, `[id*="${selector}"]`, `[class*="${selector}"]`]; semanticSelectors.forEach(sel => { try { const elements = document.querySelectorAll(sel); elements.forEach(el => { results.push({ element: el, confidence: 0.7, method: 'semantic-attributes', ref: this.generateRef(el), matchedAttribute: sel }); }); } catch (e) {} }); return results; }
                    byTextContent(selector) { const results = []; const allElements = document.querySelectorAll('*'); allElements.forEach(el => { const text = el.textContent?.trim().toLowerCase(); const selectorLower = selector.toLowerCase(); if (text && (text === selectorLower || text.includes(selectorLower) || el.innerText?.toLowerCase().includes(selectorLower))) { let confidence = 0.6; if (text === selectorLower) confidence = 0.9; else if (text.includes(selectorLower)) confidence = 0.7; results.push({ element: el, confidence, method: 'text-content', ref: this.generateRef(el), matchedText: text }); } }); return results; }
                    byVisualPosition(selector) { const results = []; const labels = document.querySelectorAll('label'); labels.forEach(label => { const labelText = label.textContent?.trim().toLowerCase(); if (labelText && labelText.includes(selector.toLowerCase())) { let targetElement = null; if (label.htmlFor) { targetElement = document.getElementById(label.htmlFor); } if (!targetElement) { targetElement = label.querySelector('input, select, textarea') || label.nextElementSibling?.querySelector('input, select, textarea') || label.parentElement?.querySelector('input, select, textarea'); } if (targetElement) { results.push({ element: targetElement, confidence: 0.8, method: 'visual-position', ref: this.generateRef(targetElement), associatedLabel: labelText }); } } }); return results; }
                    byFormContext(selector) { const results = []; const forms = document.querySelectorAll('form'); forms.forEach(form => { const formInputs = form.querySelectorAll('input, select, textarea'); formInputs.forEach(input => { const context = this.getInputContext(input); if (context.toLowerCase().includes(selector.toLowerCase())) { results.push({ element: input, confidence: 0.75, method: 'form-context', ref: this.generateRef(input), context: context }); } }); }); return results; }
                    generateRef(element) { if (element.id) return `#${element.id}`; if (element.name) return `[name="${element.name}"]`; const path = this.getElementPath(element); return `ref-${btoa(path).substring(0, 12)}`; }
                    getElementPath(element) { const path = []; let current = element; while (current && current.nodeType === Node.ELEMENT_NODE) { let selector = current.nodeName.toLowerCase(); if (current.id) { selector += `#${current.id}`; path.unshift(selector); break; } else { let sibling = current; let nth = 1; while (sibling = sibling.previousElementSibling) { if (sibling.nodeName.toLowerCase() === selector) nth++; } if (nth > 1) selector += `:nth-of-type(${nth})`; } path.unshift(selector); current = current.parentNode; } return path.join(' > '); }
                    getInputContext(input) { const contexts = []; if (input.placeholder) contexts.push(input.placeholder); const label = document.querySelector(`label[for="${input.id}"]`) || input.closest('label') || input.previousElementSibling?.tagName === 'LABEL' ? input.previousElementSibling : null; if (label) contexts.push(label.textContent?.trim()); const parent = input.parentElement; if (parent) { const parentText = parent.textContent?.replace(input.value || '', '').trim(); if (parentText && parentText.length < 100) { contexts.push(parentText); } } return contexts.filter(Boolean).join(' '); }
                    locate(selector) { const allResults = []; this.strategies.forEach(strategy => { try { const results = strategy(selector); allResults.push(...results); } catch (error) { console.warn('定位策略执行失败:', error); } }); const uniqueResults = this.deduplicateResults(allResults); return uniqueResults.sort((a, b) => b.confidence - a.confidence); }
                    deduplicateResults(results) { const unique = new Map(); results.forEach(result => { const key = result.element; if (!unique.has(key) || unique.get(key).confidence < result.confidence) { unique.set(key, result); } }); return Array.from(unique.values()); }
                }
                const locator = new SmartElementLocator();
                if (action === 'locate') { const results = locator.locate(selector); return { success: true, elements: results.map(r => ({ ref: r.ref, confidence: r.confidence, method: r.method, tagName: r.element.tagName, text: r.element.textContent?.substring(0, 100) || '', attributes: { id: r.element.id || '', name: r.element.name || '', class: r.element.className || '', placeholder: r.element.placeholder || '' } })), total: results.length }; }
                return { success: false, error: 'Unknown action' };
            },
            args: [selector, action, context]
        });

        return result[0].result;
    }

    async automationAnalyzeFormStructure(data) {
        const { formSelector = 'form', includeHiddenFields = false, framework = 'auto' } = data;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (formSelector, includeHiddenFields, framework) => {
                class SmartFormAnalyzer {
                    constructor() { this.framework = this.detectFramework(framework); this.fieldMappings = { '用户名': ['username', 'user', 'login', 'account'], '账号': ['username', 'account', 'user'], '密码': ['password', 'pwd', 'pass'], '邮箱': ['email', 'mail'], '电子邮件': ['email', 'mail'], '手机': ['phone', 'mobile', 'tel'], '电话': ['phone', 'tel'], '姓名': ['name', 'fullname'], '名字': ['firstname', 'fname'], '姓氏': ['lastname', 'lname'], '年龄': ['age'], '性别': ['gender', 'sex'], '地址': ['address'], '公司': ['company', 'corporation'], '职位': ['position', 'job', 'title'], 'username': ['username', 'user', 'login'], 'password': ['password', 'pwd', 'pass'], 'email': ['email', 'mail', 'e-mail'], 'phone': ['phone', 'tel', 'mobile'], 'name': ['name', 'fullname'], 'firstname': ['firstname', 'fname'], 'lastname': ['lastname', 'lname'] }; }
                    detectFramework(providedFramework) { if (providedFramework !== 'auto') return providedFramework; if (window.Vue || document.querySelector('[data-v-]')) return 'vue'; if (window.React || document.querySelector('[data-reactroot]')) return 'react'; if (window.angular) return 'angular'; if (document.querySelector('.el-')) return 'element-ui'; if (document.querySelector('.ant-')) return 'ant-design'; if (document.querySelector('.v-')) return 'vuetify'; return 'vanilla'; }
                    analyzePage() { const forms = this.findForms(formSelector); const analysis = { framework: this.framework, totalForms: forms.length, forms: forms.map(form => this.analyzeForm(form)), pageInfo: { title: document.title, url: window.location.href, framework: this.framework } }; return analysis; }
                    findForms(selector) { let forms = []; const traditionalForms = document.querySelectorAll(selector); forms.push(...Array.from(traditionalForms)); const frameworkSelectors = { 'vue': ['.el-form', '[class*="form"]'], 'element-ui': ['.el-form'], 'ant-design': ['.ant-form'], 'vuetify': ['.v-form'], 'react': ['[class*="form"]', 'form'] }; const selectors = frameworkSelectors[this.framework] || []; selectors.forEach(sel => { const elements = document.querySelectorAll(sel); elements.forEach(el => { if (!forms.includes(el)) forms.push(el); }); }); if (forms.length === 0) { const containers = document.querySelectorAll('div, section, main'); containers.forEach(container => { const inputs = container.querySelectorAll('input, select, textarea'); if (inputs.length >= 2) { forms.push(container); } }); } return forms; }
                    analyzeForm(form) { const formInfo = { selector: this.generateSelector(form), tagName: form.tagName, id: form.id || '', className: form.className || '', action: form.action || '', method: form.method || 'GET', fields: [], submitButtons: [], fieldSuggestions: {} }; const inputs = form.querySelectorAll('input, select, textarea'); inputs.forEach(input => { if (!includeHiddenFields && input.type === 'hidden') return; const fieldInfo = this.analyzeField(input); formInfo.fields.push(fieldInfo); const suggestion = this.generateFieldSuggestion(fieldInfo); if (suggestion) { formInfo.fieldSuggestions[suggestion.key] = suggestion; } }); const buttons = form.querySelectorAll('button, input[type="submit"], input[type="button"]'); buttons.forEach(btn => { formInfo.submitButtons.push({ selector: this.generateSelector(btn), text: btn.textContent?.trim() || btn.value || '', type: btn.type || 'button', className: btn.className || '' }); }); return formInfo; }
                    analyzeField(input) { const context = this.getFieldContext(input); return { selector: this.generateSelector(input), type: input.type || 'text', name: input.name || '', id: input.id || '', placeholder: input.placeholder || '', required: input.required || false, disabled: input.disabled || false, value: input.value || '', className: input.className || '', label: context.label, context: context.fullContext, tagName: input.tagName }; }
                    getFieldContext(input) { const contexts = []; let label = ''; if (input.id) { const labelEl = document.querySelector(`label[for="${input.id}"]`); if (labelEl) { label = labelEl.textContent?.trim() || ''; contexts.push(label); } } const parentLabel = input.closest('label'); if (parentLabel && !label) { label = parentLabel.textContent?.replace(input.value || '', '').trim() || ''; contexts.push(label); } const previousSibling = input.previousElementSibling; if (previousSibling && ['LABEL', 'SPAN', 'DIV'].includes(previousSibling.tagName)) { const text = previousSibling.textContent?.trim(); if (text && text.length < 50) { contexts.push(text); if (!label) label = text; } } if (input.placeholder) { contexts.push(input.placeholder); if (!label) label = input.placeholder; } const parent = input.parentElement; if (parent) { const parentText = parent.textContent?.replace(input.value || '', '').trim(); if (parentText && parentText.length < 100) { contexts.push(parentText); } } return { label: label, fullContext: contexts.filter(Boolean).join(' | ') }; }
                    generateFieldSuggestion(fieldInfo) { const text = (fieldInfo.label + ' ' + fieldInfo.placeholder + ' ' + fieldInfo.name).toLowerCase(); for (const [chineseKey, englishKeys] of Object.entries(this.fieldMappings)) { if (text.includes(chineseKey.toLowerCase()) || englishKeys.some(key => text.includes(key.toLowerCase()))) { return { key: englishKeys[0], selector: fieldInfo.selector, confidence: this.calculateConfidence(text, chineseKey, englishKeys), matchedTerms: [chineseKey, ...englishKeys].filter(term => text.includes(term.toLowerCase())), fieldInfo: fieldInfo }; } } return null; }
                    calculateConfidence(text, chineseKey, englishKeys) { let confidence = 0.3; if (text === chineseKey.toLowerCase() || englishKeys.includes(text)) { confidence = 0.9; } else if (text.includes(chineseKey.toLowerCase()) || englishKeys.some(key => text.includes(key))) { confidence = 0.7; } return confidence; }
                    generateSelector(element) { if (element.id) return `#${element.id}`; if (element.name) return `[name="${element.name}"]`; let selector = element.tagName.toLowerCase(); if (element.className) { const classes = element.className.split(' ').filter(Boolean); if (classes.length > 0) { selector += '.' + classes.join('.'); } } return selector; }
                }
                const analyzer = new SmartFormAnalyzer(); return analyzer.analyzePage();
            },
            args: [formSelector, includeHiddenFields, framework]
        });

        return result[0].result;
    }

    async automationInteractiveLocateElement(data) {
        const { timeout = 30000 } = data; // 30 second timeout
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        return new Promise(async (resolve, reject) => {
            let listener;
            const timer = setTimeout(() => {
                chrome.runtime.onMessage.removeListener(listener);
                // Attempt to stop inspection on the page as a cleanup
                chrome.tabs.sendMessage(tab.id, { action: 'stopElementCapture' }).catch(e => console.error("Failed to send stop message on timeout", e));
                reject(new Error(`Interactive element selection timed out after ${timeout / 1000} seconds.`));
            }, timeout);

            listener = (message, sender, sendResponse) => {
                if (message.action === 'interactiveElementSelected') {
                    clearTimeout(timer);
                    chrome.runtime.onMessage.removeListener(listener);
                    console.log('✅ AutomationEngine: Received selector from content script:', message.data.selector);
                    resolve(message.data);
                    return false; // Stop further listeners
                }
            };

            chrome.runtime.onMessage.addListener(listener);

            try {
                 // First, ensure the inspector script is injected
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['element-inspector.js']
                });
                // Then, send the message to start the interactive inspection
                await chrome.tabs.sendMessage(tab.id, { action: 'startInteractiveInspection' });
                console.log('🚀 AutomationEngine: Sent startInteractiveInspection message to content script.');
            } catch (error) {
                clearTimeout(timer);
                chrome.runtime.onMessage.removeListener(listener);
                console.error("❌ AutomationEngine: Failed to start interactive inspection.", error);
                reject(error);
            }
        });
    }
}
