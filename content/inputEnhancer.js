// content.js - 浏览器插件内容脚本

class AIPersonaInputEnhancer {
    constructor() {
        this.processedInputs = new WeakSet();
        this.enhancementCache = new WeakMap();
        this.trackedEnhancements = new Set();
        
        this.activePopover = null;
        this.throttledProcess = this.throttle(this.processInputs.bind(this), 100);
        this.activeAutoInject = false; // 默认值
        this.isCleanedUp = false;
        this.svgIconUrl = null;

        // 立即注入样式，这不依赖任何异步操作
        this.injectGlobalStyles();
        // 监听卸载事件
        window.addEventListener('beforeunload', () => this.cleanup());

        // 启动初始化流程
        this.init();
    }
    

    async init() {
        if (this.isCleanedUp) return;

        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            });
        }
        
        if (!this.shouldInjectOnThisPage()) {
            console.log("AIPersonaInputEnhancer: Injection disabled for this page.");
            return;
        }

        try {
            const api_list_response = await this.sendMessageWithResponse({type: "GET_API_INFO"});
            const api_list = api_list_response?.data || [];
            this.activeAutoInject = api_list.find(item => item.hostname === window.location.hostname);
        
            const svg_icon_response = await this.sendMessageWithResponse({type: "GET_SVG_ICON_URL"});
            this.svgIconUrl = svg_icon_response?.data;
        } catch (error) {
            console.warn("AIPersonaInputEnhancer: Could not get initial state from background. Using default.", error.message);
        }
        

        setTimeout(() => {
            if (this.isCleanedUp) return; 
            this.setupMutationObserver();
            this.processExistingInputs();
        }, 0);
    }
    
    shouldInjectOnThisPage() {
        // TODO: 在这里动态判断是否需要注入。
        //     可以考虑结合hostname来判断，manifest.json中改为所有链接都注入。
        //     在options页面增加一个页面来增加减少需要注入的页面。
        //     类似api_list，也需要一个json文件来作为初始化。
        return true;
    }
    
    setInputValue(inputElement, value) {
        const tagName = inputElement.tagName.toLowerCase();
        
        if (tagName === 'textarea' || tagName === 'input') {
            const prototype = tagName === 'textarea' 
                ? window.HTMLTextAreaElement.prototype 
                : window.HTMLInputElement.prototype;
            const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;
            nativeValueSetter.call(inputElement, value);
            ['input', 'change'].forEach(eventType => {
                const event = new Event(eventType, { bubbles: true });
                inputElement.dispatchEvent(event);
            });
        } else if (inputElement.isContentEditable) {
            inputElement.focus();
            if (navigator.clipboard && window.ClipboardEvent) {
                document.execCommand('selectAll');
                document.execCommand('insertText', false, value);
            } else {
                inputElement.textContent = value;
                const range = document.createRange();
                const selection = window.getSelection();
                range.selectNodeContents(inputElement);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            ['input', 'change'].forEach(eventType => {
                const event = new Event(eventType, { bubbles: true });
                inputElement.dispatchEvent(event);
            });
        }
        if (inputElement.scrollHeight > inputElement.clientHeight) {
            inputElement.scrollTop = inputElement.scrollHeight;
        }
    }
    
    setupMutationObserver() {
        if (this.observer) this.observer.disconnect();

        this.observer = new MutationObserver((mutations) => {
            if (this.isCleanedUp) return;
            const inputsToProcess = new Set();
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this.collectInputsFromNode(node, inputsToProcess);
                    }
                });
            });
            if (inputsToProcess.size > 0) {
                this.throttledProcess(inputsToProcess);
            }
        });
        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
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
        if (this.isTargetInput(node)) {
            inputsSet.add(node);
        }
        const selectors = ['textarea', 'div[contenteditable="true"]', '[contenteditable="true"]'];
        selectors.forEach(selector => {
            try {
                const elements = node.querySelectorAll(selector);
                elements.forEach(element => {
                    if (!this.processedInputs.has(element)) {
                        inputsSet.add(element);
                    }
                });
            } catch (e) { /* Ingnore invalid selector errors */ }
        });
    }

    isTargetInput(element) {
        if (!element.tagName) return false;
        const tag = element.tagName.toLowerCase();
        return tag === 'textarea' || (element.contentEditable === 'true' || element.getAttribute('contenteditable') === 'true');
    }

    processInputs(inputsSet) {
        const inputs = Array.from(inputsSet);
        let index = 0;
        const processChunk = () => {
            const startTime = performance.now();
            while (index < inputs.length && performance.now() - startTime < 5) {
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
        processChunk();
    }

    isValidInput(input) {
        const rect = input.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !input.disabled && !input.readOnly;
    }
    
    enhanceInput(input) {
        if (this.enhancementCache.has(input)) return;

        const enhancement = this.createEnhancementUI(input);
        this.enhancementCache.set(input, enhancement);

        this.observeInputPosition(input, enhancement);

        const hostObserver = new MutationObserver(() => {
            if (!document.body.contains(input)) {
                this.cleanupEnhancement(enhancement);
                hostObserver.disconnect();
            }
        });

        hostObserver.observe(document.documentElement, { childList: true, subtree: true });
        enhancement._hostObserver = hostObserver;
    }
    
    cleanupEnhancement(enhancement) {
        if (!enhancement) return;

        if (enhancement._intersectionObserver) enhancement._intersectionObserver.disconnect();
        if (enhancement._resizeObserver) enhancement._resizeObserver.disconnect();
        if (enhancement._hostObserver) enhancement._hostObserver.disconnect();
        if (enhancement._scrollListener) window.removeEventListener('scroll', enhancement._scrollListener);
        if (enhancement._resizeListener) window.removeEventListener('resize', enhancement._resizeListener);

        enhancement.remove();
        this.trackedEnhancements.delete(enhancement);
    }
    
    createEnhancementUI(input) {
        const container = document.createElement('div');
        container.className = 'ai-persona-enhancement';
        
        const iconContainer = document.createElement('div');
        const icon = document.createElement('img');
        icon.src = this.svgIconUrl;
        icon.alt = 'AIPersonaLoader';
        icon.width = 20;
        icon.height = 20;
        iconContainer.appendChild(icon);
        const iconSvg = iconContainer.firstChild;
        
        const iconButton = document.createElement('div');
        iconButton.classList.add('ai-persona-icon');
        if (!this.activeAutoInject) {
            iconButton.classList.add('ai-persona-icon-status-disabled');
        }
        iconButton.appendChild(iconSvg);
        iconButton.title = 'AIPersonaLoader';
        
        iconButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showPopover(input, iconButton);
        });
        
        container.appendChild(iconButton);
        this.positionEnhancement(container, input);
        document.body.appendChild(container);
        this.trackedEnhancements.add(container);
        
        return container;
    }

    observeInputPosition(input, enhancement) {
        const updateState = { isUpdating: false, isVisible: false };
        const updateLoop = () => {
            if (!updateState.isUpdating || !updateState.isVisible) {
                updateState.isUpdating = false;
                return;
            }
            this.positionEnhancement(enhancement, input);
            requestAnimationFrame(updateLoop);
        };
        const requestUpdate = () => {
            if (!updateState.isUpdating) {
                updateState.isUpdating = true;
                requestAnimationFrame(updateLoop);
            }
        };
        const observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            updateState.isVisible = entry.isIntersecting;
            if (updateState.isVisible) {
                enhancement.style.visibility = 'visible';
                requestUpdate();
            } else {
                enhancement.style.visibility = 'hidden';
                updateState.isUpdating = false;
            }
        }, { threshold: 0 });
        observer.observe(input);
        enhancement._intersectionObserver = observer;
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(() => {
                if (updateState.isVisible) requestUpdate();
            });
            resizeObserver.observe(input);
            enhancement._resizeObserver = resizeObserver;
        }
        const onScrollOrResize = this.throttle(() => {
            if (updateState.isVisible) requestUpdate();
        }, 16);
        window.addEventListener('scroll', onScrollOrResize, { passive: true });
        window.addEventListener('resize', onScrollOrResize, { passive: true });
        enhancement._scrollListener = onScrollOrResize;
        enhancement._resizeListener = onScrollOrResize;
    }

    positionEnhancement(enhancement, input) {
        const rect = input.getBoundingClientRect();
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        enhancement.style.position = 'absolute';
        enhancement.style.top = `${rect.top + scrollY + 5}px`;
        enhancement.style.left = `${rect.right + scrollX - 28}px`;
        enhancement.style.zIndex = '999999';
    }
    
    async popoverBody(input) {
        const outter = document.createElement('div');
        outter.className = 'ai-persona-popover-body-wrapper';

        try {
            let manifestData = await this.sendMessageWithResponse({ type: "GET_PERSONA_MANIFEST" });
            manifestData = manifestData?.data;
            let selectedPersona = manifestData.personas.find(item => item.id === manifestData.activePersonaId) || manifestData.personas.filter(item => item.isActive)?.[0];

            const selectedInformation = document.createElement('p');
            selectedInformation.className = 'ai-persona-information';
            selectedInformation.textContent = this.activeAutoInject ? `当前激活的人设：${selectedPersona?.name || '无'}` : "当前网站不支持自动注入，请手动选择。";
            outter.appendChild(selectedInformation);

            const promptInformation = document.createElement('p');
            promptInformation.className = 'ai-persona-information-subtle';
            promptInformation.textContent = `在此处选择人设方案仅用作本次插入，不影响全局选择。`;
            if (this.activeAutoInject) {
                const autoInjectInformation = document.createElement('p');
                autoInjectInformation.classList.add('ai-persona-information-subtle', 'ai-persona-information-auto-inject');
                autoInjectInformation.textContent = `当前网站支持自动注入，因此在新对话的第一条消息会自动注入人设方案，请勿在新对话的第一条消息手动插入人设方案。`;
                outter.appendChild(autoInjectInformation);
            }

            outter.appendChild(promptInformation);

            const selectRowItem = document.createElement('div');
            selectRowItem.className = 'ai-persona-row-item';
            const selectRowLabel = document.createElement('label');
            selectRowLabel.className = 'ai-persona-row-label';
            selectRowLabel.textContent = '选择人设';
            selectRowLabel.htmlFor = 'ai-persona-select-popover';
            
            const selectElement = document.createElement('select');
            selectElement.className = 'ai-persona-select';
            selectElement.id = 'ai-persona-select-popover';
            for (const persona of manifestData.personas) {
                const option = document.createElement('option');
                option.value = persona.id;
                option.text = persona.name;
                selectElement.appendChild(option);
            };
            if (selectedPersona) {
                selectElement.value = selectedPersona.id;
            }
            
            selectRowItem.appendChild(selectRowLabel);
            selectRowItem.appendChild(selectElement);
            outter.appendChild(selectRowItem);

            const buttonRowItem = document.createElement('div');
            buttonRowItem.className = 'ai-persona-row-item';
            const buttonRowButton = document.createElement('button');
            buttonRowButton.classList.add('ai-persona-button', 'ai-persona-button-primary', 'ai-persona-button-block');
            buttonRowButton.textContent = '填写至输入框';
            buttonRowItem.appendChild(buttonRowButton);
            
            buttonRowButton.addEventListener('click', async () => {
                try {
                    const select = document.getElementById('ai-persona-select-popover');
                    if (!select) return;
                    const selectedPersonaId = select.value;
                    const selectedPromptResponse = await this.sendMessageWithResponse({ 
                        type: "GET_ACTIVE_PERSONA_PROMPT", 
                        data: { once: true, personaId: selectedPersonaId, fromInputEnhancer: true } 
                    });
                    const selectedPrompt = selectedPromptResponse?.data;
                    if (typeof selectedPrompt === 'string' && selectedPrompt.length > 0) {
                        this.setInputValue(input, selectedPrompt);
                        this.closePopover();
                    } else {
                        console.error("获取人设 Prompt 失败或为空。");
                    }
                } catch (error) {
                    console.error("在注入人设时发生错误:", error);
                }
            });
            outter.appendChild(buttonRowItem);
        } catch (error) {
            console.warn("AIPersonaInputEnhancer: Could not get persona manifest from background.", error.message);
            const errorInfo = document.createElement('p');
            errorInfo.textContent = `加载人设列表失败。`;
            errorInfo.style.color = '#d73a49';
            outter.appendChild(errorInfo);
        }

        const cleanupRowItem = document.createElement('div');
        cleanupRowItem.classList.add('ai-persona-row-item', 'ai-persona-row-item-cleanup');
        const cleanupButton = document.createElement('button');
        cleanupButton.classList.add('ai-persona-button', 'ai-persona-button-secondary', 'ai-persona-button-block');
        cleanupButton.textContent = '本次停用';
        cleanupRowItem.appendChild(cleanupButton);
        
        cleanupButton.addEventListener('click', () => {
            this.cleanup();
        });
        outter.appendChild(cleanupRowItem);

        return outter;
    }

    async showPopover(input, iconButton) {
        this.closePopover();
        const popover = document.createElement('div');
        popover.className = 'ai-persona-popover';
        const content = document.createElement('div');
        content.className = 'ai-persona-popover-content';
        const title = document.createElement('div');
        title.className = 'ai-persona-popover-title';
        title.textContent = 'AIPersonaLoader';
        const body = document.createElement('div');
        body.className = 'ai-persona-popover-body';

        const loader = document.createElement('div');
        loader.className = 'ai-persona-loader';
        body.appendChild(loader);
        content.appendChild(body);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'ai-persona-popover-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => this.closePopover());
        content.insertBefore(closeBtn, content.firstChild);
        content.insertBefore(title, body);
        popover.appendChild(content);
        this.activePopover = popover;

        this.positionPopover(popover, iconButton);
        
        const popoverContent = await this.popoverBody(input);
         
        body.replaceChildren?.() ||(function () { while (body.firstChild) body.removeChild(body.firstChild);})();
        
        body.appendChild(popoverContent);
        
        this.popoverResizeHandler = this.throttle(() => {
            if (this.activePopover) this.positionPopover(this.activePopover, iconButton);
        }, 100);
        window.addEventListener('scroll', this.popoverResizeHandler, { passive: true });
        window.addEventListener('resize', this.popoverResizeHandler, { passive: true });
        this.outsideClickHandler = (e) => {
            if (this.activePopover && !this.activePopover.contains(e.target) && !iconButton.contains(e.target)) {
                this.closePopover();
            }
        };
        setTimeout(() => {
            document.addEventListener('mousedown', this.outsideClickHandler);
        }, 0);
    }


    positionPopover(popover, iconButton) {
        const iconRect = iconButton.getBoundingClientRect();
        
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;

        popover.style.position = 'absolute';
        popover.style.visibility = 'hidden';
        popover.style.zIndex = '1000000'; //确保在顶层
        document.body.appendChild(popover);

        const popoverRect = popover.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 10; 

        let top = iconRect.bottom + margin;
        let left = iconRect.left;

        if (top + popoverRect.height > viewportHeight - margin) {
            top = iconRect.top - popoverRect.height - margin;
        }

        if (left + popoverRect.width > viewportWidth - margin) {
            left = iconRect.right - popoverRect.width;
        }

        if (top < margin) {
            top = margin;
        }
        
        if (left < margin) {
            left = margin;
        }

        popover.style.top = `${top + scrollY - 100}px`;
        popover.style.left = `${left + scrollX + 50}px`;
        
        popover.style.visibility = 'visible';
    }

    closePopover() {
        if (this.activePopover) {
            this.activePopover.remove();
            this.activePopover = null;
        }
        if (this.popoverResizeHandler) {
            window.removeEventListener('scroll', this.popoverResizeHandler);
            window.removeEventListener('resize', this.popoverResizeHandler);
            this.popoverResizeHandler = null;
        }
        if (this.outsideClickHandler) {
            document.removeEventListener('mousedown', this.outsideClickHandler);
            this.outsideClickHandler = null;
        }
    }

    cleanup() {
        if (this.isCleanedUp) return;
        this.isCleanedUp = true;
        
        console.log("AIPersonaEnhancer: Cleaning up all injected elements and listeners.");

        this.observer?.disconnect();
        this.observer = null;
        this.closePopover();

        const enhancementsToClean = new Set(this.trackedEnhancements);
        enhancementsToClean.forEach(enhancement => {
            this.cleanupEnhancement(enhancement);
        });
        this.trackedEnhancements.clear();
        
        this.processedInputs = new WeakSet();
        this.enhancementCache = new WeakMap();

        const styleEl = document.getElementById('ai-persona-styles');
        if (styleEl) {
            styleEl.remove();
        }
    }
    
    injectGlobalStyles() {
        if (document.getElementById('ai-persona-styles')) return;
        const style = document.createElement('style');
        style.id = 'ai-persona-styles';
        style.textContent = `
        :root {
            --accent-color: #0969da;
            --accent-color-hover: #085ec5;
            --secondary-color: #6e7781;
            --secondary-color-hover: #57606a;
            --border-color: #d0d7de;
            --popover-bg: #ffffff;
            --text-primary: #1f2328;
            --text-secondary: #6e7781;
            --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .ai-persona-enhancement { pointer-events: auto; }
        .ai-persona-icon {
            width: 20px; height: 20px; color: white; border-radius: 4px; display: flex;
            align-items: center; justify-content: center; cursor: pointer;
            box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
            transition: all 0.2s cubic-bezier(.25,.8,.25,1); font-family: var(--font-family);
        }
        .ai-persona-icon:hover { transform: scale(1.1); box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23); }
        .ai-persona-icon.ai-persona-icon-status-disabled { filter: grayscale(80%) opacity(0.8); }
        .ai-persona-icon.ai-persona-icon-status-disabled:hover { filter: grayscale(0%); opacity: 1; }
        .ai-persona-icon svg { width: 20px; height: 20px; }

        .ai-persona-popover {
            background: var(--popover-bg); border: 1px solid var(--border-color);
            border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
            min-width: 300px; max-width: 400px; max-height: 80vh;
            overflow: hidden; font-family: var(--font-family);
            display: flex; flex-direction: column; transition: opacity 0.1s ease-out, transform 0.1s ease-out;
        }
        .ai-persona-popover-content { position: relative; padding: 16px; }
        .ai-persona-popover-close {
            position: absolute; top: 12px; right: 12px; background: none; border: none;
            font-size: 20px; line-height: 1; cursor: pointer; color: #999; width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center; border-radius: 50%;
        }
        .ai-persona-popover-close:hover { background: #f5f5f5; color: #333; }
        .ai-persona-popover-title {
            font-size: 16px; font-weight: 600; margin-bottom: 12px;
            color: var(--text-primary); padding-right: 24px;
        }
        .ai-persona-popover-body { color: var(--text-secondary); font-size: 14px; line-height: 1.5; }
        
        .ai-persona-information { margin: 0 0 4px 0; font-size: 13px; color: var(--text-primary); }
        .ai-persona-information-subtle { margin: 0 0 16px 0; font-size: 12px; color: var(--text-secondary); }
        .ai-persona-information-auto-inject {margin: 0 0 8px 0; font-weight: bold;}

        .ai-persona-row-item { display: flex; align-items: center; margin-bottom: 12px; gap: 12px; }
        .ai-persona-row-label { flex-shrink: 0; color: var(--text-primary); }
        .ai-persona-select {
            flex-grow: 1; padding: 8px 12px; background: #f6f8fa; border: 1px solid var(--border-color);
            color: var(--text-primary); border-radius: 6px; font-family: inherit; font-size: 14px;
            -webkit-appearance: none; appearance: none;
            background-image: url('data:image/svg+xml;utf8,<svg fill="none" stroke="%23607D8B" stroke-width="2" stroke-linecap="round" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5"/></svg>');
            background-repeat: no-repeat; background-position: right 12px center; cursor: pointer;
        }
        .ai-persona-select:focus { border-color: var(--accent-color); box-shadow: 0 0 0 2px rgba(9, 105, 218, 0.3); outline: none; }

        .ai-persona-button { width: 100%; height: 40px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease-out; box-sizing: border-box; border: 1px solid transparent; }
        .ai-persona-button.ai-persona-button-primary { background-color: var(--accent-color); color: white; }
        .ai-persona-button.ai-persona-button-primary:hover { background-color: var(--accent-color-hover); transform: translateY(-1px); box-shadow: 0 2px 4px rgba(9, 105, 218, 0.2); }
        .ai-persona-button.ai-persona-button-secondary { background-color: transparent; color: var(--secondary-color); border: 1px solid var(--border-color); margin-top: 8px;}
        .ai-persona-button.ai-persona-button-secondary:hover { background-color: #f6f8fa; color: var(--secondary-color-hover); border-color: var(--secondary-color); }
        .ai-persona-button-block { width: 100%; display: block; flex: 1;}
        .ai-persona-row-item-cleanup { border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 12px;}
        
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .ai-persona-loader {
            margin: 20px auto; width: 24px; height: 24px; border: 3px solid rgba(0,0,0,0.1);
            border-left-color: var(--accent-color); border-radius: 50%; animation: spin 1s linear infinite;
        }
      `;
        document.head.appendChild(style);
    }
    
    throttle(func, delay) {
        let timeoutId;
        let lastExecTime = 0;
        return function (...args) {
            const currentTime = Date.now();
            const self = this;
            if (currentTime - lastExecTime > delay) {
                func.apply(self, args);
                lastExecTime = currentTime;
            } else {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    func.apply(self, args);
                    lastExecTime = Date.now();
                }, delay - (currentTime - lastExecTime));
            }
        };
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
}

if (typeof window !== 'undefined') {
    if (!window.aiPersonaEnhancer) {
        window.aiPersonaEnhancer = new AIPersonaInputEnhancer();
    }
}