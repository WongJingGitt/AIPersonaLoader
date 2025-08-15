class AIPersonaInputEnhancer {
    constructor() {
        // --- 状态管理 ---
        this.processedInputs = new WeakSet();
        this.enhancementCache = new WeakMap();
        this.trackedEnhancements = new Set();
        
        this.activePopover = null;
        this.activeAutoInject = false;
        this.isCleanedUp = false;
        this.svgIconUrl = null;
        this.cleanUpFromUser = false;
        this.isInAutoInjectList = false;
        this.statusRenderFirstTime = true;

        // --- 工具函数 ---
        this.throttledProcess = this.throttle(this.processInputs.bind(this), 100);

        // --- 初始化 ---
        this.init();

        window.addEventListener('message', async event => {
            const eventType = event.data?.type;
            const eventList = {
                "REFRESH_WHITE_LIST": async () => {
                    // 监听options页面的站点开关，针对开关状态实时把注入状态更新到界面
                    try {this.cleanup()} catch (e) { };
                    await this.init(true);
                },
                "REFRESH_GLOBAL_STATE": async () => {
                    // 监听全局自动注入、当前站点自动注入开关状态，根据状态改变界面上注入的形态
                    await this.refreshGlobalState();
                    this.trackedEnhancements.forEach(item => {
                        const iconButton = item?.iconButton;
                        if (!iconButton) return;
                        iconButton.className = `ai-persona-icon ${!this.activeAutoInject ? 'ai-persona-icon-disabled' : ''}`.trim()
                    });
                },
                "REFRESH_PERSONA_MANIFEST": async () => {
                    // 监听人设列表更新，刷新右上角提示信息。
                    await this.refreshGlobalState();
                },
            };
            await eventList[eventType]?.();
        })

    }

    waitForDOMStable(timeout = 2000, debounce = 100) {
        return new Promise(resolve => {
            let timer;
            const observer = new MutationObserver(() => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    observer.disconnect();
                    resolve();
                }, debounce);
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true
            });
            
            setTimeout(() => {
                observer.disconnect();
                resolve();
            }, timeout);
        });
    }

    
    async init(forceReinit=false) {
        // 1. 调用cleanup函数，手动清理了注入实例之后isCleanedUp会设置为true,
        // 2. 为了防止手动关闭之后又被意外拉起，所以手动关闭之后必须主动要携带forceReinit=true才能重新注入。
        if (this.isCleanedUp && !forceReinit) return;

        this.cleanUpFromUser = false;
        this.isCleanedUp = false;

        // 解决界面异步JS未执行完毕时在界面插入DOM引发的错误
        // 判断是否时第一次执行，然后判断1秒内如果DOM树没有变化，则认为JS执行完毕。
        // 虽然不够完美，但是能解决大部分场景
        if (this.statusRenderFirstTime) {
            this.statusRenderFirstTime = false;
            await this.waitForDOMStable(30000, 1000)
        }

        this.injectGlobalStyles();
        this.createPopoverHostNode();
        window.addEventListener('beforeunload', () => this.cleanup());

        // 等待DOM加载完成
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            });
        }
        const shouldInject = await this.shouldInjectOnThisPage();
        if (!shouldInject) {
            console.log("AIPersonaInputEnhancer: Injection disabled for this page.");
            return;
        }

        // 从 background script 获取初始状态
        await this.refreshGlobalState();

        // 延迟执行，确保页面完全渲染
        return await new Promise((resolve, reject) => {
            setTimeout(() => {
                if (this.isCleanedUp && !forceReinit) {
                    reject();
                    return;
                }; 
                this.setupMutationObserver();
                this.processExistingInputs();
                resolve(true);
            }, 0);
        })
    }
    
    createPopoverHostNode () {
        this.popoverHostNode = this.createDOMElement('div', {className: 'ai-persona-popover-host'});
        this.popoverHostNode.attachShadow({mode: 'open'});
        const styleNode = this.globalStyle.cloneNode(true);
        this.popoverHostNode.shadowRoot.appendChild(styleNode);
        document.body.appendChild(this.popoverHostNode);
    }
    
    async refreshGlobalState() {
        try {
            const [api_list_response, svg_icon_response] = await Promise.all([
                this.sendMessageWithResponse({type: "GET_API_INFO"}),
                this.sendMessageWithResponse({type: "GET_SVG_ICON_URL"})
            ]);

            const api_list = api_list_response?.data || [];
            this.activeAutoInject = api_list.some(item => item.hostname === window.location.hostname && item.enabled);
            this.isInAutoInjectList = api_list.some(item => item.hostname === window.location.hostname);
            const globalInjectState = await this.sendMessageWithResponse({type: "GET_GLOBAL_ENABLE_STATE"});
            if (!globalInjectState.data) this.activeAutoInject = false;

            this.svgIconUrl = svg_icon_response?.data;
            this.updateStatusIndicator();

        } catch (error) {
            console.warn("AIPersonaInputEnhancer: Could not get initial state from background. Using default.", error.message);
        }
    }

    async shouldInjectOnThisPage() {
        const whiteListResponse = await this.sendMessageWithResponse({type: "GET_WHITE_LIST"});
        const whiteList = whiteListResponse?.data ?? [];
        return whiteList.some(item => item.hostname === window.location.hostname && item.enabled)
    }
    
    setInputValue(inputElement, value) {
        const tagName = inputElement.tagName.toLowerCase();
        
        if (tagName === 'textarea' || tagName === 'input') {
            const prototype = tagName === 'textarea' 
                ? window.HTMLTextAreaElement.prototype 
                : window.HTMLInputElement.prototype;
            const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;
            nativeValueSetter.call(inputElement, value);
        } else if (inputElement.isContentEditable) {
            inputElement.focus();
            if (document.execCommand) {
                document.execCommand('selectAll');
                document.execCommand('insertText', false, value);
            } else {
                inputElement.textContent = value;
            }
        }

        ['input', 'change', 'keyup', 'keydown'].forEach(eventType => {
            const event = new Event(eventType, { bubbles: true, cancelable: true });
            inputElement.dispatchEvent(event);
        });

        if (inputElement.scrollHeight > inputElement.clientHeight) {
            inputElement.scrollTop = inputElement.scrollHeight;
        }
    }
    
    setupMutationObserver() {
        if (this.observer) this.observer.disconnect();

        this.observer = new MutationObserver((mutations) => {
            if (this.isCleanedUp) return;
            const inputsToProcess = new Set();
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this.collectInputsFromNode(node, inputsToProcess);
                    }
                }
            }
            if (inputsToProcess.size > 0) {
                this.throttledProcess(inputsToProcess);
            }
        });

        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    processExistingInputs() {
        const existingInputs = new Set();
        this.collectInputsFromNode(document.documentElement, existingInputs);
        if (existingInputs.size > 0) {
            this.processInputs(existingInputs);
        }
    }

    collectInputsFromNode(node, inputsSet) {
        if (this.isTargetInput(node) && !this.processedInputs.has(node)) {
            inputsSet.add(node);
        }
        const selectors = 'textarea, div[contenteditable="true"], [contenteditable="true"]';
        try {
            const elements = node.querySelectorAll(selectors);
            elements.forEach(element => {
                if (this.isTargetInput(element) && !this.processedInputs.has(element)) {
                    inputsSet.add(element);
                }
            });
        } catch (e) { /* 忽略错误 */ }
    }

    isTargetInput(element) {
        if (!element || typeof element.tagName !== 'string') return false;
        return element.tagName.toLowerCase() === 'textarea' || element.isContentEditable;
    }

    processInputs(inputsSet) {
        const inputs = Array.from(inputsSet);
        let index = 0;
        const processChunk = () => {
            const startTime = performance.now();
            while (index < inputs.length && performance.now() - startTime < 10) {
                const input = inputs[index++];
                if (!this.processedInputs.has(input) && this.isValidInput(input)) {
                    this.enhanceInput(input);
                    this.processedInputs.add(input);
                }
            }
            if (index < inputs.length) {
                requestAnimationFrame(processChunk);
            }
        };
        requestAnimationFrame(processChunk);
    }

    isValidInput(input) {
        if (!input || !input.isConnected) return false;
        const rect = input.getBoundingClientRect();
        const style = window.getComputedStyle(input);
        return rect.width > 50 && rect.height > 10 && !input.disabled && !input.readOnly && style.visibility !== 'hidden' && style.display !== 'none';
    }
    
    enhanceInput(input) {
        if (this.enhancementCache.has(input)) return;
        const enhancement = this.createEnhancementUI(input);
        if (!enhancement || !enhancement.wrapper) return;
        this.enhancementCache.set(input, enhancement);

        const hostObserver = new MutationObserver(() => {
            if (!input.isConnected) {
                this.cleanupEnhancement(enhancement, input);
                hostObserver.disconnect();
            }
        });
        hostObserver.observe(document.documentElement, { childList: true, subtree: true });
        enhancement.wrapper._hostObserver = hostObserver;
    }
    
    cleanupEnhancement(enhancement, input) {
        if (!enhancement || !enhancement.wrapper) return;
        const parent = enhancement.wrapper.parentNode;
        if (parent && enhancement.input) {
            parent.insertBefore(enhancement.input, enhancement.wrapper);
        }
        enhancement.wrapper.remove();
        if (enhancement.wrapper._hostObserver) enhancement.wrapper._hostObserver.disconnect();
        this.trackedEnhancements.delete(enhancement);
        if (input) {
            this.enhancementCache.delete(input);
            this.processedInputs.delete(input);
        }
    }
    
    async createEnhancementUI(input) {
        const parent = input.parentNode;
        if (!parent || parent.classList.contains('ai-persona-icon-container')) return null;

        const icon = this.createDOMElement('img', {
            attributes: { src: this.svgIconUrl || '', alt: 'AI', width: 18, height: 18 }
        });

        const iconButton = this.createDOMElement('div', {
            className: `ai-persona-icon ${!this.activeAutoInject ? 'ai-persona-icon-disabled' : ''}`.trim(),
            title: 'AIPersonaLoader',
            children: [icon]
        });
        
        const iconContainer = this.createDOMElement('div', {
            className: 'ai-persona-icon-container',
            children: [iconButton]
        });
        parent.appendChild(iconContainer);
        
        iconButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showPopover(input, iconButton);
        });

        const enhancement = { wrapper: iconContainer, input, iconButton };
        this.trackedEnhancements.add(enhancement);
        return enhancement;
    }

    /**
     * 安全地创建DOM元素，替代innerHTML
     * @param {string} tag - HTML标签名
     * @param {object} options - 选项: className, id, textContent, title, attributes, children
     * @returns {HTMLElement}
     */
    createDOMElement(tag, options = {}) {
        const el = document.createElement(tag);
        if (options.className) el.className = options.className;
        if (options.id) el.id = options.id;
        if (options.textContent) el.textContent = options.textContent;
        if (options.title) el.title = options.title;
        if (options.attributes) {
            for (const [key, value] of Object.entries(options.attributes)) {
                el.setAttribute(key, String(value));
            }
        }
        if (options.children) {
            options.children.forEach(child => child && el.appendChild(child));
        }
        return el;
    }

    async popoverBody(input) {
        await this.refreshGlobalState();

        const container = this.createDOMElement('div', { className: 'ai-persona-popover-body' });
        
        try {
            const manifestResponse = await this.sendMessageWithResponse({ type: "GET_PERSONA_MANIFEST" });
            const manifestData = manifestResponse?.data;
            if (!manifestData || !manifestData.personas) throw new Error("Invalid manifest data");
    
            const activePersona = manifestData.personas.find(p => p.id === manifestData.activePersonaId) || manifestData.personas.find(p => p.isActive);
    
            // 状态卡片
            const statusIcon = this.createDOMElement('div', { className: `ai-persona-status-icon ${this.activeAutoInject ? 'active' : 'inactive'}` });
            const statusTitleText = this.activeAutoInject ? 
                '自动注入已启用' : 
                (
                    this.isInAutoInjectList ?
                        '手动模式，自动注入已关闭' :
                        '手动模式，不支持自动注入'
                );
            const statusTitle = this.createDOMElement('div', { className: 'status-title', textContent: statusTitleText });
            const statusSubtitle = this.createDOMElement('div', { className: 'status-subtitle', textContent: activePersona?.name || '未选择人设' });
            const statusText = this.createDOMElement('div', { className: 'ai-persona-status-text', children: [statusTitle, statusSubtitle] });
            const statusCard = this.createDOMElement('div', { className: 'ai-persona-status-card', children: [statusIcon, statusText] });
            container.appendChild(statusCard);
    
            // 注入通知
            if (this.activeAutoInject) {
                const notice = this.createDOMElement('div', { className: 'ai-persona-notice', textContent: '⚠️ 当前站点支持自动注入，新对话首条消息会自动添加人设。' });
                container.appendChild(notice);
            } else if (this.isInAutoInjectList && !this.activeAutoInject) {
                const notice = this.createDOMElement('div', { className: 'ai-persona-notice', textContent: '⚠️ 当前站点支持自动注入，但是自动注入已被关闭。' });
                container.appendChild(notice);
            }
    
            // 人设选择器
            const label = this.createDOMElement('label', { className: 'ai-persona-label', textContent: '选择人设方案', attributes: { 'for': 'ai-persona-select-popover' } });
            const select = this.createDOMElement('select', { className: 'ai-persona-select', id: 'ai-persona-select-popover' });
            manifestData.personas.forEach(p => {
                const option = this.createDOMElement('option', { textContent: p.name, attributes: { 'value': p.id } });
                if (activePersona && p.id === activePersona.id) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            const selectWrapper = this.createDOMElement('div', { className: 'ai-persona-select-wrapper', children: [select] });
            const selectorGroup = this.createDOMElement('div', { className: 'ai-persona-form-group', children: [label, selectWrapper] });
            container.appendChild(selectorGroup);
    
            // 操作按钮
            const primaryButton = this.createDOMElement('button', { className: 'ai-persona-button ai-persona-button-primary', textContent: '📝 插入到输入框' });
            const secondaryButton = this.createDOMElement('button', { className: 'ai-persona-button ai-persona-button-secondary', textContent: '🚫 本次停用' });
            const actionGroup = this.createDOMElement('div', { className: 'ai-persona-action-group', children: [primaryButton, secondaryButton] });
            container.appendChild(actionGroup);
    
            // 事件绑定
            primaryButton.addEventListener('click', async () => {
                try {
                    const response = await this.sendMessageWithResponse({ 
                        type: "GET_ACTIVE_PERSONA_PROMPT", 
                        data: { once: true, personaId: select.value, fromInputEnhancer: true } 
                    });
                    if (typeof response?.data === 'string' && response.data.length > 0) {
                        this.setInputValue(input, response.data);
                        this.closePopover();
                    } else {
                        console.error("获取人设 Prompt 失败或为空。");
                    }
                } catch (error) {
                    console.error("在注入人设时发生错误:", error);
                }
            });
            secondaryButton.addEventListener('click', () => {
                this.cleanup(true);
            });
    
        } catch (error) {
            console.warn("AIPersonaInputEnhancer: Could not get persona manifest from background.", error.message);
            const errorIcon = this.createDOMElement('div', { className: 'error-icon', textContent: '⚠️' });
            const errorText = this.createDOMElement('div', { className: 'error-text', textContent: '加载人设列表失败' });
            const errorDetails = this.createDOMElement('div', { className: 'error-details', textContent: error.message });
            const errorCard = this.createDOMElement('div', { className: 'ai-persona-error-card', children: [errorIcon, errorText, errorDetails] });
            container.appendChild(errorCard);
        }
        return container;
    }

    async showPopover(input, iconButton) {
        if (this.activePopover) this.closePopover();
    
        // 构建 Popover 骨架 (安全方式)
        const titleIcon = this.createDOMElement('span', { className: 'title-icon', textContent: '🤖' });
        const titleText = this.createDOMElement('span', { className: 'title-text', textContent: 'AIPersonaLoader' });
        const popoverTitle = this.createDOMElement('div', { className: 'popover-title', children: [titleIcon, titleText] });
        const closeBtn = this.createDOMElement('button', { className: 'popover-close', textContent: '×', title: '关闭' });
        const header = this.createDOMElement('div', { className: 'ai-persona-popover-header', children: [popoverTitle, closeBtn] });
    
        const spinner = this.createDOMElement('div', { className: 'spinner' });
        const loaderText = this.createDOMElement('span', { textContent: '加载中...' });
        const loader = this.createDOMElement('div', { className: 'ai-persona-loader', children: [spinner, loaderText] });
        const contentContainer = this.createDOMElement('div', { className: 'ai-persona-popover-content', children: [loader] });
    
        const activePopover = this.createDOMElement('div', {
            className: 'ai-persona-popover',
            children: [header, contentContainer]
        });
        activePopover.id = 'ai-persona-popover'
        
        this.popoverHostNode.shadowRoot.appendChild(activePopover);
        this.activePopover = this.popoverHostNode.shadowRoot.querySelector('#ai-persona-popover');
        this.positionPopover(this.activePopover, iconButton);
    
        closeBtn.addEventListener('click', () => this.closePopover());
    
        // 异步加载并填充内容
        try {
            const bodyContent = await this.popoverBody(input);
            if (contentContainer.replaceChildren) {
                contentContainer.replaceChildren();
            }else {
                while (contentContainer.firstChild) {
                    contentContainer.removeChild(contentContainer.firstChild);
                }
            }
            
            contentContainer.appendChild(bodyContent);
        } catch (error) {
            const errorIcon = this.createDOMElement('div', { className: 'error-icon', textContent: '⚠️' });
            const errorText = this.createDOMElement('div', { className: 'error-text', textContent: '加载失败' });
            const errorDetails = this.createDOMElement('div', { className: 'error-details', textContent: error.message });
            const errorCard = this.createDOMElement('div', { className: 'ai-persona-error-card', children: [errorIcon, errorText, errorDetails] });
            if (contentContainer.replaceChildren) {
                contentContainer.replaceChildren();
            }else {
                while (contentContainer.firstChild) {
                    contentContainer.removeChild(contentContainer.firstChild);
                }
            }
            contentContainer.appendChild(errorCard);
        }
    
        // 内容加载后可能尺寸变化，重新定位
        this.positionPopover(this.activePopover, iconButton);
    
        // 绑定事件监听
        this.popoverResizeHandler = this.throttle(() => {
            if (this.activePopover) this.positionPopover(this.activePopover, iconButton);
        }, 50);
        window.addEventListener('scroll', this.popoverResizeHandler, { passive: true, capture: true });
        window.addEventListener('resize', this.popoverResizeHandler, { passive: true });
    
        this.outsideClickHandler = (e) => {
            if (this.activePopover && !this.popoverHostNode.contains(e.target) && !iconButton.contains(e.target)) {
                this.closePopover();
            }
        };
        setTimeout(() => document.addEventListener('mousedown', this.outsideClickHandler), 0);
    }
    
    positionPopover(popover, iconButton) {
        if (!popover || !iconButton.isConnected) {
            this.closePopover();
            return;
        }

        const iconRect = iconButton.getBoundingClientRect();
        const popoverRect = popover.getBoundingClientRect();
        const vpWidth = window.innerWidth;
        const vpHeight = window.innerHeight;
        const margin = 12;

        const placements = [
            { top: iconRect.top - popoverRect.height, left: iconRect.left - popoverRect.width },
            { top: iconRect.bottom, left: iconRect.left - popoverRect.width },
            { top: iconRect.top - popoverRect.height, left: iconRect.right },
            { top: iconRect.bottom, left: iconRect.right }
        ];

        let bestPlacement = null;

        for (const p of placements) {
            if (
                p.top > margin &&
                p.left > margin &&
                p.top + popoverRect.height < vpHeight - margin &&
                p.left + popoverRect.width < vpWidth - margin
            ) {
                bestPlacement = p;
                break;
            }
        }
        
        if (!bestPlacement) {
            bestPlacement = placements[0];
            bestPlacement.top = Math.max(margin, Math.min(bestPlacement.top, vpHeight - popoverRect.height - margin));
            bestPlacement.left = Math.max(margin, Math.min(bestPlacement.left, vpWidth - popoverRect.width - margin));
        }
        
        popover.style.position = 'fixed';
        popover.style.top = `${bestPlacement.top - 20}px`;
        popover.style.left = `${bestPlacement.left - 20}px`;
        popover.style.zIndex = '2147483647';
    }

    closePopover() {
        if (this.activePopover) {
            this.activePopover.remove();
            this.activePopover = null;
        }
        if (this.popoverResizeHandler) {
            window.removeEventListener('scroll', this.popoverResizeHandler, { capture: true });
            window.removeEventListener('resize', this.popoverResizeHandler);
            this.popoverResizeHandler = null;
        }
        if (this.outsideClickHandler) {
            document.removeEventListener('mousedown', this.outsideClickHandler);
            this.outsideClickHandler = null;
        }
    }

    updateStatusIndicator() {
        if (this.activeAutoInject) {
            this.hideStatusIndicator();
            this.showStatusIndicator();
        } else {
            this.hideStatusIndicator();
        }
    }
    
    async showStatusIndicator() {
        if (this.indicatorHostElement) return;
        
        const manifestResponse = await this.sendMessageWithResponse({type: "GET_PERSONA_MANIFEST"});
        const activePersona = manifestResponse?.data?.personas?.find(p => p.id === manifestResponse.data.activePersonaId);

        this.indicatorHostElement = this.createDOMElement('div', { className: 'ai-persona-status-host' })
        this.indicatorHostElement.attachShadow({ mode: 'open' });
        
        const statusIndicator = this.createDOMElement('div', {
            className: 'ai-persona-status-indicator',
        });
        const icon = this.createDOMElement('img', {
            className: "ai-persona-status-icon",
        });
        icon.src = this.svgIconUrl;
        
        const info = this.createDOMElement('div', {
            className: "ai-persona-status-info",
            textContent: `自动注入已激活：${activePersona?.name || '默认人设'}`
        });

        const style = this.createDOMElement('style', {
            textContent: `.ai-persona-status-indicator {
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    z-index: 9999 !important;
    pointer-events: none !important;
    background: rgba(255, 255, 255, 0.8) !important;
    backdrop-filter: blur(8px) !important;
    padding: 8px 12px !important;
    border-radius: 20px !important;
    font-size: 12px !important;
    color: #64748b !important;
    opacity: 0.7 !important;
    transition: opacity 0.3s ease !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 8px !important;
    justify-content: space-between !important;
}
.ai-persona-status-indicator .ai-persona-status-icon {
    width: 16px !important;
    height: 16px !important;
    border-radius: 0 !important;
}`
        });

        this.indicatorHostElement.shadowRoot.appendChild(style);
        statusIndicator.appendChild(icon);
        statusIndicator.appendChild(info);
        this.indicatorHostElement.shadowRoot.appendChild(statusIndicator);
        document.body.appendChild(this.indicatorHostElement);
    }
    
    hideStatusIndicator() {
        if (this.indicatorHostElement) {
            this.indicatorHostElement.remove();
            this.indicatorHostElement = null;
        }
    }

    cleanup(fromUser=false) {
        if (this.isCleanedUp) return;

        // 判断是否是来自Popover中主动停用
        if (fromUser) {
            this.cleanUpFromUser = true;
            this.popoverHostNode.remove();
            this.popoverHostNode = null;
        } else {
            // 主动停用输入框的手动注入不应该取消右上角的提示。不然容易造成误解自动注入也停用了
            this.hideStatusIndicator();
        }
        this.isCleanedUp = true;
        
        console.log("AIPersonaEnhancer: Cleaning up all injected elements and listeners.");

        this.observer?.disconnect();
        this.closePopover();

        this.trackedEnhancements.forEach(enhancement => {
            this.cleanupEnhancement(enhancement);
        });
        
        this.trackedEnhancements.clear();
        this.processedInputs = new WeakSet();
        this.enhancementCache = new WeakMap();

        document.getElementById('ai-persona-styles')?.remove();
    }
    
    // --- 工具方法 ---
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    sendMessageWithResponse(message) {
        return new Promise((resolve) => {
            const messageHandler = (event) => {
            if (event?.data?.type === `${message?.type}_RESULT`) {
                window.removeEventListener('message', messageHandler);
                resolve(event.data);
            }
            };
            
            window.addEventListener('message', messageHandler);
            window.postMessage(message);
        });
    }

    injectGlobalStyles() {
        if (document.getElementById('ai-persona-styles')) return;
        this.globalStyle = document.createElement('style');
        this.globalStyle.id = 'ai-persona-styles';
        this.globalStyle.textContent = `
        :root {
            --ap-primary: #6366f1; --ap-primary-hover: #4f46e5; --ap-secondary: #64748b; --ap-secondary-hover: #475569;
            --ap-success: #10b981; --ap-warning: #f59e0b; --ap-error: #ef4444; --ap-surface: #ffffff;
            --ap-surface-alt: #f8fafc; --ap-border: #e2e8f0; --ap-text: #0f172a; --ap-text-muted: #64748b;
            --ap-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
            --ap-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
            --ap-radius: 12px; --ap-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        
        .ai-persona-popover-host {all: initial;}
        .ai-persona-input-wrapper { position: relative !important; display: inline-block !important; width: 100% !important; vertical-align: top !important; }
        .ai-persona-icon-container { position: absolute !important; bottom: 5px !important; right: 8px !important; z-index: 10 !important; display: flex; justify-content: flex-end; align-items: center; width: 100%; box-sizing: border-box;}
        .ai-persona-icon { width: 20px !important; height: 20px !important; border-radius: 8px !important; display: flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important; box-shadow: var(--ap-shadow) !important; border: 1px solid rgba(255, 255, 255, 0.2) !important; }
        .ai-persona-icon:hover { transform: translateY(-2px) scale(1.05) !important; box-shadow: var(--ap-shadow-lg) !important;  }
        .ai-persona-icon.ai-persona-icon-disabled { opacity: 0.8 !important; filter: grayscale(100%) !important;}
        .ai-persona-icon.ai-persona-icon-disabled:hover { opacity: 1 !important; filter: grayscale(40%) !important; }
        .ai-persona-icon img { width: 18px !important; height: 18px !important; }
        .ai-persona-popover { position: fixed !important; background: rgba(255, 255, 255, 0.8) !important; backdrop-filter: blur(20px) saturate(180%) !important; -webkit-backdrop-filter: blur(20px) saturate(180%) !important; border: 1px solid var(--ap-border) !important; border-radius: var(--ap-radius) !important; box-shadow: var(--ap-shadow-lg) !important; width: 380px !important; max-width: calc(100vw - 24px) !important; font-family: var(--ap-font) !important; color: var(--ap-text) !important; z-index: 2147483647 !important; animation: popoverFadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards !important; transform-origin: center center; }
        @keyframes popoverFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .ai-persona-popover-header { display: flex !important; align-items: center !important; justify-content: space-between !important; padding: 16px 20px !important; border-bottom: 1px solid var(--ap-border) !important; }
        .popover-title { display: flex !important; align-items: center !important; gap: 10px !important; font-size: 16px !important; font-weight: 600 !important; }
        .popover-close { all: unset !important; box-sizing: border-box !important; width: 28px !important; height: 28px !important; border-radius: 6px !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 20px !important; color: var(--ap-text-muted) !important; cursor: pointer !important; transition: all 0.2s ease !important; }
        .popover-close:hover { background: rgba(0, 0, 0, 0.05) !important; color: var(--ap-text) !important; }
        .ai-persona-popover-content { padding: 20px !important; max-height: calc(80vh - 120px) !important; overflow-y: auto !important; }
        .ai-persona-status-card { display: flex !important; align-items: center !important; gap: 12px !important; padding: 12px 16px !important; background: var(--ap-surface-alt) !important; border-radius: 8px !important; margin-bottom: 16px !important; border: 1px solid var(--ap-border) !important; }
        .ai-persona-status-icon { width: 10px !important; height: 10px !important; border-radius: 50% !important; flex-shrink: 0 !important; }
        .ai-persona-status-icon.active { background-color: var(--ap-success) !important; }
        .ai-persona-status-icon.inactive { background-color: var(--ap-secondary) !important; }
        .status-title { font-weight: 600 !important; font-size: 14px !important; margin-bottom: 2px !important; }
        .status-subtitle { font-size: 12px !important; color: var(--ap-text-muted) !important; }
        .ai-persona-notice { background-color: rgba(251, 191, 36, 0.1) !important; color: #92400e !important; padding: 12px 16px !important; border-radius: 8px !important; font-size: 13px !important; line-height: 1.5 !important; margin-bottom: 16px !important; border: 1px solid rgba(251, 191, 36, 0.3) !important; }
        .ai-persona-label { display: block !important; font-size: 14px !important; font-weight: 500 !important; margin-bottom: 8px !important; }
        .ai-persona-select-wrapper { position: relative !important; }
        .ai-persona-select { width: 100% !important; padding: 10px 40px 10px 16px !important; border: 1px solid var(--ap-border) !important; border-radius: 8px !important; background-color: var(--ap-surface) !important; font-size: 14px !important; font-family: inherit !important; transition: all 0.2s ease !important; -webkit-appearance: none !important; appearance: none !important; background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>') !important; background-repeat: no-repeat !important; background-position: right 12px center !important; }
        .ai-persona-select:focus { outline: none !important; border-color: var(--ap-primary) !important; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2) !important; }
        .ai-persona-action-group { display: flex !important; gap: 12px !important; margin-top: 24px !important; }
        .ai-persona-button { all: unset !important; box-sizing: border-box !important; flex: 1 !important; padding: 10px 20px !important; border-radius: 8px !important; font-size: 14px !important; font-weight: 500 !important; cursor: pointer !important; transition: all 0.2s ease !important; display: flex !important; align-items: center !important; justify-content: center !important; gap: 8px !important; text-align: center; }
        .ai-persona-button-primary { background-color: var(--ap-primary) !important; color: white !important; }
        .ai-persona-button-primary:hover { background-color: var(--ap-primary-hover) !important; transform: translateY(-1px) !important; box-shadow: var(--ap-shadow) !important; }
        .ai-persona-button-secondary { background-color: transparent !important; color: var(--ap-text-muted) !important; border: 1px solid var(--ap-border) !important; }
        .ai-persona-button-secondary:hover { background-color: var(--ap-surface-alt) !important; border-color: #cbd5e1 !important; color: var(--ap-text) !important; }
        .ai-persona-loader { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 32px; color: var(--ap-text-muted); }
        .spinner { width: 24px; height: 24px; border: 3px solid rgba(0,0,0,0.1); border-left-color: var(--ap-primary); border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .ai-persona-error-card { text-align: center; padding: 24px; }
        .error-icon { font-size: 32px; margin-bottom: 12px; }
        .error-text { font-weight: 600; font-size: 16px; margin-bottom: 4px; }
        .error-details { font-size: 12px; color: var(--ap-text-muted); }
        `;
        document.head.appendChild(this.globalStyle);
    }

    
}

if (typeof window !== 'undefined') {
    if (!window.aiPersonaEnhancer) {
        window.aiPersonaEnhancer = new AIPersonaInputEnhancer();
    }
}
