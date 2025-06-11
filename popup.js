const getApiData = async () => {
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
};

const getUserInfo = async () => {
    const infos = await chrome.storage.local.get(["userInfo_info", "userInfo_memory", "userInfo_responseFormat"]);
    let userInfo = infos?.userInfo_info;
    let memory = infos?.userInfo_memory;
    let responseFormat = infos?.userInfo_responseFormat;
    if (!userInfo) {
        await chrome.storage.local.set({ userInfo_info: [] });
        userInfo = [];
    };
    if (!memory) {
        await chrome.storage.local.set({ userInfo_memory: [] });
        memory = [];
    };
    if (!responseFormat) {
        await chrome.storage.local.set({ userInfo_responseFormat: [] });
        responseFormat = [];
    };
    return {
        userInfo_info: userInfo,
        userInfo_memory: memory,
        userInfo_responseFormat: responseFormat
    }
};

async function formatPrompt(loadedUserConfig, once) {
    const info = loadedUserConfig?.userInfo_info?.map(item => `- ${item}`) || ['- 用户暂未提供个人信息'];
    const responseFormat = loadedUserConfig?.userInfo_responseFormat?.map(item => `- ${item}`) || ['- 用户暂未对输出做出特殊要求，请你按照默认规范输出即可。'];
    const memory = loadedUserConfig?.userInfo_memory?.map(item => `- ${item}`) || ['- 用户暂未提供记忆内容'];
    
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

## 用户的个人信息
${info.join('\n')}

## 你的输出规范
${responseFormat.join('\n')}

## 用户记忆内容
${memory.join('\n')}
`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const globalEnableToggle = document.getElementById('globalEnableToggle');
    const siteToggleList = document.getElementById('siteToggleList');
    const siteListSection = document.getElementById('siteListSection');
    const openOptionsButton = document.getElementById('openOptionsButton');
    const copyPromptButton = document.getElementById('copyPromptButton');

    let API_LIST = await getApiData();

    if (openOptionsButton) {
        openOptionsButton.addEventListener('click', () => {

            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                const optionsPageUrl = chrome.runtime.getURL('options/options.html');
                chrome.tabs.create({ url: optionsPageUrl });
                console.warn("chrome.runtime.openOptionsPage is not available, opening options page via chrome.tabs.create.");
            }
        });
    }

    try {
        const storedData = await chrome.storage?.local?.get(['apiList', 'userInfo', 'globalEnableState']);

        globalEnableToggle.checked = storedData.globalEnableState !== undefined ? storedData.globalEnableState : true; // Default to true
        updateSiteListDisabledState(globalEnableToggle.checked);

    } catch (error) {
        console.error("PersonaLoader Popup: Error loading initial data from storage", error);
        // Use defaults if storage fails
        globalEnableToggle.checked = true;
        updateSiteListDisabledState(true);
    }
    
    // --- RENDER SITE LIST ---
    async function renderSiteToggles() {
        siteToggleList.innerHTML = ''; // Clear existing
        for (const site of API_LIST) {
            const siteItem = document.createElement('div');
            siteItem.classList.add('site-item');
            siteItem.id = `site-item-${site.name}`;

            const siteNameSpan = document.createElement('span');
            siteNameSpan.textContent = site.label;

            const switchLabel = document.createElement('label');
            switchLabel.classList.add('switch');

            const checkbox = document.createElement('input');
            const datasetAPI = Array.isArray(site.api) ? site.api.join(',') : site.api;
            checkbox.type = 'checkbox';
            checkbox.id = `toggle_${site.name}`;
            checkbox.dataset.siteName = site.name;
            checkbox.dataset.hostname = site.hostname;
            checkbox.dataset.api = datasetAPI

            // Load individual site state
            try {
                checkbox.checked = site?.enabled ?? true; // Default to true
            } catch (e) {
                console.error(`Error loading state for ${site.name}`, e);
                checkbox.checked = true; // Default on error
            }
            
            checkbox.addEventListener('change', async (event) => {
                const siteName = event.target.dataset.siteName;
                const isEnabled = event.target.checked;
                const hostname = event.target.dataset.hostname;
                const api = event.target.dataset.api;
                try {
                    API_LIST = API_LIST.map(item => {
                        const savedAPI = Array.isArray(item.api) ? item.api.join(',') : item.api;
                        if (item.hostname === hostname && savedAPI === api) return {...item, enabled: isEnabled};
                        return item;
                    })
                    console.log(API_LIST)
                    await chrome.storage.local?.set({ persona_loader_api_list: API_LIST })
                    console.log(`${siteName} state saved: ${isEnabled}`);
                } catch (error) {
                    console.error(`PersonaLoader Popup: Error saving state for ${siteName}`, error);
                }
            });

            const sliderSpan = document.createElement('span');
            sliderSpan.classList.add('slider');

            switchLabel.appendChild(checkbox);
            switchLabel.appendChild(sliderSpan);

            siteItem.appendChild(siteNameSpan);
            siteItem.appendChild(switchLabel);
            siteToggleList.appendChild(siteItem);
        }
        updateSiteListDisabledState(globalEnableToggle.checked); // Apply initial disabled state
    }

    function updateSiteListDisabledState(isGlobalEnabled) {
        const items = siteToggleList.querySelectorAll('.site-item');
        if (isGlobalEnabled) {
            siteListSection.classList.remove('disabled-item');
            items.forEach(item => item.classList.remove('disabled-item'));
        } else {
            siteListSection.classList.add('disabled-item');
             items.forEach(item => item.classList.add('disabled-item'));
        }
    }
    
    // --- EVENT LISTENERS ---
    globalEnableToggle.addEventListener('change', async (event) => {
        const isEnabled = event.target.checked;
        try {
            await chrome.storage.local.set({ globalEnableState: isEnabled });
            console.log(`Global enable state saved: ${isEnabled}`);
            updateSiteListDisabledState(isEnabled);
        } catch (error) {
            console.error("PersonaLoader Popup: Error saving global state", error);
        }
    });

    

    await renderSiteToggles(); // Initial render

    

    if (copyPromptButton) {
        copyPromptButton.addEventListener('click', async () => {
            try {
                // 1. 获取最新的用户信息和配置
                const loadedUserConfig = await getUserInfo();

                // 2. 使用你的函数格式化完整的Prompt，问题部分用占位符代替
                const fullPrompt = await formatPrompt(
                    loadedUserConfig, 
                    false // false表示这不是一次性Prompt
                );

                // 3. 使用Clipboard API将Prompt复制到剪贴板
                await navigator.clipboard.writeText(fullPrompt);
                
                // 4. 提供用户反馈，告知复制成功
                const originalText = copyPromptButton.textContent;
                copyPromptButton.textContent = '已复制到剪贴板!';
                copyPromptButton.disabled = true; // 防止重复点击

                setTimeout(() => {
                    copyPromptButton.textContent = originalText;
                    copyPromptButton.disabled = false;
                }, 2000); // 2秒后恢复原状

            } catch (error) {
                console.error("PersonaLoader: Error copying prompt to clipboard", error);
                // 可以在此处理错误，例如更改按钮文本为“复制失败”
                copyPromptButton.textContent = '复制失败!';
                setTimeout(() => {
                    copyPromptButton.textContent = "一键复制完整Prompt";
                }, 2000);
            }
        });
    }
});