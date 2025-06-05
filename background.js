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



chrome.webNavigation.onCompleted.addListener(async details => {
    // 在网页加载完之后执行核心逻辑注入
    // 配合document_start注入的content/contentScripts.js 通过监听message事件互相传递数据，解决MAIN wrold无法使用chrome API的问题

    const apiListData = await getApiListData();
    const currentUrl = new URL(details.url);
    const apiMatch = apiListData.find(apiData => {
        return currentUrl.hostname === apiData.hostname
    });

    if (!apiMatch) return;

    chrome.scripting.executeScript({
        target: {tabId: details.tabId},
        func: (firstApiOption) => {
            function sendMessageWithResponse(message) {
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

            // Prompt格式化函数
            async function formatPrompt(originalPrompt, loadedUserConfig, once) {
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

## 用户的个人信息
${info.join('\n')}

## 你的输出规范
${responseFormat.join('\n')}

## 用户记忆内容
${memory.join('\n')}

---

以下是用户的初始问题：

${originalPrompt}
            `;
            }
            
            // 核心注入逻辑处理，后续增加、修改维护这里即可
            // 接收body返回修改后的body
            async function inject(requestBody, apiOptions, globalEnableState, userInfos) {
                const injectList = {
                    yuanbao: async (requestBody, apiOptions, globalEnableState, infos) => {
                        if (!globalEnableState || !apiOptions.enabled) return requestBody;
                        if (requestBody?.chatModelExtInfo || requestBody?.prompt?.includes("{{刷新人设}}")) {
                            const prompt = requestBody?.prompt?.replace(/{{刷新人设}}/g, '这是我最新的信息，请你先忘记之前关于我的信息，然后以这份信息为准。\n\n')
                            const displayPrompt = requestBody?.displayPrompt?.replace(/{{刷新人设}}/g, '这是我最新的信息，请你先忘记之前关于我的信息，然后以这份信息为准。\n\n')

                            return {
                                ...requestBody,
                                prompt: await formatPrompt(prompt, infos),
                                displayPrompt: await formatPrompt(displayPrompt, infos)
                            }
                        }
                        return requestBody;
                    },
                    deepseek: async (requestBody, apiOptions, globalEnableState, infos) => {
                        if (!globalEnableState || !apiOptions.enabled) return requestBody;
                        if (!requestBody?.parent_message_id || requestBody.prompt?.includes("{{刷新人设}}")) {
                            const prompt = requestBody?.prompt?.replace(/{{刷新人设}}/g, '这是我最新的信息，请你先忘记之前关于我的信息，然后以这份信息为准。\n\n')
                            return {
                                ...requestBody,
                                prompt: await formatPrompt(prompt, infos)
                            }
                        }
                        return requestBody;
                    },
                    tongyi: async (requestBody, apiOptions, globalEnableState, infos) => {
                        if (!globalEnableState || !apiOptions.enabled) return requestBody;
                        if (!requestBody?.sessionId || requestBody.prompt?.includes("{{刷新人设}}")) {
                            let newContent = [];
                            for (let item of requestBody?.contents) {
                                if (item.contentType === "text") {
                                    item.content = await formatPrompt(
                                        item.content.replace(/{{刷新人设}}/g, '这是我最新的信息，请你先忘记之前关于我的信息，然后以这份信息为准。\n\n'),
                                        infos
                                    );
                                    newContent.push(item)
                                    continue;
                                }
                                newContent.push(item)
                            }
                            requestBody.contents = newContent
                        }    
                        return requestBody;
                    },
                    chatglm:  async (requestBody, apiOptions, globalEnableState, infos) => { 
                        /*
                            TODO 未知原因导致网站会话列表点击无响应，接口是有正常响应的
                            {
                                "api": "https://chatglm.cn/chatglm/backend-api/assistant/stream",
                                "name": "chatglm",
                                "hostname": "chatglm.cn",
                                "enabled": true
                            }
                        */
                        if (!globalEnableState || !apiOptions.enabled) return requestBody;
                        if (!requestBody?.conversation_id|| requestBody.prompt?.includes("{{刷新人设}}")) {
                            let newContent = [];
                            for (let item of requestBody?.messages) {
                                let content = [];
                                for ( let contentItem of item.content ) {
                                    if (contentItem?.type === "text") {
                                        content.push({
                                            ...contentItem,
                                            text: await formatPrompt(
                                                contentItem.text.replace(/{{刷新人设}}/g, '这是我最新的信息，请你先忘记之前关于我的信息，然后以这份信息为准。\n\n'),
                                                infos
                                            )
                                        });
                                        continue;
                                    }
                                    content.push(contentItem);
                                }
                                item.content = content;
                            }
                            requestBody.contents = newContent
                        }
                        return requestBody;   
                    },
                    chatgpt: async (requestBody, apiOptions, globalEnableState, infos) => { 
                        if (!globalEnableState || !apiOptions.enabled) return requestBody;
                        if (!requestBody?.conversation_id || requestBody.prompt?.includes("{{刷新人设}}") || requestBody?.parent_message_id === "client-created-root") {
                            let newMessages = [];                            
                            for (let messageItem of requestBody?.messages) {
                                if (!messageItem?.author?.role === "user" || messageItem.content.content_type !== "text") {
                                    newMessages.push(messageItem);
                                    continue;
                                }
                                const originalPrompt = messageItem.content.parts?.length < 1 ? [''] : messageItem.content.parts
                                const newPrompt = await formatPrompt(
                                    originalPrompt[0].replace(/{{刷新人设}}/g, '这是我最新的信息，请你先忘记之前关于我的信息，然后以这份信息为准。\n\n'),
                                    infos,
                                    true
                                );
                                let newParts = messageItem.content.parts
                                newParts[0] = newPrompt;
                                newMessages.push({
                                    ...messageItem,
                                    content: {
                                        ...messageItem.content,
                                        parts: newParts
                                    }
                                });
                            }
                            requestBody.messages = newMessages;
                        }
                        return requestBody;
                    },
                }
                return await injectList[apiOptions.name](requestBody, apiOptions, globalEnableState, userInfos);
            }


            async function getAllData () {
                const apiList = await sendMessageWithResponse({type: "GET_API_INFO"});
                const userInfos = await sendMessageWithResponse({type: "GET_USER_INFO"});
                const globalEnableState = await sendMessageWithResponse({type: "GET_GLOBAL_ENABLE_STATE"});
                return {
                    apiList: apiList.data, 
                    userInfos:  userInfos.data, 
                    globalEnableState:  globalEnableState.data
                };
            }

            const checkChatAPI = (baseAPI, currentAPI) => {
                // 判断当前是不是聊天的接口，是=>true
                // baseAPI: 实际的API，api_list.api
                // currentAPI: 当前监控到的API
                if (!baseAPI || !currentAPI) return false;
                if (typeof baseAPI === 'string') {
                    return currentAPI.includes(baseAPI);
                }
                if (Array.isArray(baseAPI)) {
                    return baseAPI.some(item => item.includes(currentAPI))
                }
                return false
            }

            // 托管xhr请求
            const proxyHandler = (config, handler) => {
                
                if (!checkChatAPI(firstApiOption.api, config.url)) {
                    handler.next(config);
                    return;
                }

                getAllData()
                    .then(data => {
                        const {apiList, userInfos, globalEnableState} = data;
                        let newConfig = { ...config };
                        const currentHostname = window.location.hostname;
                        const apiOptions = apiList.find(item => item.hostname === currentHostname);
                        const currentBody = JSON.parse(config.body || '{}');

                        inject(currentBody, apiOptions, globalEnableState, userInfos)
                            .then(newBody => { 
                                console.log('BODY', newBody)
                                newConfig.body = JSON.stringify(newBody);
                                handler.next(newConfig);
                            })
                            .catch(e => {
                                console.warn('注入失败', e)
                                handler.reject(e)
                            })
                    });
            }
            
            // 托管fetch请求
            hookFetch({
                optionsHook: async (config, url) => {
                    if (!checkChatAPI(firstApiOption.api, url) ) {
                        return config;
                    }
                    // console.log('URL', url)
                    // console.log('CONFIG', config)
                    // console.log('------------')
                    const {apiList, userInfos, globalEnableState} = await getAllData();
                    let newConfig = { ...config };
                    const currentHostname = window.location.hostname;
                    const apiOptions = apiList.find(item => item.hostname === currentHostname);
                    const currentBody = JSON.parse(config.body || '{}');
                    const newBody = await inject(currentBody, apiOptions, globalEnableState, userInfos)
                    newConfig.body = JSON.stringify(newBody);
                    return newConfig;
                }
            })

            ah.proxy({
                onRequest: proxyHandler
            })
        },
        world: 'MAIN',
        args: [apiMatch]
    });   

})