document.addEventListener('DOMContentLoaded', async () => {
    // --- 全局状态管理 ---
    const state = {
        allPersonas: [],
        activePersonaId: null,
    };

    // --- 灵感中心数据 ---
    const recommendationsURL = await chrome.runtime.getURL('options/recommendations.json');
    const recommendations = await fetch(recommendationsURL).then(res => res.json());

    // --- DOM 元素引用 ---
    const elements = {
        personaList: document.getElementById('personaList'),
        addPersonaButton: document.getElementById('addPersonaButton'),
        currentPersonaName: document.getElementById('currentPersonaName'),
        tabNav: document.querySelector('.tab-nav'),
        tabSlider: document.querySelector('.tab-slider'),
        inputModal: document.getElementById('inputModal'),
        inputModalTitle: document.querySelector('#inputModal .modal-title'),
        modalInput: document.getElementById('modalInput'),
        modalSaveButton: document.getElementById('modalSaveButton'),
        modalCancelButton: document.getElementById('modalCancelButton'),
        confirmModal: document.getElementById('confirmModal'),
        confirmModalIcon: document.querySelector('#confirmModal .modal-icon'),
        confirmModalTitle: document.querySelector('#confirmModal .modal-title'),
        confirmModalBody: document.querySelector('#confirmModal .modal-body'),
        confirmOkButton: document.getElementById('confirmOkButton'),
        confirmCancelButton: document.getElementById('confirmCancelButton'),
        recommendModal: document.getElementById('recommendModal'),
        recommendModalContent: document.querySelector('#recommendModal .modal-content'),
        recommendModalTitle: document.getElementById('recommendModalTitle'),
        recommendModalBody: document.getElementById('recommendModalBody'),
        recommendModalActions: document.getElementById('recommendModalActions'),
        refreshPrompt: document.getElementById('refresh-prompt'),
        promptTooltip: document.getElementById('promptTooltip'),
    };
    
    const sections = {
        info: { listEl: document.getElementById('infoList'), title: '个人信息' },
        responseFormat: { listEl: document.getElementById('responseFormatList'), title: '输出规范' },
        memory: { listEl: document.getElementById('memoryList'), title: '用户记忆' }
    };
    
    let inputModalContext = { type: null };
    let confirmCallback = null;
    let tooltipHideTimer = null;

    // --- 工具 & 存储 ---
    function toast(content, duration = 3000) {
        const toastEl = document.createElement('div');
        toastEl.textContent = content;
        toastEl.className = 'toast';
        document.body.appendChild(toastEl);
        setTimeout(() => toastEl.remove(), duration);
    }

    function showConfirm({ title, body, icon = '❓', okText = '确认', okClass = 'danger' }) {
        elements.confirmModalTitle.textContent = title;
        elements.confirmModalBody.innerHTML = body;
        elements.confirmModalIcon.textContent = icon;
        elements.confirmOkButton.textContent = okText;
        elements.confirmOkButton.className = `button ${okClass}`;
        elements.confirmModal.style.display = 'flex';
        return new Promise(resolve => {
            confirmCallback = resolve;
        });
    }

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
    
    // --- 渲染逻辑 ---
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
            if (state.allPersonas.length > 1) {
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
        deleteButton.onclick = () => handleDeleteItem(type, index);
        li.appendChild(deleteButton);
        return li;
    }

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
            placeholder.textContent = '暂无内容，快去添加或从“灵感中心”获取吧！';
            placeholder.style.cssText = 'text-align:center; color:var(--text-color-muted); padding:20px 0;';
            listEl.appendChild(placeholder);
        }
    }

    // --- 交互与业务逻辑 ---
    function handleTabClick(e) {
        const clickedTab = e.target.closest('.tab-button');
        if (!clickedTab || clickedTab.classList.contains('active')) return;
        elements.tabNav.querySelector('.active').classList.remove('active');
        clickedTab.classList.add('active');
        document.querySelector('.tab-pane.active').classList.remove('active');
        document.getElementById(clickedTab.dataset.tab).classList.add('active');
        elements.tabSlider.style.left = `${clickedTab.offsetLeft}px`;
        elements.tabSlider.style.width = `${clickedTab.offsetWidth}px`;
        renderActiveTabContent();
    }
    
    function updateRightPanel() {
        const activePersona = state.allPersonas.find(p => p.id === state.activePersonaId);
        elements.currentPersonaName.textContent = activePersona ? `正在编辑: ${activePersona.name}` : '请选择或创建人设';
        const firstTab = elements.tabNav.querySelector('.tab-button');
        if (!firstTab.classList.contains('active')) {
             handleTabClick({ target: firstTab });
        } else {
            elements.tabSlider.style.left = `${firstTab.offsetLeft}px`;
            elements.tabSlider.style.width = `${firstTab.offsetWidth}px`;
            renderActiveTabContent();
        }
    }
    
    async function switchActivePersona(id) {
        if (id === state.activePersonaId) return;
        state.activePersonaId = id;
        renderPersonaList();
        updateRightPanel();
    }
    
    async function handleAddPersona() {
        const name = prompt('请输入新人设的名称：', `新人设 ${state.allPersonas.length + 1}`);
        if (name && name.trim()) {
            const newPersonaMeta = { id: `p_${Date.now()}`, name: name.trim(), isActive: false };
            state.allPersonas.push(newPersonaMeta);
            await storage.saveManifest({
                personas: state.allPersonas,
                activePersonaId: state.activePersonaId
            });
            renderPersonaList();
            toast(`已创建人设: ${name.trim()}`);
        }
    }

    async function handleRenamePersona(id) {
        const persona = state.allPersonas.find(p => p.id === id);
        if (!persona) return;
        const newName = prompt('请输入新的名称：', persona.name);
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
            state.allPersonas = state.allPersonas.filter(p => p.id !== id);
            if (state.activePersonaId === id) {
                state.activePersonaId = state.allPersonas[0].id;
                state.allPersonas[0].isActive = true;
            }
            await storage.saveManifest({ personas: state.allPersonas, activePersonaId: state.activePersonaId });
            await storage.removePersonaData(id);
            renderPersonaList();
            updateRightPanel();
            toast(`已删除人设: ${persona.name}`);
        }
    }

    function openInputModal(type) {
        inputModalContext = { type };
        elements.inputModalTitle.textContent = `添加/批量导入${sections[type].title}`;
        elements.modalInput.value = '';
        elements.modalInput.placeholder = `可输入单条新内容，也可直接粘贴通过“批量复制/导出”功能获取的内容...`;
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
        let itemsAdded = 0;
        try {
            const parsedData = JSON.parse(text);
            if (Array.isArray(parsedData)) {
                const newData = parsedData.filter(item => typeof item === 'string' && item.trim() !== '' && !items.includes(item.trim()));
                items.push(...newData);
                itemsAdded = newData.length;
            } else if (typeof parsedData === 'string' && parsedData.trim() !== '') {
                if (!items.includes(parsedData.trim())) {
                    items.push(parsedData.trim());
                    itemsAdded = 1;
                }
            }
        } catch (e) {
            if (!items.includes(text)) {
                items.push(text);
                itemsAdded = 1;
            }
        }
        if (itemsAdded > 0) {
            await storage.saveData(state.activePersonaId, type, items);
            toast(`成功添加 ${itemsAdded} 项！`);
        } else {
            toast('未添加任何新内容（可能已存在）。');
        }
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
    
    function copyToClipboard(text) {
        return navigator.clipboard.writeText(text);
    }

    async function handleCopyItems(itemType) {
        const activePersonaId = state.activePersonaId;
        const items = await storage.getData(activePersonaId, itemType);
        if (items.length === 0) {
            toast('当前类别下没有内容可复制。');
            return;
        }
        copyToClipboard(JSON.stringify(items, null, 2))
            .then(() => toast('已复制！可在“添加/批量导入”中粘贴'))
            .catch(() => toast('复制失败!'));
    }

    function closeInputModal() { elements.inputModal.style.display = 'none'; }
    function closeConfirmModal() { elements.confirmModal.style.display = 'none'; }
    
    // --- 灵感中心 & Tooltip 逻辑 ---
    function showTooltip(template, triggerElement) {
        clearTimeout(tooltipHideTimer);
        const tooltip = elements.promptTooltip;
    
        const promptList = document.createElement('ul');
        template.prompts.forEach(promptText => {
            const promptLi = document.createElement('li');
            promptLi.textContent = promptText;
            promptList.appendChild(promptLi);
        });
        tooltip.innerHTML = '';
        tooltip.appendChild(promptList);
    
        const rect = triggerElement.getBoundingClientRect();
        
        tooltip.style.left = `${rect.right + 10}px`;
        tooltip.style.top = `${rect.top}px`;
        tooltip.classList.add('visible');

        const tooltipRect = tooltip.getBoundingClientRect();
        let left = rect.right + 10;
        let top = rect.top;

        if (left + tooltipRect.width > window.innerWidth) {
            left = rect.left - tooltipRect.width - 10;
        }
        if (top + tooltipRect.height > window.innerHeight) {
            top = window.innerHeight - tooltipRect.height - 10;
        }
        if (top < 0) {
            top = 10;
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    function hideTooltip() {
        elements.promptTooltip.classList.remove('visible');
    }

    function renderStyleTemplateList() {
        elements.recommendModalTitle.textContent = '输出规范 - 风格模板中心';
        elements.recommendModalContent.classList.remove('template-detail-view');
        
        // MODIFICATION: START
        elements.recommendModalContent.querySelector('.modal-description')?.remove();
        const description = document.createElement('p');
        description.className = 'modal-description';
        description.textContent = '选择一个风格模板，预览并应用到当前人设的输出规范中。';
        elements.recommendModalTitle.parentElement.insertAdjacentElement('afterend', description);
        // MODIFICATION: END
        
        const list = document.createElement('ul');
        list.className = 'style-template-list';

        recommendations.responseFormat.forEach(template => {
            const li = document.createElement('li');
            li.className = 'style-template-item';
            li.onclick = () => renderStyleTemplateDetail(template);

            li.innerHTML = `
                <div class="style-template-name">${template.name}</div>
                <p class="style-template-desc">${template.description}</p>
            `;
            
            li.addEventListener('mouseenter', () => showTooltip(template, li));
            li.addEventListener('mouseleave', () => {
                tooltipHideTimer = setTimeout(hideTooltip, 200);
            });
            list.appendChild(li);
        });

        elements.recommendModalBody.innerHTML = '';
        elements.recommendModalBody.appendChild(list);

        const closeButton = document.createElement('button');
        closeButton.className = 'button secondary';
        closeButton.textContent = '关闭';
        closeButton.onclick = closeRecommendModal;
        elements.recommendModalActions.innerHTML = '';
        elements.recommendModalActions.appendChild(closeButton);
    }
    
    function openRecommendModal(type) {
        if (type === 'responseFormat') {
            openStyleTemplateModal();
        } else {
            openSimpleRecommendModal(type);
        }
    }

    function openSimpleRecommendModal(type) {
        const recommendItems = recommendations[type] || [];
        elements.recommendModalTitle.textContent = `${sections[type].title} - 灵感中心`;
        elements.recommendModalContent.classList.remove('template-detail-view');

        // MODIFICATION: START
        elements.recommendModalContent.querySelector('.modal-description')?.remove();
        const description = document.createElement('p');
        description.className = 'modal-description';
        description.textContent = '点击下方的任意一项，即可快速添加到当前人设中。';
        elements.recommendModalTitle.parentElement.insertAdjacentElement('afterend', description);
        // MODIFICATION: END

        const list = document.createElement('ul');
        list.className = 'recommend-item-list';
        recommendItems.forEach(text => {
            const li = document.createElement('li');
            li.textContent = text;
            li.onclick = () => handleAddSimpleRecommendation(type, text);
            list.appendChild(li);
        });
        elements.recommendModalBody.innerHTML = '';
        elements.recommendModalBody.appendChild(list);
        const closeButton = document.createElement('button');
        closeButton.className = 'button secondary';
        closeButton.textContent = '关闭';
        closeButton.onclick = closeRecommendModal;
        elements.recommendModalActions.innerHTML = '';
        elements.recommendModalActions.appendChild(closeButton);
        elements.recommendModal.style.display = 'flex';
    }

    async function handleAddSimpleRecommendation(type, text) {
        if (!state.activePersonaId) return;
        const items = await storage.getData(state.activePersonaId, type);
        if (items.includes(text)) {
            toast("该项已存在！");
            return;
        }
        items.push(text);
        await storage.saveData(state.activePersonaId, type, items);
        toast("灵感已添加！");
        renderActiveTabContent();
        closeRecommendModal();
    }

    function openStyleTemplateModal() {
        renderStyleTemplateList();
        elements.recommendModal.style.display = 'flex';
    }

    function renderStyleTemplateDetail(template) {
        elements.recommendModalTitle.textContent = `应用风格: ${template.name}`;
        elements.recommendModalContent.classList.add('template-detail-view');
        
        // MODIFICATION: START
        elements.recommendModalContent.querySelector('.modal-description')?.remove();
        const description = document.createElement('p');
        description.className = 'modal-description';
        description.textContent = '预览下方的规范，并选择“追加”或“覆盖”应用到当前人设。';
        elements.recommendModalTitle.parentElement.insertAdjacentElement('afterend', description);
        // MODIFICATION: END
        
        const previewList = document.createElement('ul');
        previewList.className = 'template-detail-preview-list';
        template.prompts.forEach(promptText => {
            const li = document.createElement('li');
            li.textContent = promptText;
            previewList.appendChild(li);
        });
        elements.recommendModalBody.innerHTML = '';
        elements.recommendModalBody.appendChild(previewList);
        elements.recommendModalActions.innerHTML = '';
        const backButton = document.createElement('button');
        backButton.className = 'button secondary';
        backButton.textContent = '返回列表';
        backButton.onclick = renderStyleTemplateList;
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'button-group';
        const appendButton = document.createElement('button');
        appendButton.className = 'button secondary';
        appendButton.textContent = '追加应用';
        appendButton.onclick = () => handleApplyStyle(template, 'append');
        const overwriteButton = document.createElement('button');
        overwriteButton.className = 'button primary';
        overwriteButton.textContent = '覆盖应用';
        overwriteButton.onclick = () => handleApplyStyle(template, 'overwrite');
        buttonGroup.appendChild(appendButton);
        buttonGroup.appendChild(overwriteButton);
        elements.recommendModalActions.appendChild(backButton);
        elements.recommendModalActions.appendChild(buttonGroup);
    }
    
    async function handleApplyStyle(template, mode) {
        const type = 'responseFormat';
        const currentItems = await storage.getData(state.activePersonaId, type);
        let finalItems = [];
        let changedCount = 0;
        if (mode === 'overwrite') {
            finalItems = [...template.prompts];
            changedCount = finalItems.length;
            toast(`已应用「${template.name}」并覆盖原有设置！`);
        } else {
            finalItems = [...currentItems];
            template.prompts.forEach(prompt => {
                if (!finalItems.includes(prompt)) {
                    finalItems.push(prompt);
                    changedCount++;
                }
            });
            if (changedCount > 0) {
                toast(`已追加 ${changedCount} 条新规范到当前人设！`);
            } else {
                toast('所有规范均已存在，未作更改。');
            }
        }
        await storage.saveData(state.activePersonaId, type, finalItems);
        renderActiveTabContent();
        closeRecommendModal();
    }

    function closeRecommendModal() {
        elements.recommendModal.style.display = 'none';
        hideTooltip();
    }

    // --- 初始化 & 事件绑定 ---
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
        document.querySelectorAll('.recommend-button').forEach(btn => {
            btn.addEventListener('click', () => openRecommendModal(btn.dataset.type));
        });
        document.querySelectorAll('.copy-button').forEach(btn => {
            btn.addEventListener('click', () => handleCopyItems(btn.dataset.type));
        });
        document.querySelectorAll('.add-button').forEach(btn => {
            btn.addEventListener('click', () => openInputModal(btn.dataset.type));
        });
        elements.modalSaveButton.addEventListener('click', handleSaveItem);
        elements.modalCancelButton.addEventListener('click', closeInputModal);
        window.addEventListener('click', e => e.target === elements.inputModal && closeInputModal());
        elements.confirmOkButton.addEventListener('click', () => { if (confirmCallback) confirmCallback(true); closeConfirmModal(); });
        elements.confirmCancelButton.addEventListener('click', () => { if (confirmCallback) confirmCallback(false); closeConfirmModal(); });
        window.addEventListener('click', e => e.target === elements.confirmModal && closeConfirmModal());
        window.addEventListener('click', e => e.target === elements.recommendModal && closeRecommendModal());
        window.addEventListener('keydown', e => { if (e.key === 'Escape') { closeInputModal(); closeConfirmModal(); closeRecommendModal(); } });
        elements.refreshPrompt.onclick = () => { copyToClipboard("{{刷新人设}}").then(() => toast('复制成功！')).catch(() => toast('复制失败！')); };

        elements.promptTooltip.addEventListener('mouseenter', () => {
            clearTimeout(tooltipHideTimer);
        });
        elements.promptTooltip.addEventListener('mouseleave', () => {
            tooltipHideTimer = setTimeout(hideTooltip, 200);
        });
    }
    
    initialize();
    bindEvents();
});