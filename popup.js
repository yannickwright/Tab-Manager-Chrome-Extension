// Popup script for Tab Manager

async function updateHighlightedCount() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });
    // Filter out the popup itself and only count non-active highlighted tabs
    const highlightedTabs = tabs.filter(tab => !tab.url.includes(chrome.runtime.getURL('')));
    const count = highlightedTabs.length;
    
    const countElement = document.getElementById('highlightCount');
    const saveBtn = document.getElementById('saveHighlighted');
    const infoMessage = document.getElementById('infoMessage');
    
    countElement.textContent = count;
    
    if (count === 0) {
      saveBtn.style.opacity = '0.5';
      saveBtn.style.cursor = 'not-allowed';
      infoMessage.innerHTML = '💡 Highlight tabs (Ctrl/Cmd + Click) then click "Save Highlighted Tabs"';
    } else {
      saveBtn.style.opacity = '1';
      saveBtn.style.cursor = 'pointer';
      infoMessage.innerHTML = `✨ ${count} tab${count > 1 ? 's' : ''} highlighted and ready to save`;
      infoMessage.style.borderLeftColor = '#10b981';
    }
  } catch (error) {
    console.error('Error counting highlighted tabs:', error);
  }
}

// Open the Tab Manager app
document.getElementById('openApp').addEventListener('click', async () => {
  await chrome.tabs.create({
    url: chrome.runtime.getURL('index.html')
  });
  window.close();
});

// Save highlighted tabs
document.getElementById('saveHighlighted').addEventListener('click', async () => {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });
    
    // Filter out the popup and extension pages
    const highlightedTabs = tabs.filter(tab => 
      !tab.url.includes(chrome.runtime.getURL('')) &&
      !tab.url.startsWith('chrome://')
    );
    
    if (highlightedTabs.length === 0) {
      alert('No tabs highlighted! Highlight tabs by holding Ctrl/Cmd and clicking them.');
      return;
    }

    // Create a new session with highlighted tabs
    const session = {
      id: Date.now(),
      name: 'add name',
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      tabs: highlightedTabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl
      })),
      collapsed: false
    };

    // Load existing sessions
    const result = await chrome.storage.local.get(['sessions']);
    const sessions = result.sessions || [];
    
    // Add new session to the beginning
    sessions.unshift(session);
    
    // Save updated sessions
    await chrome.storage.local.set({ sessions });

    // Close the highlighted tabs
    const tabIds = highlightedTabs.map(tab => tab.id);
    await chrome.tabs.remove(tabIds);

    // Show success message
    const saveBtn = document.getElementById('saveHighlighted');
    const originalHTML = saveBtn.innerHTML;
    saveBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <path d="M3 8l3 3 7-7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="btn-text">
        <div>Saved! ✓</div>
        <div class="btn-desc">${highlightedTabs.length} tab${highlightedTabs.length > 1 ? 's' : ''} saved and closed</div>
      </div>
    `;
    saveBtn.style.background = '#10b981';
    saveBtn.style.borderColor = '#10b981';

    // Close popup after a short delay
    setTimeout(() => {
      window.close();
    }, 1000);

  } catch (error) {
    console.error('Error saving highlighted tabs:', error);
    alert('Error saving tabs. Please try again.');
  }
});

// Update count when popup opens
updateHighlightedCount();

// Update count every 500ms to reflect changes
setInterval(updateHighlightedCount, 500);

