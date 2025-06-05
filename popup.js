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

document.addEventListener('DOMContentLoaded', async () => {
    const globalEnableToggle = document.getElementById('globalEnableToggle');
    const siteToggleList = document.getElementById('siteToggleList');
    const siteListSection = document.getElementById('siteListSection');
    const openOptionsButton = document.getElementById('openOptionsButton');

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
});