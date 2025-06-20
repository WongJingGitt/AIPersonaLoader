document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM Elements ---
    const globalEnableToggle = document.getElementById('globalEnableToggle');
    const globalStatusText = document.getElementById('globalStatusText');
    const siteToggleList = document.getElementById('siteToggleList');
    const siteListSection = document.getElementById('siteListSection');
    const openOptionsButton = document.getElementById('openOptionsButton');
    const copyPromptButton = document.getElementById('copyPromptButton');
    const personaSelect = document.getElementById('personaSelect'); // 新增
    const copyRefreshButton = document.getElementById('copyRefreshPrompt');

    let API_LIST = [];

    // --- 新增：数据存储层，用于和多套人设逻辑交互 ---
    const storage = {
        manifestKey: 'persona_manifest',
        personaKey: (id, type) => `persona_${id}_${type}`,
        async getManifest() {
            const result = await chrome.storage.local.get(this.manifestKey);
            return result[this.manifestKey] || { personas: [], activePersonaId: null };
        },
        async saveManifest(manifest) {
            await chrome.storage.local.set({ [this.manifestKey]: manifest });
        },
    };
    
    // --- 新增：Toast 通知 ---
    function toast(content, duration = 2000) {
        const toastEl = document.createElement('div');
        toastEl.textContent = content;
        toastEl.className = 'toast';
        document.body.appendChild(toastEl);
        setTimeout(() => toastEl.remove(), duration);
    }

    // --- 头像数据配置 ---
    const avatarData = {
        "tongyi": { type: "url", value: chrome.runtime.getURL('img/tongyi.png') },
        "chatgpt": { type: "url", value: chrome.runtime.getURL('img/chatgpt.ico') },
        "doubao": { type: "url", value: chrome.runtime.getURL('img/doubao.png') },
        "yuanbao": { type: "url", value: chrome.runtime.getURL('img/yuanbao.png') },
        "deepseek": { type: "url", value: chrome.runtime.getURL('img/deepseek.png') },
        "grok":  { type: "url", value: chrome.runtime.getURL('img/grok.png') },
    };

    // 将不变的函数体直接放在这里，避免省略
    async function getApiData() {
        const storageApiList = await chrome.storage.local.get(["persona_loader_api_list"])
        const apilistURL = await chrome.runtime.getURL('api_list.json');
        let fileApiList = await fetch(apilistURL).then(res => res.json());
        if (!storageApiList?.persona_loader_api_list) {
            await chrome.storage.local.set({ persona_loader_api_list: fileApiList });
            return fileApiList;
        }

        if (fileApiList.length !== storageApiList?.persona_loader_api_list?.length) {
            fileApiList = fileApiList.map(item => {
                const storageItem = storageApiList?.persona_loader_api_list?.find(i => i.hostname === item.hostname);
                if (storageItem) {
                    item.enabled = storageItem.enabled;
                }
                return item;
            });
            await chrome.storage.local.set({ "persona_loader_api_list": fileApiList });
            return fileApiList;
        }

        return storageApiList?.persona_loader_api_list;
    }

    async function formatPrompt(loadedUserConfig, once) {
        const info = loadedUserConfig?.userInfo_info || ['- 用户暂未提供个人信息'];
        const responseFormat = loadedUserConfig?.userInfo_responseFormat || ['- 用户暂未对输出做出特殊要求，请你按照默认规范输出即可。'];
        const memory = loadedUserConfig?.userInfo_memory || ['- 用户暂未提供记忆内容'];
        
        const onceText = once ? "\n**注意：本次人设仅作用于当前对话，请不要针对这些人设进行添加/修改记忆的行为。**\n" : ""
        return `你是一位专业的AI助手，专门负责解答用户的各种问题。在解答时需要结合以下内容：
${onceText}
## 核心指令
1.  **核心任务**: 你的首要任务是综合运用用户的\`个人信息\`、\`你的输出规范\`以及\`用户记忆内容\`，为用户提供高度个性化和相关的回答。
2.  **优先级规则 - 输出风格冲突**: 当\`用户记忆内容\`中记录的偏好（如对输出丰富程度的偏好）与\`你的输出规范\`在输出风格、格式、长度等方面发生冲突时，你**必须**优先遵循\`你的输出规范\`的要求。例如：
    *   输出规范中要求你的输出必须简洁。
    *   用户记忆内容中表示用户更加喜欢丰富的输出内容。
    *   **你的输出应该仍然以简洁风格为主。**
3.  **持续个性化**: 在与用户的整个交互过程中，你都应主动回顾并运用\`个人信息\`、\`输出规范\`和\`用户记忆内容\`，确保每一轮回答都尽可能贴合用户的需求和背景。
4.  **忠于信息**: \`用户记忆内容\`和\`用户的个人信息\`中记录的内容应被视为事实，除非它们与公认的常识或用户在当前对话中提供的新信息明显矛盾。
5.  **记忆使用规范**: 使用记忆的目的是为了提供更精准、更贴心的回复，而不是展示你记得什么，因此： 
    * **紧扣当前**: 你应当**仅在记忆中的信息与用户当前的提问、请求或正在讨论的话题有直接、明显的关联时**，才考虑使用这些记忆。 
    * **避免无关干扰**: 如果用户的输入是通用性的（如打招呼、询问天气、请求通用知识），或者当前对话内容与记忆中的特定细节（如用户的宠物、爱好、过往经历等）没有直接联系，**你绝对不应主动引入这些记忆信息**。你的回复应聚焦于用户当前表达的需求。 
    * **举例**: 
    * **不当使用**: 用户说：“你好”，你不应回复：“你好！你的小猫最近怎么样了？” (除非用户刚刚主动提及小猫)。 
    * **恰当使用**: 用户问：“我周末想放松一下，有什么建议吗？” 如果记忆中有“用户喜欢安静的活动”，则可以据此推荐。
6.  **当前时间**: 当前时间是：${new Date().toLocaleString()}，星期${['日','一','二','三','四','五','六'][new Date().getDay()]}。时间的使用规范：
    *   **若你的开发者提供了时间获取方式、或者在线搜索功能**: 请优先使用开发者提供的时间获取方式，获取当前时间。或者通过在线搜索获取当前时间。
    *   **若你的开发者没有提供时间获取方式、或者在线搜索功能**: 请使用上面的时间作为参考。          
    **再次提醒：同一个对话可以会时跨多天进行持续对话，因此涉及到时间优先使用你的开发者为你提供的时间获取方式、或者在线搜索实时时间。上面提到的时间仅作为最后的兜底参考。**

## 用户的个人信息
${info.join('\n')}

## 你的输出规范
${responseFormat.join('\n')}

## 用户记忆内容
${memory.join('\n')}
`;
    }

    // --- 新增：渲染人设选择器 ---
    async function renderPersonaSelector() {
        const manifest = await storage.getManifest();
        personaSelect.innerHTML = '';

        if (!manifest.personas || manifest.personas.length === 0) {
            const option = document.createElement('option');
            option.textContent = '请先去设置页面创建人设';
            option.disabled = true;
            personaSelect.appendChild(option);
            return;
        }

        manifest.personas.forEach(persona => {
            const option = document.createElement('option');
            option.value = persona.id;
            option.textContent = persona.name;
            if (persona.id === manifest.activePersonaId) {
                option.selected = true;
            }
            personaSelect.appendChild(option);
        });
    }

    // --- 新增：处理人设切换 ---
    async function handlePersonaChange(event) {
        const newActiveId = event.target.value;
        const manifest = await storage.getManifest();

        if (manifest.activePersonaId !== newActiveId) {
            manifest.activePersonaId = newActiveId;
            manifest.personas.forEach(p => p.isActive = (p.id === newActiveId));
            await storage.saveManifest(manifest);
            
            const selectedPersona = manifest.personas.find(p => p.id === newActiveId);
            toast(`已切换到人设: ${selectedPersona.name}`);
        }
    }
    
    // --- 已更新：获取当前激活人设的数据，用于“一键复制”功能 ---
    const getActivePersonaData = async () => {
        const manifest = await storage.getManifest();
        if (!manifest.activePersonaId) return { userInfo_info: [], userInfo_memory: [], userInfo_responseFormat: [] };
        
        const activeId = manifest.activePersonaId;
        const keys = {
            info: `persona_${activeId}_info`,
            memory: `persona_${activeId}_memory`,
            responseFormat: `persona_${activeId}_responseFormat`
        };
        const data = await chrome.storage.local.get(Object.values(keys));
        
        return {
            userInfo_info: data[keys.info] || [],
            userInfo_memory: data[keys.memory] || [],
            userInfo_responseFormat: data[keys.responseFormat] || []
        };
    };

    // --- 渲染站点列表 ---
    async function renderSiteToggles() { /* ... (函数体不变) ... */ }
    function updateSiteListDisabledState(isGlobalEnabled) { /* ... (函数体不变) ... */ }
    function updateGlobalStatusText(isEnabled) { /* ... (函数体不变) ... */ }

    // --- 初始化加载 ---
    async function initialize() {
        API_LIST = await getApiData();
        
        const storedData = await chrome.storage.local.get(['globalEnableState']);
        const isEnabled = storedData.globalEnableState !== false;
        globalEnableToggle.checked = isEnabled;
        updateSiteListDisabledState(isEnabled);
        updateGlobalStatusText(isEnabled);

        await renderPersonaSelector(); // 新增
        await renderSiteToggles();
    }

    // --- 事件监听器 ---
    if (openOptionsButton) {
        openOptionsButton.addEventListener('click', () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                const optionsPageUrl = chrome.runtime.getURL('options/options.html');
                chrome.tabs.create({ url: optionsPageUrl });
            }
        });
    }

    globalEnableToggle.addEventListener('change', async (event) => { /* ... (函数体不变) ... */ });

    // 新增：人设选择器事件
    personaSelect.addEventListener('change', handlePersonaChange);

    // 更新：“一键复制”按钮事件
    if (copyPromptButton) {
        copyPromptButton.addEventListener('click', async () => {
            try {
                // 使用新的函数获取当前激活人设的数据
                const loadedUserConfig = await getActivePersonaData();
                const fullPrompt = await formatPrompt(loadedUserConfig, false);
                await navigator.clipboard.writeText(fullPrompt);
                
                const originalText = copyPromptButton.textContent;
                copyPromptButton.textContent = '已复制!';
                copyPromptButton.disabled = true;

                setTimeout(() => {
                    copyPromptButton.textContent = originalText;
                    copyPromptButton.disabled = false;
                }, 2000);

            } catch (error) {
                console.error("PersonaLoader: Error copying prompt to clipboard", error);
                copyPromptButton.textContent = '复制失败!';
                setTimeout(() => {
                    copyPromptButton.textContent = "一键复制当前人设";
                }, 2000);
            }
        });
    }

    if (copyRefreshButton) {
        copyRefreshButton.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText("{{刷新人设}}");
                copyRefreshButton.textContent = '已复制!';
                copyRefreshButton.disabled = true;
            } catch (error) {
                console.error("PersonaLoader: Error copying prompt to clipboard", error);
                copyRefreshButton.textContent = '复制失败!';
            } finally {
                setTimeout(() => {
                    copyRefreshButton.textContent = "复制刷新文案";
                    copyRefreshButton.disabled = false;
                }, 2000);
            }
        });
    }

    // --- 启动初始化 ---
    initialize();

    async function renderSiteToggles() {
        siteToggleList.innerHTML = ''; 
        for (const site of API_LIST) {
            const siteItem = document.createElement('div');
            siteItem.classList.add('site-item');
            siteItem.id = `site-item-${site.name}`;
            const avatar = document.createElement('div');
            avatar.classList.add('avatar');
            const specificAvatarData = avatarData[site.name];
            if (specificAvatarData?.type === 'url' && specificAvatarData.value) {
                const img = document.createElement('img');
                img.src = specificAvatarData.value;
                img.alt = `${site.label} logo`;
                avatar.appendChild(img);
            } else {
                avatar.classList.add('avatar-text');
                const text = site.label.charAt(0);
                avatar.textContent = text;
            }
            const siteInfo = document.createElement('div');
            siteInfo.classList.add('site-info');
            const siteLabel = document.createElement('span');
            siteLabel.classList.add('site-label');
            siteLabel.textContent = site.label;
            const siteHostname = document.createElement('span');
            siteHostname.classList.add('site-hostname');
            siteHostname.textContent = site.hostname;
            siteInfo.appendChild(siteLabel);
            siteInfo.appendChild(siteHostname);
            const switchLabel = document.createElement('label');
            switchLabel.classList.add('switch');
            const checkbox = document.createElement('input');
            const datasetAPI = Array.isArray(site.api) ? site.api.join(',') : site.api;
            checkbox.type = 'checkbox';
            checkbox.id = `toggle_${site.name}`;
            checkbox.dataset.siteName = site.name;
            checkbox.dataset.hostname = site.hostname;
            checkbox.dataset.api = datasetAPI;
            checkbox.checked = site?.enabled ?? true;
            if (!checkbox.checked) {
                siteItem.classList.add('disabled-state');
            }
            checkbox.addEventListener('change', async (event) => {
                const isEnabled = event.target.checked;
                const hostname = event.target.dataset.hostname;
                const api = event.target.dataset.api;
                const parentItem = event.target.closest('.site-item');
                if (parentItem) {
                    parentItem.classList.toggle('disabled-state', !isEnabled);
                }
                try {
                    API_LIST = API_LIST.map(item => {
                        const savedAPI = Array.isArray(item.api) ? item.api.join(',') : item.api;
                        if (item.hostname === hostname && savedAPI === api) return {...item, enabled: isEnabled};
                        return item;
                    })
                    await chrome.storage.local?.set({ persona_loader_api_list: API_LIST });
                } catch (error) {
                    console.error(`PersonaLoader Popup: Error saving state`, error);
                }
            });
            const sliderSpan = document.createElement('span');
            sliderSpan.classList.add('slider');
            switchLabel.appendChild(checkbox);
            switchLabel.appendChild(sliderSpan);
            siteItem.appendChild(avatar);
            siteItem.appendChild(siteInfo);
            siteItem.appendChild(switchLabel);
            siteToggleList.appendChild(siteItem);
        }
        updateSiteListDisabledState(globalEnableToggle.checked);
    }
    
    function updateSiteListDisabledState(isGlobalEnabled) {
        if (isGlobalEnabled) {
            siteListSection.classList.remove('disabled-item');
        } else {
            siteListSection.classList.add('disabled-item');
        }
    }

    function updateGlobalStatusText(isEnabled) {
        if (isEnabled) {
            globalStatusText.textContent = '全局人设注入已开启，将在新对话中自动应用。';
            globalStatusText.className = 'enabled';
        } else {
            globalStatusText.textContent = '全局人设注入已关闭。';
            globalStatusText.className = 'disabled';
        }
    }

    globalEnableToggle.addEventListener('change', async (event) => {
        const isEnabled = event.target.checked;
        updateSiteListDisabledState(isEnabled);
        updateGlobalStatusText(isEnabled);
        try {
            await chrome.storage.local.set({ globalEnableState: isEnabled });
        } catch (error) {
            console.error("PersonaLoader Popup: Error saving global state", error);
        }
    });

});