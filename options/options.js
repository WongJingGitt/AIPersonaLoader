document.addEventListener('DOMContentLoaded', () => {
    // --- 全局状态管理 ---
    const state = {
        allPersonas: [], // 只存储人设的元数据 {id, name, isActive}
        activePersonaId: null,
    };

    // --- DOM 元素引用 ---
    const elements = {
        personaList: document.getElementById('personaList'),
        addPersonaButton: document.getElementById('addPersonaButton'),
        currentPersonaName: document.getElementById('currentPersonaName'),
        tabNav: document.querySelector('.tab-nav'),
        tabSlider: document.querySelector('.tab-slider'),
        // 输入模态框
        inputModal: document.getElementById('inputModal'),
        inputModalTitle: document.querySelector('#inputModal .modal-title'),
        modalInput: document.getElementById('modalInput'),
        modalSaveButton: document.getElementById('modalSaveButton'),
        modalCancelButton: document.getElementById('modalCancelButton'),
        // 确认模态框
        confirmModal: document.getElementById('confirmModal'),
        confirmModalIcon: document.querySelector('#confirmModal .modal-icon'),
        confirmModalTitle: document.querySelector('#confirmModal .modal-title'),
        confirmModalBody: document.querySelector('#confirmModal .modal-body'),
        confirmOkButton: document.getElementById('confirmOkButton'),
        confirmCancelButton: document.getElementById('confirmCancelButton'),
        refreshPrompt: document.getElementById('refresh-prompt'),
    };

    const sections = {
        info: { listEl: document.getElementById('infoList'), title: '个人信息' },
        responseFormat: { listEl: document.getElementById('responseFormatList'), title: '输出规范' },
        memory: { listEl: document.getElementById('memoryList'), title: '用户记忆' }
    };
    
    let inputModalContext = { type: null }; // 用于输入模态框
    let confirmCallback = null; // 用于确认模态框的回调

    // --- Toast & Custom Confirm ---
    function toast(content, duration = 3000) {
        const toastEl = document.createElement('div');
        toastEl.textContent = content;
        toastEl.className = 'toast';
        document.body.appendChild(toastEl);
        setTimeout(() => toastEl.remove(), duration);
    }
    function showConfirm({ title, body, icon = '❓', okText = '确认', okClass = 'danger' }) {
        elements.confirmModalTitle.textContent = title;
        elements.confirmModalBody.innerHTML = body; // 使用 innerHTML 以支持格式化
        elements.confirmModalIcon.textContent = icon;
        elements.confirmOkButton.textContent = okText;
        elements.confirmOkButton.className = `button ${okClass}`;
        elements.confirmModal.style.display = 'flex';
        return new Promise(resolve => {
            confirmCallback = resolve;
        });
    }

    // --- 彻底解耦的数据存储层 ---
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
        async getData(personaId, type) {
            const key = this.personaKey(personaId, type);
            const result = await chrome.storage.local.get(key);
            return result[key] || [];
        },
        async saveData(personaId, type, data) {
            const key = this.personaKey(personaId, type);
            await chrome.storage.local.set({ [key]: data });
        },
        async removePersonaData(personaId) {
            const keysToRemove = Object.keys(sections).map(type => this.personaKey(personaId, type));
            await chrome.storage.local.remove(keysToRemove);
        }
    };
    
    // --- 核心渲染逻辑 ---
    function renderPersonaList() {
        elements.personaList.innerHTML = '';
        if (state.allPersonas.length === 0) return;
    
        state.allPersonas.forEach(persona => {
            const li = document.createElement('li');
            li.dataset.id = persona.id;
            li.className = persona.id === state.activePersonaId ? 'active' : '';
    
            const nameSpan = document.createElement('span');
            nameSpan.textContent = persona.name;
            li.appendChild(nameSpan);
    
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'persona-actions';
    
            const renameBtn = document.createElement('button');
            renameBtn.innerHTML = '✏️';
            renameBtn.title = '重命名';
            renameBtn.className = 'persona-action-btn';
            renameBtn.onclick = (e) => { e.stopPropagation(); handleRenamePersona(persona.id); };
    
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = '删除';
            deleteBtn.className = 'persona-action-btn';
            deleteBtn.onclick = (e) => { e.stopPropagation(); handleDeletePersona(persona.id); };
    
            actionsDiv.appendChild(renameBtn);
            if (state.allPersonas.length > 1) { // 至少保留一个人设
                actionsDiv.appendChild(deleteBtn);
            }
            li.appendChild(actionsDiv);
    
            li.addEventListener('click', () => switchActivePersona(persona.id));
            elements.personaList.appendChild(li);
        });
    }
    function createListItem(text, type, index) {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.className = 'item-text';
        span.textContent = text;
        li.appendChild(span);
        
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '🗑️';
        deleteButton.classList.add('delete-button');
        deleteButton.title = '删除此项';
        // 注意：这里需要确保 handleDeleteItem 在全局可访问或通过事件委托处理
        // 在我提供的最终代码中，事件委托是更好的方式，但直接绑定也能工作
        deleteButton.onclick = () => handleDeleteItem(type, index);
        li.appendChild(deleteButton);
    
        return li;
    }

    // 更新：渲染当前激活 Tab 的内容
    async function renderActiveTabContent() {
        if (!state.activePersonaId) return;
        
        const activeTabType = document.querySelector('.tab-button.active').dataset.tab;
        const { listEl } = sections[activeTabType];
        
        const items = await storage.getData(state.activePersonaId, activeTabType);

        listEl.innerHTML = '';
        if (items.length > 0) {
            items.forEach((text, index) => {
                listEl.appendChild(createListItem(text, activeTabType, index));
            });
        } else {
            const placeholder = document.createElement('div');
            placeholder.textContent = '暂无内容';
            placeholder.style.cssText = 'text-align:center; color:var(--text-color-muted); padding:20px 0;';
            listEl.appendChild(placeholder);
        }
    }
    
    // --- 交互与业务逻辑 ---
    
    // Tab 切换
    function handleTabClick(e) {
        const clickedTab = e.target.closest('.tab-button');
        if (!clickedTab || clickedTab.classList.contains('active')) return;
        
        // 更新按钮和内容区的 active 状态
        elements.tabNav.querySelector('.active').classList.remove('active');
        clickedTab.classList.add('active');
        document.querySelector('.tab-pane.active').classList.remove('active');
        document.getElementById(clickedTab.dataset.tab).classList.add('active');
        
        // 更新滑块位置和宽度
        elements.tabSlider.style.left = `${clickedTab.offsetLeft}px`;
        elements.tabSlider.style.width = `${clickedTab.offsetWidth}px`;

        renderActiveTabContent();
    }
    
    // 初始化或切换人设后，更新整个右侧面板
    function updateRightPanel() {
        const activePersona = state.allPersonas.find(p => p.id === state.activePersonaId);
        elements.currentPersonaName.textContent = activePersona ? `正在编辑: ${activePersona.name}` : '请选择或创建人设';
        
        const firstTab = elements.tabNav.querySelector('.tab-button');
        if (!firstTab.classList.contains('active')) {
             handleTabClick({ target: firstTab });
        } else {
            // 如果已在第一个 Tab，强制重绘滑块并加载数据
            elements.tabSlider.style.left = `${firstTab.offsetLeft}px`;
            elements.tabSlider.style.width = `${firstTab.offsetWidth}px`;
            renderActiveTabContent();
        }
    }

    async function switchActivePersona(id) {
        if (id === state.activePersonaId) return;
        state.activePersonaId = id;
        
        // 更新本地 state 和 manifest 存储
        state.allPersonas.forEach(p => p.isActive = p.id === id);
        await storage.saveManifest({ personas: state.allPersonas, activePersonaId: id });
        
        renderPersonaList();
        updateRightPanel();
    }
    
    async function handleAddPersona() {
        const name = prompt('请输入新人设的名称：', `新人设 ${state.allPersonas.length + 1}`);
        if (name && name.trim()) {
            const newPersonaMeta = {
                id: `p_${Date.now()}`,
                name: name.trim(),
                isActive: false, // 新建的默认不激活
            };
            state.allPersonas.push(newPersonaMeta);
            
            // 保存更新后的人设列表到 manifest
            await storage.saveManifest({
                personas: state.allPersonas,
                activePersonaId: state.activePersonaId
            });
            
            // 新建的人设其数据默认为空，无需额外存储
            
            renderPersonaList();
            toast(`已创建人设: ${name.trim()}`);
        }
    }

    async function handleRenamePersona(id) {
        const persona = state.allPersonas.find(p => p.id === id);
        if (!persona) return;

        const newName = prompt('请输入新的名称：', persona.name); // prompt 用于快速输入，仍可保留
        if (newName && newName.trim() && newName.trim() !== persona.name) {
            persona.name = newName.trim();
            await storage.saveManifest({ personas: state.allPersonas, activePersonaId: state.activePersonaId });
            renderPersonaList();
            updateRightPanel();
        }
    }

    async function handleDeletePersona(id) {
        if (state.allPersonas.length <= 1) {
            toast('必须保留至少一个人设'); return;
        }
        const persona = state.allPersonas.find(p => p.id === id);
        if (!persona) return;

        const confirmed = await showConfirm({
            title: '删除人设',
            body: `确定要永久删除人设 "<strong>${persona.name}</strong>" 吗？<br>此操作无法撤销。`
        });

        if (confirmed) {
            // 从 manifest 和 state 中移除
            state.allPersonas = state.allPersonas.filter(p => p.id !== id);
            
            // 如果删除的是激活项，则激活第一个
            if (state.activePersonaId === id) {
                state.activePersonaId = state.allPersonas[0].id;
                state.allPersonas[0].isActive = true;
            }
            await storage.saveManifest({ personas: state.allPersonas, activePersonaId: state.activePersonaId });
            
            // 删除这个人设的所有相关数据
            await storage.removePersonaData(id);
            
            renderPersonaList();
            updateRightPanel();
            toast(`已删除人设: ${persona.name}`);
        }
    }

    // 更新：打开输入模态框
    function openInputModal(type) {
        inputModalContext = { type };
        elements.inputModalTitle.textContent = `添加新的${sections[type].title}`;
        elements.modalInput.value = '';
        elements.modalInput.placeholder = `请输入新的${sections[type].title}...`;
        elements.inputModal.style.display = 'flex';
        setTimeout(() => elements.modalInput.focus(), 50);
    }
    
    async function handleSaveItem() {
        const { type } = inputModalContext;
        if (!type || !state.activePersonaId) return;
        
        const text = elements.modalInput.value.trim();
        if (!text) {
            toast("内容不能为空！"); return;
        }

        const items = await storage.getData(state.activePersonaId, type);
        items.push(text);
        await storage.saveData(state.activePersonaId, type, items);
        
        renderActiveTabContent();
        closeInputModal();
    }
    
    async function handleDeleteItem(type, index) {
        const items = await storage.getData(state.activePersonaId, type);
        const itemText = items[index];

        const confirmed = await showConfirm({
            title: `删除${sections[type].title}`,
            body: `确定要删除以下内容吗？<div class="modal-body-left-align">${itemText}</div>`
        });

        if (confirmed) {
            items.splice(index, 1);
            await storage.saveData(state.activePersonaId, type, items);
            renderActiveTabContent();
        }
    }

    function closeInputModal() { elements.inputModal.style.display = 'none'; }
    function closeConfirmModal() { elements.confirmModal.style.display = 'none'; }
    
    // --- 初始化和事件绑定 ---
    async function initialize() {
        let manifest = await storage.getManifest();

        if (manifest.personas.length === 0) {
            const defaultPersonaId = 'default';
            manifest = {
                personas: [{ id: defaultPersonaId, name: '默认人设', isActive: true }],
                activePersonaId: defaultPersonaId,
            };
            await storage.saveManifest(manifest);
            await storage.saveData(defaultPersonaId, 'info', ['我是一位AI爱好者，喜欢探索新科技。']);
            await storage.saveData(defaultPersonaId, 'responseFormat', ['请用简洁、专业的风格回答。']);
            await storage.saveData(defaultPersonaId, 'memory', ['我的宠物猫叫“南瓜”。']);
        }

        state.allPersonas = manifest.personas;
        state.activePersonaId = manifest.activePersonaId;
        
        renderPersonaList();
        updateRightPanel();
    }

    function bindEvents() {
        elements.addPersonaButton.addEventListener('click', handleAddPersona);
        elements.tabNav.addEventListener('click', handleTabClick);
        
        document.querySelectorAll('.add-button').forEach(btn => {
            btn.addEventListener('click', () => openInputModal(btn.dataset.type));
        });

        // 输入模态框事件
        elements.modalSaveButton.addEventListener('click', handleSaveItem);
        elements.modalCancelButton.addEventListener('click', closeInputModal);
        window.addEventListener('click', e => e.target === elements.inputModal && closeInputModal());

        // 确认模态框事件
        elements.confirmOkButton.addEventListener('click', () => {
            if (confirmCallback) confirmCallback(true);
            closeConfirmModal();
        });
        elements.confirmCancelButton.addEventListener('click', () => {
            if (confirmCallback) confirmCallback(false);
            closeConfirmModal();
        });
        window.addEventListener('click', e => e.target === elements.confirmModal && closeConfirmModal());

        window.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                closeInputModal();
                closeConfirmModal();
            }
        });
        
        elements.refreshPrompt.onclick = () => {
            navigator.clipboard.writeText("{{刷新人设}}")
                .then(() => toast('复制成功！'))
                .catch(() => toast('复制失败！'));
        };
    }
    
    initialize();
    bindEvents();
    
    // 将函数挂载到 window，以便在 HTML 中使用（可选，但对于动态生成的按钮事件可能更直接）
    // window.app = { handleDeleteItem }; // 如果 createListItem 中的 onclick 使用全局函数
});