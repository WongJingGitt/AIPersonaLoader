// 已重写：现在根据 manifest 获取激活人设的数据
const getActivePersonaData = async (personaId) => {
    let activeId = personaId;

    if (!activeId) {
        const manifestKey = 'persona_manifest';
        const manifestResult = await chrome.storage.local.get(manifestKey);
        const manifest = manifestResult[manifestKey];

        // 如果没有 manifest 或没有激活的人设 ID，返回空数据结构
        if (!manifest || !manifest.activePersonaId) {
            return { userInfo_info: [], userInfo_memory: [], userInfo_responseFormat: [] };
        }
        activeId = manifest.activePersonaId;
    }
    
    // 根据激活 ID 构建存储键名
    const keys = {
        info: `persona_${activeId}_info`,
        memory: `persona_${activeId}_memory`,
        responseFormat: `persona_${activeId}_responseFormat`
    };

    // 一次性获取所有人设数据
    const personaData = await chrome.storage.local.get(Object.values(keys));
    
    // 返回与旧结构兼容的对象
    return {
        userInfo_info: personaData[keys.info] || [],
        userInfo_memory: personaData[keys.memory] || [],
        userInfo_responseFormat: personaData[keys.responseFormat] || []
    };
};

const getApiListData = async () => {
    const storageApiList = await chrome.storage.local.get(["persona_loader_api_list"]);
    const apilistURL = await chrome.runtime.getURL('api_list.json');
    let fileApiList = await fetch(apilistURL).then(res => res.json());

    const storedList = storageApiList?.persona_loader_api_list;

    if (!storedList) {
        await chrome.storage.local.set({ persona_loader_api_list: fileApiList });
        return fileApiList;
    }

    if (fileApiList.length !== storedList.length) {
        fileApiList = fileApiList.map(fileItem => {
            const storageItem = storedList.find(i => i.hostname === fileItem.hostname);
            if (storageItem) {
                fileItem.enabled = storageItem.enabled;
            }
            return fileItem;
        });
        await chrome.storage.local.set({ "persona_loader_api_list": fileApiList });
        return fileApiList;
    }

    return storedList;
};

const getGlobalEnableState = async () => {
    const state = await chrome.storage.local.get(["globalEnableState"]);
    
    if (state.globalEnableState === undefined) {
        await chrome.storage.local.set({ globalEnableState: true });
        return true;
    }
    return state.globalEnableState;
}

const getPersonaManifest = async () => { 
    const manifest = await chrome.storage.local.get(["persona_manifest"]);
    if (!manifest.persona_manifest) {
        await chrome.storage.local.set({ persona_manifest: { activePersonaId: null, personas: [] } });
        return { activePersonaId: null, personas: [] };
    }
    return manifest.persona_manifest;
}

async function formatPrompt(loadedUserConfig, once, fromInputEnhancer) {
    const info = loadedUserConfig?.userInfo_info || ['- 用户暂未提供个人信息'];
    const responseFormat = loadedUserConfig?.userInfo_responseFormat || ['- 用户暂未对输出做出特殊要求，请你按照默认规范输出即可。'];
    const memory = loadedUserConfig?.userInfo_memory || ['- 用户暂未提供记忆内容'];
    
    const onceText = once ? "\n**注意：本次人设仅作用于当前对话，请不要针对这些人设进行添加/修改记忆的行为。**\n" : ""
    const inputEnhancerText = `

-----

## 用户提问，以下是用户的初始问题：

`

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
${fromInputEnhancer && inputEnhancerText}
`;

}


window.addEventListener("message", async function (event) { 
    if (event.source !== window) return;

    const eventData = event.data;
    const eventType = eventData?.type;
    const EVENT_LIST = [ 
        "GET_USER_INFO", "GET_GLOBAL_ENABLE_STATE", 
        "GET_API_INFO", "GET_PERSONA_MANIFEST", "GET_ACTIVE_PERSONA_PROMPT",
        "GET_SVG_ICON_URL",
    ];
    
    if (!eventType || !EVENT_LIST.includes(eventType)) return;

    let responseData = null;
    let responseType = `${eventType}_RESULT`;

    try {
        switch (eventType) {
            case "GET_USER_INFO":
                responseData = await getActivePersonaData(); // 调用新的函数
                break;
            case "GET_GLOBAL_ENABLE_STATE":
                responseData = await getGlobalEnableState();
                break;
            case "GET_API_INFO":
                responseData = await getApiListData();
                break;
            case "GET_PERSONA_MANIFEST":
                responseData = await getPersonaManifest();
                break;
            case "GET_ACTIVE_PERSONA_PROMPT":
                const personaInfo = await getActivePersonaData(eventData?.data?.personaId)
                responseData = await formatPrompt(personaInfo, eventData?.data?.once, eventData?.data?.fromInputEnhancer);
                break;
            case "GET_SVG_ICON_URL":
                const svgURL = await chrome.runtime.getURL('img/icon.svg');
                responseData = svgURL;
                break;
        }
        window.postMessage({ type: responseType, data: responseData });
    } catch (error) {
        console.error(`PersonaLoader Error handling ${eventType}:`, error);
        window.postMessage({ type: responseType, data: null, error: error.message });
    }
});