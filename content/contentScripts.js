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

const getApiListData = async () => {
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

const getGlobalEnableState = async () => {
    const state = await chrome.storage.local.get(["globalEnableState"]);
    
    if (Object.keys(state).length === 0 || !Object.keys(state).includes("globalEnableState")) {
        await chrome.storage.local.set({ globalEnableState: true });
        return true;
    }
    return state.globalEnableState;
}


window.addEventListener("message", async function (event) { 
    if (event.source != window) return;

    const eventData = event.data;
    const eventType = eventData?.type;
    const EVENT_LIST = [
        "GET_USER_INFO",
        "GET_GLOBAL_ENABLE_STATE",
        "GET_API_INFO"
    ]
    if (!eventType || !EVENT_LIST.includes(eventType)) return;

    switch (eventType) {
        case "GET_USER_INFO":
            const userInfo = await getUserInfo();
            window.postMessage({
                type: "GET_USER_INFO_RESULT",
                data: userInfo
            });
            break;
        case "GET_GLOBAL_ENABLE_STATE":
            const globalEnableState = await getGlobalEnableState();
            window.postMessage({
                type: "GET_GLOBAL_ENABLE_STATE_RESULT",
                data: globalEnableState
            });
            break;
        case "GET_API_INFO":
            const apiInfo = await getApiListData();
            window.postMessage({
                type: "GET_API_INFO_RESULT",
                data: apiInfo
            })
            break;
        default:
            console.log("未知消息类型");
            break;
    }
});


