// Popup script for Tab Manager

const RESTRICTED_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "devtools://",
];

function generateId() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeFavicon(favIconUrl) {
  if (!favIconUrl) return null;
  if (favIconUrl.startsWith("data:") || favIconUrl.startsWith("chrome://")) {
    return null;
  }
  return favIconUrl;
}

// Tabs that are still loading or have been discarded by the browser often have
// an empty `url` with the real address in `pendingUrl`.
function resolveUrl(tab) {
  return tab.pendingUrl || tab.url || "";
}

function isSaveableUrl(url) {
  if (!url) return false;
  if (url.startsWith(chrome.runtime.getURL(""))) return false;
  return !RESTRICTED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

// Single source of truth for both the badge count and the save action, so the
// number shown always matches what will actually be stored.
async function getHighlightedTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });
  const saveable = [];
  const skipped = [];

  for (const tab of tabs) {
    const url = resolveUrl(tab);
    if (isSaveableUrl(url)) {
      saveable.push({ ...tab, url });
    } else if (!url.startsWith(chrome.runtime.getURL(""))) {
      skipped.push(tab);
    }
  }

  return { saveable, skipped };
}

function describeSkipped(count) {
  if (count === 0) return "";
  return ` ${count} browser page${count > 1 ? "s" : ""} can't be saved and will be left open.`;
}

async function updateHighlightedCount() {
  try {
    const { saveable, skipped } = await getHighlightedTabs();
    const count = saveable.length;

    const countElement = document.getElementById("highlightCount");
    const saveBtn = document.getElementById("saveHighlighted");
    const infoMessage = document.getElementById("infoMessage");

    countElement.textContent = count;
    saveBtn.disabled = count === 0;

    if (count === 0) {
      infoMessage.textContent =
        'Highlight tabs (Ctrl/Cmd + Click) then click "Save Highlighted Tabs".' +
        describeSkipped(skipped.length);
      infoMessage.classList.remove("ready");
    } else {
      infoMessage.textContent =
        `${count} tab${count > 1 ? "s" : ""} ready to save.` +
        describeSkipped(skipped.length);
      infoMessage.classList.add("ready");
    }
  } catch (error) {
    console.error("Error counting highlighted tabs:", error);
  }
}

// Open the Tab Manager app
document.getElementById("openApp").addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
  window.close();
});

// Save highlighted tabs
document.getElementById("saveHighlighted").addEventListener("click", async () => {
  const saveBtn = document.getElementById("saveHighlighted");
  if (saveBtn.disabled) return;

  try {
    const { saveable, skipped } = await getHighlightedTabs();

    if (saveable.length === 0) {
      updateHighlightedCount();
      return;
    }

    saveBtn.disabled = true;

    const now = Date.now();
    const session = {
      id: now,
      name: "",
      savedAt: now,
      tabs: saveable.map((tab) => ({
        uid: generateId(),
        title: tab.title || "",
        url: tab.url,
        favIconUrl: sanitizeFavicon(tab.favIconUrl),
      })),
      collapsed: false,
    };

    // Storage is written before any tabs are closed so a failure here leaves
    // the user's tabs untouched.
    const result = await chrome.storage.local.get(["sessions"]);
    const sessions = result.sessions || [];
    sessions.unshift(session);
    await chrome.storage.local.set({ sessions });

    await chrome.tabs.remove(saveable.map((tab) => tab.id));

    saveBtn.classList.add("success");
    saveBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <path d="M3 8l3 3 7-7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="btn-text">
        <div>Saved</div>
        <div class="btn-desc">${saveable.length} tab${saveable.length > 1 ? "s" : ""} saved and closed${
          skipped.length ? `, ${skipped.length} skipped` : ""
        }</div>
      </div>
    `;

    setTimeout(() => window.close(), 1000);
  } catch (error) {
    console.error("Error saving highlighted tabs:", error);
    saveBtn.disabled = false;
    const infoMessage = document.getElementById("infoMessage");
    infoMessage.textContent =
      "Couldn't save tabs. Storage may be full or unavailable. Your tabs were not closed.";
    infoMessage.classList.remove("ready");
    infoMessage.classList.add("error");
  }
});

// Keep the count in sync via tab events instead of polling.
chrome.tabs.onHighlighted.addListener(updateHighlightedCount);
chrome.tabs.onActivated.addListener(updateHighlightedCount);
chrome.tabs.onCreated.addListener(updateHighlightedCount);
chrome.tabs.onRemoved.addListener(updateHighlightedCount);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    updateHighlightedCount();
  }
});

updateHighlightedCount();
