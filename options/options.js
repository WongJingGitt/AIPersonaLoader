function toast(content, duration = 3000) {
    const toastEl = document.createElement('div');
    toastEl.textContent = content;
    toastEl.style.position = 'fixed';
    toastEl.style.top = '20px';
    toastEl.style.left = '50%';
    toastEl.style.transform = 'translateX(-50%)';
    toastEl.style.padding = '10px 20px';
    toastEl.style.background = 'rgba(0,0,0,0.7)';
    toastEl.style.color = 'white';
    toastEl.style.borderRadius = '4px';
    toastEl.style.zIndex = '1000';
    
    document.body.appendChild(toastEl);
    
    setTimeout(() => {
      toastEl.remove();
    }, duration);
  }

document.addEventListener('DOMContentLoaded', () => {
    // 定义存储键名和对应的 UI 元素 ID
    const sections = {
        info: {
            listId: 'infoList',
            storageKey: 'userInfo_info', // 对应之前 mockInfo.info
            title: '个人信息'
        },
        responseFormat: {
            listId: 'responseFormatList',
            storageKey: 'userInfo_responseFormat', // 对应之前 mockInfo.responseFormat
            title: '输出规范'
        },
        memory: {
            listId: 'memoryList',
            storageKey: 'userInfo_memory', // 对应之前 mockInfo.memory
            title: '用户记忆'
        }
    };

    // 模态框相关元素
    const modal = document.getElementById('addItemModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalInput = document.getElementById('modalInput');
    const modalSaveButton = document.getElementById('modalSaveButton');
    const modalCancelButton = document.getElementById('modalCancelButton');
    const closeModalButton = modal.querySelector('.close-button');
    const refreshPrompt = document.getElementById('refresh-prompt');
    let currentDataType = null; // 用于保存当前正在操作的数据类型

    refreshPrompt.onclick = () => {
        try {
            window.navigator.clipboard.writeText("{{刷新人设}}");
            toast('已复制文案!')
        } catch (e) {
            toast('复制失败!请手动输入文案!')
        }
    }


    // 加载并显示所有数据
    async function loadAllData() {
        for (const type in sections) {
            await loadAndDisplayList(type);
        }
    }

    // 加载并显示指定类型的列表数据
    async function loadAndDisplayList(type) {
        const { listId, storageKey } = sections[type];
        const listElement = document.getElementById(listId);
        if (!listElement) return;

        listElement.innerHTML = ''; // 清空列表

        try {
            const result = await chrome.storage.local.get(storageKey);
            const items = result[storageKey] || [];
            if (items.length === 0) {
                const placeholderLi = document.createElement('li');
                placeholderLi.textContent = '暂无内容，点击下方按钮添加。';
                placeholderLi.classList.add('placeholder-item'); // 可以为此添加特定样式
                listElement.appendChild(placeholderLi);
            } else {
                items.forEach((itemText, index) => {
                    const li = createListItem(itemText, type, index);
                    listElement.appendChild(li);
                });
            }
        } catch (error) {
            console.error(`Error loading ${type} data:`, error);
            const errorLi = document.createElement('li');
            errorLi.textContent = '加载数据失败，请稍后再试。';
            errorLi.classList.add('error-item');
            listElement.appendChild(errorLi);
        }
    }

    // 创建列表项元素
    function createListItem(text, type, index) {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.textContent = text;
        li.appendChild(span);

        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '🗑️ 删除'; // 删除图标 (垃圾桶)
        deleteButton.classList.add('delete-button');
        deleteButton.title = '删除此项';
        deleteButton.addEventListener('click', () => handleDeleteItem(type, index));
        li.appendChild(deleteButton);

        return li;
    }

    // 处理删除项目
    async function handleDeleteItem(type, indexToDelete) {
        const { storageKey, title } = sections[type];
        if (!confirm(`确定要删除这条“${title}”吗？\n内容: "${(await chrome.storage.local.get(storageKey))[storageKey][indexToDelete].substring(0,50)}..."`)) {
            return;
        }

        try {
            const result = await chrome.storage.local.get(storageKey);
            let items = result[storageKey] || [];
            items.splice(indexToDelete, 1); // 删除指定索引的项
            await chrome.storage.local.set({ [storageKey]: items });
            await loadAndDisplayList(type); // 重新加载并显示列表
        } catch (error) {
            console.error(`Error deleting item from ${type}:`, error);
            alert('删除失败，请稍后再试。');
        }
    }

    // 打开模态框
    function openModal(type) {
        currentDataType = type;
        const { title } = sections[type];
        modalTitle.textContent = `添加新的${title}`;
        modalInput.value = ''; // 清空输入框
        modalInput.placeholder = `请输入新的${title}...`;
        modal.style.display = 'flex'; // 使用 flex 来居中
         setTimeout(() => modalInput.focus(), 50); // 延迟聚焦以确保动画后生效
    }

    // 关闭模态框
    function closeModal() {
        modal.style.display = 'none';
        currentDataType = null;
    }

    // 处理保存新项目
    async function handleSaveItem() {
        if (!currentDataType) return;

        const newItemText = modalInput.value.trim();
        if (!newItemText) {
            alert('内容不能为空！');
            modalInput.focus();
            return;
        }

        const { storageKey } = sections[currentDataType];
        try {
            const result = await chrome.storage.local.get(storageKey);
            let items = result[storageKey] || [];
            items.push(newItemText); // 添加新项目到列表末尾
            await chrome.storage.local.set({ [storageKey]: items });
            await loadAndDisplayList(currentDataType); // 重新加载并显示列表
            closeModal();
        } catch (error) {
            console.error(`Error saving new item to ${currentDataType}:`, error);
            alert('保存失败，请稍后再试。');
        }
    }


    // 事件监听器
    // 1. 为所有 "添加" 按钮绑定打开模态框的事件
    document.querySelectorAll('.add-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const type = event.target.closest('button').dataset.type;
            if (type && sections[type]) {
                openModal(type);
            }
        });
    });

    // 2. 模态框按钮事件
    modalSaveButton.addEventListener('click', handleSaveItem);
    modalCancelButton.addEventListener('click', closeModal);
    closeModalButton.addEventListener('click', closeModal);

    // 3. 点击模态框外部关闭
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    // 4. Esc 键关闭模态框
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.style.display === 'flex') {
            closeModal();
        }
    });

    // 初始化：加载所有数据
    loadAllData();
});