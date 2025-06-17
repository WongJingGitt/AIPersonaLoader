// 已更新：与其他文件保持一致的标准化函数
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

---

以下是用户的初始问题：

${originalPrompt}
            `;
            }
            
            // 核心注入逻辑处理，后续增加、修改维护这里即可
            // 接收body返回修改后的body
            async function inject(requestBody, apiOptions, globalEnableState, userInfos, headers, url) {
                const injectList = {
                    yuanbao: async (requestBody, apiOptions, globalEnableState, infos, headers, url) => {
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
                    deepseek: async (requestBody, apiOptions, globalEnableState, infos, headers, url) => {
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
                    tongyi: async (requestBody, apiOptions, globalEnableState, infos, headers, url) => {
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
                    chatglm:  async (requestBody, apiOptions, globalEnableState, infos, headers, url) => { 
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
                    chatgpt: async (requestBody, apiOptions, globalEnableState, infos, headers, url) => { 
                        if (!globalEnableState || !apiOptions.enabled) return requestBody;
                        if (!requestBody?.conversation_id || requestBody.prompt?.includes("{{刷新人设}}") || requestBody?.parent_message_id === "client-created-root") {
                            console.log('chatgpt', requestBody)
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
                    googleAIStudio: async (requestBody, apiOptions, globalEnableState, infos, headers, url) => {
                        /*
                            Google AI Studio对请求有加密验证，修改Prompt，会导致请求失败 403
                            ,
                            {
                                "api": "https://alkalimakersuite-pa.clients6.google.com/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/GenerateContent",
                                "name": "googleAIStudio",
                                "hostname": "aistudio.google.com",
                                "enabled": true,
                                "label": "Google AI Studio"
                            }
                         */

                        if (!globalEnableState || !apiOptions.enabled) return requestBody;

                        // requestBody 是数组格式 [model, conversations, config, params, encodedData, lastMessage]
                        if (!Array.isArray(requestBody) || requestBody.length < 2) return requestBody;

                        const conversations = requestBody[1]; // 对话历史数组

                        // 判断是否为第一次请求：只有一个用户消息且没有模型回复
                        const isFirstRequest = conversations.length === 1 &&
                            conversations[0][1] === "user";

                        // 检查是否包含刷新人设标记
                        const hasRefreshMarker = conversations.some(conv =>
                            conv[1] === "user" &&
                            conv[0] &&
                            conv[0][0] &&
                            conv[0][0][1] &&
                            conv[0][0][1].includes("{{刷新人设}}")
                        );

                        // 如果是第一次请求或包含刷新人设标记，则处理 Prompt
                        if (isFirstRequest || hasRefreshMarker) {
                            let newRequestBody = [...requestBody];
                            let newConversations = [];

                            for (let conversation of conversations) {
                                if (conversation[1] === "user" && conversation[0] && conversation[0][0] && conversation[0][0][1]) {
                                    // 处理用户消息
                                    const originalText = conversation[0][0][1];
                                    const newText = await formatPrompt(
                                        originalText.replace(/{{刷新人设}}/g, '这是我最新的信息，请你先忘记之前关于我的信息，然后以这份信息为准。\n\n'),
                                        infos
                                    );

                                    // 创建新的对话结构
                                    const newConversation = [
                                        [
                                            [
                                                conversation[0][0][0], // 保持原有的 null 或其他值
                                                newText
                                            ]
                                        ],
                                        conversation[1] // 保持 "user"
                                    ];
                                    newConversations.push(newConversation);
                                } else {
                                    // 非用户消息或结构不匹配，直接保留
                                    newConversations.push(conversation);
                                }
                            }

                            newRequestBody[1] = newConversations;
                            return newRequestBody;
                        }

                        return requestBody;
                    },
                    doubao: async (requestBody, apiOptions, globalEnableState, infos, headers, url) => {
                        if (!globalEnableState || !apiOptions.enabled) return requestBody;

                        // 双重判断：新对话条件
                        const isNewConversation = requestBody?.conversation_id === "0" ||
                            !requestBody?.section_id;

                        // 检查是否包含刷新人设标记
                        const hasRefreshMarker = requestBody?.messages?.some(msg => {
                            try {
                                const contentObj = JSON.parse(msg.content);
                                return contentObj.text && contentObj.text.includes("{{刷新人设}}");
                            } catch (e) {
                                return false;
                            }
                        });

                        // 如果是新对话或包含刷新人设标记，则处理 Prompt
                        if (isNewConversation || hasRefreshMarker) {
                            let newMessages = [];

                            for (let messageItem of requestBody?.messages) {
                                try {
                                    const contentObj = JSON.parse(messageItem.content);
                                    if (contentObj?.text) {
                                        const newText = await formatPrompt(
                                            contentObj.text.replace(/{{刷新人设}}/g, '这是我最新的信息，请你先忘记之前关于我的信息，然后以这份信息为准。\n\n'),
                                            infos
                                        );

                                        newMessages.push({
                                            ...messageItem,
                                            content: JSON.stringify({
                                                ...contentObj,
                                                text: newText
                                            })
                                        });
                                    } else {
                                        newMessages.push(messageItem);
                                    }
                                } catch (e) {
                                    // JSON解析失败，保持原样
                                    newMessages.push(messageItem);
                                }
                            }

                            return {
                                ...requestBody,
                                messages: newMessages
                            };
                        }

                        return requestBody;
                    },
                    grok:  async (requestBody, apiOptions, globalEnableState, infos, headers, url) => { 
                        if (!globalEnableState || !apiOptions.enabled) return requestBody;
                        
                        if (url?.includes('/new') || requestBody?.message?.includes("{{刷新人设}}")) {
                            try {
                                const newBody = {...requestBody}
                                const newPrompt = await formatPrompt(
                                    newBody.message.replace(/{{刷新人设}}/g, '这是我最新的信息，请你先忘记之前关于我的信息，然后以这份信息为准。\n\n'),
                                    infos,
                                    true
                                );
                                newBody.message = newPrompt;
                                return newBody;
                            } catch (e) {
                                return requestBody;
                            }
                        }
                        return requestBody;
                    },
                }
                return await injectList[apiOptions.name](requestBody, apiOptions, globalEnableState, userInfos, headers, url);
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
                // 判断是基于正在处理的当前的接口是否包含json文件中预设的接口，所以填写配置时可以适当简写。
                if (!baseAPI || !currentAPI) return false;
                if (typeof baseAPI === 'string') {
                    return currentAPI.includes(baseAPI);
                }
                console.log('baseAPI', baseAPI)
                console.log('currentAPI', currentAPI)
                if (Array.isArray(baseAPI)) {
                    return baseAPI.some(item => item.includes(currentAPI))
                }
                return false
            }

            // 托管xhr请求
            const xhrHandler = (config, handler) => {
                
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

                        inject(currentBody, apiOptions, globalEnableState, userInfos, config?.headers, config?.url)
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
            const fetchHandler = async (config, url) => {
                if (!checkChatAPI(firstApiOption.api, url) ) {
                    return config;
                }
                const {apiList, userInfos, globalEnableState} = await getAllData();
                let newConfig = { ...config };
                const currentHostname = window.location.hostname;
                const apiOptions = apiList.find(item => item.hostname === currentHostname);
                const currentBody = JSON.parse(config.body || '{}');
                const newBody = await inject(currentBody, apiOptions, globalEnableState, userInfos, config?.headers, url)
                newConfig.body = JSON.stringify(newBody);
                return newConfig;
            }

            hookFetch({
                optionsHook: fetchHandler
            })

            ah.proxy({
                onRequest: xhrHandler
            })
        },
        world: 'MAIN',
        args: [apiMatch]
    });   

})