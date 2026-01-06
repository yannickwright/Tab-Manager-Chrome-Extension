// Tab Manager - Main Logic

class TabManager {
  constructor() {
    this.sessions = [];
    this.currentTab = "home";
    this.selectedTabs = new Set(); // Track selected tabs for bulk operations
    this.currentSearchQuery = ""; // Track current search query
    this.init();
  }

  async init() {
    await this.loadSessions();
    this.setupEventListeners();
    this.render();
  }

  setupEventListeners() {
    // Search
    document.getElementById("searchInput").addEventListener("input", (e) => {
      this.handleSearch(e.target.value);
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("searchInput").focus();
      }
    });

    // Expand/Collapse all
    document.querySelector(".btn-expand").addEventListener("click", () => {
      this.toggleAllSessions();
    });

    // Setup tooltip functionality
    this.setupTooltips();
  }

  setupTooltips() {
    let tooltipTimeout;
    let currentTooltip = null;

    document.addEventListener("mouseover", (e) => {
      const btn = e.target.closest("[data-tooltip]");
      if (btn) {
        tooltipTimeout = setTimeout(() => {
          this.showTooltip(btn);
          currentTooltip = btn;
        }, 1000); // 1 second delay
      }
    });

    document.addEventListener("mouseout", (e) => {
      const btn = e.target.closest("[data-tooltip]");
      if (btn) {
        clearTimeout(tooltipTimeout);
        this.hideTooltip(btn);
        currentTooltip = null;
      }
    });
  }

  showTooltip(element) {
    // Remove any existing tooltip first
    const existingTooltip = document.getElementById("active-tooltip");
    if (existingTooltip) {
      existingTooltip.remove();
    }

    const tooltip = element.getAttribute("data-tooltip");
    const tooltipEl = document.createElement("div");
    tooltipEl.className = "tooltip";
    tooltipEl.textContent = tooltip;
    tooltipEl.id = "active-tooltip";

    document.body.appendChild(tooltipEl);

    const rect = element.getBoundingClientRect();
    const tooltipWidth = tooltipEl.offsetWidth;

    // Calculate left position and ensure it doesn't go off screen
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;

    // Prevent tooltip from going off the left edge
    if (left < 10) {
      left = 10;
    }

    // Prevent tooltip from going off the right edge
    if (left + tooltipWidth > window.innerWidth - 10) {
      left = window.innerWidth - tooltipWidth - 10;
    }

    tooltipEl.style.left = left + "px";
    tooltipEl.style.top = rect.bottom + 8 + "px";
  }

  hideTooltip(element) {
    const tooltip = document.getElementById("active-tooltip");
    if (tooltip) {
      tooltip.remove();
    }
  }

  toggleTabSelection(sessionId, tabId) {
    const key = `${sessionId}-${tabId}`;
    if (this.selectedTabs.has(key)) {
      this.selectedTabs.delete(key);
    } else {
      this.selectedTabs.add(key);
    }
    this.updateBulkActions();
  }

  selectAllInSession(sessionId) {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      // If there's a search query, only select visible (filtered) tabs
      if (this.currentSearchQuery) {
        const filteredTabs = session.tabs.filter(
          (tab) =>
            tab.title.toLowerCase().includes(this.currentSearchQuery) ||
            tab.url.toLowerCase().includes(this.currentSearchQuery)
        );
        filteredTabs.forEach((tab) => {
          this.selectedTabs.add(`${sessionId}-${tab.id}`);
        });
      } else {
        // No search, select all tabs
        session.tabs.forEach((tab) => {
          this.selectedTabs.add(`${sessionId}-${tab.id}`);
        });
      }
      this.render();
    }
  }

  deselectAllInSession(sessionId) {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      // If there's a search query, only deselect visible (filtered) tabs
      if (this.currentSearchQuery) {
        const filteredTabs = session.tabs.filter(
          (tab) =>
            tab.title.toLowerCase().includes(this.currentSearchQuery) ||
            tab.url.toLowerCase().includes(this.currentSearchQuery)
        );
        filteredTabs.forEach((tab) => {
          this.selectedTabs.delete(`${sessionId}-${tab.id}`);
        });
      } else {
        // No search, deselect all tabs
        session.tabs.forEach((tab) => {
          this.selectedTabs.delete(`${sessionId}-${tab.id}`);
        });
      }
      this.render();
    }
  }

  async openSelectedInSession(sessionId) {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      const selectedInSession = session.tabs.filter((tab) =>
        this.selectedTabs.has(`${sessionId}-${tab.id}`)
      );

      for (const tab of selectedInSession) {
        await this.openTab(tab.url);
      }

      // Keep selection after opening - don't clear
      this.updateBulkActions();
    }
  }

  async deleteSelectedInSession(sessionId) {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const selectedInSession = session.tabs.filter((tab) =>
      this.selectedTabs.has(`${sessionId}-${tab.id}`)
    );

    if (selectedInSession.length === 0) return;

    if (
      !confirm(
        `Delete ${selectedInSession.length} selected tab${
          selectedInSession.length > 1 ? "s" : ""
        }?`
      )
    ) {
      return;
    }

    // Delete selected tabs
    for (const tab of selectedInSession) {
      await this.deleteTab(sessionId, tab.id);
      this.selectedTabs.delete(`${sessionId}-${tab.id}`);
    }
  }

  async bulkOpenSelected() {
    const selected = Array.from(this.selectedTabs);
    for (const key of selected) {
      const [sessionId, tabId] = key.split("-").map(Number);
      const session = this.sessions.find((s) => s.id === sessionId);
      if (session) {
        const tab = session.tabs.find((t) => t.id === tabId);
        if (tab) {
          await this.openTab(tab.url);
        }
      }
    }
    this.selectedTabs.clear();
    this.render();
  }

  async bulkDeleteSelected() {
    if (!confirm(`Delete ${this.selectedTabs.size} selected tabs?`)) {
      return;
    }

    const selected = Array.from(this.selectedTabs);
    for (const key of selected) {
      const [sessionId, tabId] = key.split("-").map(Number);
      await this.deleteTab(sessionId, tabId);
    }
    this.selectedTabs.clear();
    this.render();
  }

  updateBulkActions() {
    // This will be called to update UI when selection changes
    this.render();
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.classList.remove("active");
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
    this.render();
  }

  async saveCurrentTabs() {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });

      // Filter out the Tab Manager tab itself
      const filteredTabs = tabs.filter(
        (tab) => !tab.url.includes(chrome.runtime.getURL(""))
      );

      if (filteredTabs.length === 0) {
        alert("No tabs to save!");
        return;
      }

      const session = {
        id: Date.now(),
        name: "add name",
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
        tabs: filteredTabs.map((tab) => ({
          id: tab.id,
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl,
        })),
        collapsed: false,
      };

      this.sessions.unshift(session);
      await this.saveSessions();
      this.render();
    } catch (error) {
      console.error("Error saving tabs:", error);
    }
  }

  async loadSessions() {
    try {
      const result = await chrome.storage.local.get(["sessions"]);
      this.sessions = result.sessions || [];
    } catch (error) {
      console.error("Error loading sessions:", error);
      this.sessions = [];
    }
  }

  async saveSessions() {
    try {
      await chrome.storage.local.set({ sessions: this.sessions });
    } catch (error) {
      console.error("Error saving sessions:", error);
    }
  }

  async deleteSession(sessionId) {
    this.sessions = this.sessions.filter((s) => s.id !== sessionId);
    await this.saveSessions();
    this.render();
  }

  async deleteTab(sessionId, tabId) {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.tabs = session.tabs.filter((t) => t.id !== tabId);
      if (session.tabs.length === 0) {
        await this.deleteSession(sessionId);
      } else {
        await this.saveSessions();
        this.render();
      }
    }
  }

  async toggleSession(sessionId) {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.collapsed = !session.collapsed;
      await this.saveSessions();
      this.render();
    }
  }

  toggleAllSessions() {
    const allCollapsed = this.sessions.every((s) => s.collapsed);
    this.sessions.forEach((s) => (s.collapsed = !allCollapsed));
    this.saveSessions();
    this.render();
  }

  async updateSessionName(sessionId, newName) {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.name = newName;
      await this.saveSessions();
    }
  }

  async openTab(url) {
    try {
      await chrome.tabs.create({ url });
    } catch (error) {
      console.error("Error opening tab:", error);
    }
  }

  async openAllTabs(sessionId) {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      for (const tab of session.tabs) {
        await this.openTab(tab.url);
      }
    }
  }

  getFaviconUrl(url, favIconUrl) {
    if (favIconUrl && !favIconUrl.includes("chrome://")) {
      return favIconUrl;
    }

    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return "";
    }
  }

  getSimplifiedUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace("www.", "") + urlObj.pathname.slice(0, 20);
    } catch {
      return url;
    }
  }

  handleSearch(query) {
    this.currentSearchQuery = query.toLowerCase();

    if (!this.currentSearchQuery) {
      this.render();
      return;
    }

    const filteredSessions = this.sessions
      .map((session) => {
        const filteredTabs = session.tabs.filter(
          (tab) =>
            tab.title.toLowerCase().includes(this.currentSearchQuery) ||
            tab.url.toLowerCase().includes(this.currentSearchQuery)
        );

        if (filteredTabs.length > 0) {
          return { ...session, tabs: filteredTabs, collapsed: false };
        }
        return null;
      })
      .filter(Boolean);

    this.renderSessions(filteredSessions);
  }

  render() {
    // If there's an active search, re-apply it
    if (this.currentSearchQuery) {
      this.handleSearch(this.currentSearchQuery);
    } else {
      this.renderSessions(this.sessions);
    }
  }

  renderSessions(sessions) {
    const mainContent = document.getElementById("mainContent");

    if (sessions.length === 0) {
      mainContent.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor">
            <rect x="8" y="12" width="48" height="40" rx="4" stroke-width="2"/>
            <line x1="8" y1="20" x2="56" y2="20" stroke-width="2"/>
            <circle cx="14" cy="16" r="1.5" fill="currentColor"/>
            <circle cx="19" cy="16" r="1.5" fill="currentColor"/>
            <circle cx="24" cy="16" r="1.5" fill="currentColor"/>
          </svg>
          <h3>No saved tabs yet</h3>
          <p>Click the + button to save your current tabs</p>
        </div>
      `;
      return;
    }

    mainContent.innerHTML = sessions
      .map((session) => this.renderSession(session))
      .join("");

    // Attach event listeners
    sessions.forEach((session) => {
      // Session header click
      const header = document.querySelector(
        `[data-session-id="${session.id}"]`
      );
      if (header) {
        header.addEventListener("click", (e) => {
          if (
            e.target.closest(".session-header-right") ||
            e.target.closest(".session-name-input")
          ) {
            return;
          }
          this.toggleSession(session.id);
        });
      }

      // Edit session name
      const editBtn = document.querySelector(
        `[data-edit-session="${session.id}"]`
      );
      const nameInput = document.querySelector(
        `[data-name-input="${session.id}"]`
      );

      if (editBtn && nameInput) {
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          nameInput.style.display = "inline-block";
          nameInput.focus();
          nameInput.select();
        });

        nameInput.addEventListener("blur", () => {
          this.updateSessionName(session.id, nameInput.value);
          nameInput.style.display = "none";
        });

        nameInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            nameInput.blur();
          }
        });
      }

      // Delete session or selected tabs
      const deleteBtn = document.querySelector(
        `[data-delete-session="${session.id}"]`
      );
      if (deleteBtn) {
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const hasSelected = session.tabs.some((tab) =>
            this.selectedTabs.has(`${session.id}-${tab.id}`)
          );
          if (hasSelected) {
            this.deleteSelectedInSession(session.id);
          } else {
            if (confirm("Delete this session?")) {
              this.deleteSession(session.id);
            }
          }
        });
      }

      // Open all tabs or selected tabs
      const openAllBtn = document.querySelector(
        `[data-open-all="${session.id}"]`
      );
      if (openAllBtn) {
        openAllBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const hasSelected = session.tabs.some((tab) =>
            this.selectedTabs.has(`${session.id}-${tab.id}`)
          );
          if (hasSelected) {
            this.openSelectedInSession(session.id);
          } else {
            this.openAllTabs(session.id);
          }
        });
      }

      // Select all / Deselect all
      const selectAllBtn = document.querySelector(
        `[data-select-all="${session.id}"]`
      );
      if (selectAllBtn) {
        selectAllBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const allSelected = session.tabs.every((tab) =>
            this.selectedTabs.has(`${session.id}-${tab.id}`)
          );
          if (allSelected) {
            this.deselectAllInSession(session.id);
          } else {
            this.selectAllInSession(session.id);
          }
        });
      }

      // Tab actions
      session.tabs.forEach((tab) => {
        // Checkbox
        const checkbox = document.querySelector(
          `[data-checkbox="${session.id}-${tab.id}"]`
        );
        if (checkbox) {
          checkbox.addEventListener("change", (e) => {
            e.stopPropagation();
            this.toggleTabSelection(session.id, tab.id);
          });
        }

        // Open tab button
        const openTabBtn = document.querySelector(
          `[data-open-tab="${session.id}-${tab.id}"]`
        );
        if (openTabBtn) {
          openTabBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const tabData = session.tabs.find((t) => t.id === tab.id);
            if (tabData) {
              this.openTab(tabData.url);
            }
          });
        }

        // Delete tab button
        const deleteTabBtn = document.querySelector(
          `[data-delete-tab="${session.id}-${tab.id}"]`
        );
        if (deleteTabBtn) {
          deleteTabBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.deleteTab(session.id, tab.id);
          });
        }
      });
    });
  }

  renderSession(session) {
    const hasSelectedTabs = session.tabs.some((tab) =>
      this.selectedTabs.has(`${session.id}-${tab.id}`)
    );
    const allSelected = session.tabs.every((tab) =>
      this.selectedTabs.has(`${session.id}-${tab.id}`)
    );

    return `
      <div class="session-group ${
        session.collapsed ? "collapsed" : ""
      }" data-session="${session.id}">
        <div class="session-header" data-session-id="${session.id}">
          <div class="session-header-left">
            <svg class="collapse-icon" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div class="session-info">
              <span class="session-name">${session.name}</span>
              <input 
                type="text" 
                class="session-name-input" 
                value="${session.name}" 
                data-name-input="${session.id}"
                style="display: none;"
              >
              <svg class="edit-icon" data-edit-session="${
                session.id
              }" data-tooltip="Edit name" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2.5l2 2L7 11l-2.5.5.5-2.5 6.5-6.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="session-meta">• ${session.tabs.length} tabs</span>
            </div>
          </div>
          <div class="session-header-right">
            <button class="icon-btn" data-select-all="${session.id}">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <rect x="3" y="3" width="10" height="10" rx="2" stroke-width="1.5"/>
                ${
                  allSelected
                    ? '<path d="M5 8l2 2 4-4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
                    : ""
                }
              </svg>
            </button>
            <button class="icon-btn" data-open-all="${
              session.id
            }" data-tooltip="${
      hasSelectedTabs ? "Open selected tabs" : "Open all tabs"
    }">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <path d="M6 3h8v8M14 3L6 11" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="icon-btn delete" data-delete-session="${
              session.id
            }" data-tooltip="${
      hasSelectedTabs ? "Delete selected tabs" : "Delete session"
    }">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v4M10 7v4M4 4v9a1 1 0 001 1h6a1 1 0 001-1V4" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="tab-list">
          ${session.tabs.map((tab) => this.renderTab(session.id, tab)).join("")}
        </div>
      </div>
    `;
  }

  renderTab(sessionId, tab) {
    const faviconUrl = this.getFaviconUrl(tab.url, tab.favIconUrl);
    const simplifiedUrl = this.getSimplifiedUrl(tab.url);
    const isSelected = this.selectedTabs.has(`${sessionId}-${tab.id}`);

    return `
      <div class="tab-item ${isSelected ? "selected" : ""}" data-tab-id="${
      tab.id
    }" data-session-tab="${sessionId}-${tab.id}">
        <input 
          type="checkbox" 
          class="tab-checkbox" 
          data-checkbox="${sessionId}-${tab.id}"
          ${isSelected ? "checked" : ""}
        >
        
        <div class="tab-favicon">
          ${faviconUrl ? `<img src="${faviconUrl}" alt="">` : "🌐"}
        </div>
        
        <div class="tab-info">
          <span class="tab-title">${tab.title || "Untitled"}</span>
          <span class="tab-url">${simplifiedUrl}</span>
        </div>
        
        <div class="tab-actions">
          <button class="tab-action-btn open" data-open-tab="${sessionId}-${
      tab.id
    }" data-tooltip="Open tab">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M6 3h8v8M14 3L6 11" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="tab-action-btn delete" data-delete-tab="${sessionId}-${
      tab.id
    }" data-tooltip="Delete tab">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v4M10 7v4M4 4v9a1 1 0 001 1h6a1 1 0 001-1V4" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }
}

// Initialize the app
const tabManager = new TabManager();
