// 已重写：现在根据 manifest 获取激活人设的数据
const getActivePersonaData = async () => {
    const manifestKey = 'persona_manifest';
    const manifestResult = await chrome.storage.local.get(manifestKey);
    const manifest = manifestResult[manifestKey];

    // 如果没有 manifest 或没有激活的人设 ID，返回空数据结构
    if (!manifest || !manifest.activePersonaId) {
        return { userInfo_info: [], userInfo_memory: [], userInfo_responseFormat: [] };
    }

    const activeId = manifest.activePersonaId;
    
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

window.addEventListener("message", async function (event) { 
    if (event.source !== window) return;

    const eventData = event.data;
    const eventType = eventData?.type;
    const EVENT_LIST = [ "GET_USER_INFO", "GET_GLOBAL_ENABLE_STATE", "GET_API_INFO" ];
    
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
        }
        window.postMessage({ type: responseType, data: responseData });
    } catch (error) {
        console.error(`PersonaLoader Error handling ${eventType}:`, error);
        window.postMessage({ type: responseType, data: null, error: error.message });
    }
});