// Tab Manager - Main Logic

const SEARCH_DEBOUNCE_MS = 150;
const TOAST_DURATION_MS = 8000;
const TOOLTIP_DELAY_MS = 1000;
const LEGACY_PLACEHOLDER_NAME = "add name";
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFavicon(favIconUrl) {
  if (!favIconUrl) return null;
  // data: URIs can be tens of KB each and blow the storage quota; the
  // hostname-based fallback in getFaviconUrl covers these tabs instead.
  if (favIconUrl.startsWith("data:") || favIconUrl.startsWith("chrome://")) {
    return null;
  }
  return favIconUrl;
}

function formatSavedAt(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfDay(now) - startOfDay(date)) / (24 * 60 * 60 * 1000)
  );
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (dayDiff <= 0) return `Today ${time}`;
  if (dayDiff === 1) return `Yesterday ${time}`;
  if (dayDiff < 7) return `${dayDiff} days ago`;

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function formatSavedAtFull(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

class TabManager {
  constructor() {
    this.sessions = [];
    this.selectedTabs = new Set(); // Set of tab uids
    this.currentSearchQuery = "";
    this.searchTimer = null;
    this.dragArmedElement = null; // Element whose grip handle was pressed
    this.draggedItem = null; // { type: "tab", uid, sessionId } | { type: "session", sessionId }
    this.lastWrittenSnapshot = null; // Used to ignore our own storage.onChanged events
    this.undoSnapshot = null;
    this.toastTimer = null;
    this.tooltipTimer = null;
    this.init();
  }

  async init() {
    await this.loadSessions();
    this.setupEventListeners();
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  async loadSessions() {
    try {
      const result = await chrome.storage.local.get(["sessions"]);
      const { sessions, changed } = this.normalizeSessions(result.sessions || []);
      this.sessions = sessions;
      if (changed) {
        await this.saveSessions();
      }
    } catch (error) {
      console.error("Error loading sessions:", error);
      this.sessions = [];
    }
  }

  // Upgrades older records in place: stable tab uids, a real timestamp,
  // an empty name instead of the literal "add name", and no data: favicons.
  normalizeSessions(rawSessions) {
    let changed = false;

    const sessions = rawSessions.map((session) => {
      const normalized = { ...session };

      if (typeof normalized.savedAt !== "number") {
        normalized.savedAt =
          typeof normalized.id === "number" ? normalized.id : Date.now();
        changed = true;
      }

      if (normalized.name === LEGACY_PLACEHOLDER_NAME) {
        normalized.name = "";
        changed = true;
      }
      if (typeof normalized.name !== "string") {
        normalized.name = "";
        changed = true;
      }

      normalized.tabs = (normalized.tabs || []).map((tab) => {
        const next = { ...tab };
        if (!next.uid) {
          next.uid = generateId();
          changed = true;
        }
        if ("id" in next) {
          delete next.id;
          changed = true;
        }
        const favicon = sanitizeFavicon(next.favIconUrl);
        if (favicon !== (next.favIconUrl ?? null)) {
          next.favIconUrl = favicon;
          changed = true;
        }
        return next;
      });

      return normalized;
    });

    return { sessions, changed };
  }

  async saveSessions() {
    try {
      this.lastWrittenSnapshot = JSON.stringify(this.sessions);
      await chrome.storage.local.set({ sessions: this.sessions });
    } catch (error) {
      console.error("Error saving sessions:", error);
      this.showToast("Couldn't save changes. Storage may be full.", {
        tone: "error",
      });
    }
  }

  handleExternalStorageChange(changes) {
    if (!changes.sessions) return;

    const incoming = changes.sessions.newValue || [];
    if (JSON.stringify(incoming) === this.lastWrittenSnapshot) {
      return; // Our own write echoing back
    }

    const { sessions } = this.normalizeSessions(incoming);
    this.sessions = sessions;

    const liveUids = new Set(
      this.sessions.flatMap((s) => s.tabs.map((t) => t.uid))
    );
    for (const uid of this.selectedTabs) {
      if (!liveUids.has(uid)) this.selectedTabs.delete(uid);
    }

    this.render();
  }

  // ---------------------------------------------------------------------------
  // Event wiring (all delegated from static containers)
  // ---------------------------------------------------------------------------

  setupEventListeners() {
    const searchInput = document.getElementById("searchInput");
    searchInput.addEventListener("input", (e) => {
      clearTimeout(this.searchTimer);
      const value = e.target.value;
      this.searchTimer = setTimeout(
        () => this.handleSearch(value),
        SEARCH_DEBOUNCE_MS
      );
    });

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInput.focus();
      }
    });

    document.querySelector(".btn-expand").addEventListener("click", () => {
      this.toggleAllSessions();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") this.handleExternalStorageChange(changes);
    });

    const main = document.getElementById("mainContent");
    main.addEventListener("click", (e) => this.onMainClick(e));
    main.addEventListener("change", (e) => this.onMainChange(e));
    main.addEventListener("keydown", (e) => this.onMainKeydown(e));
    main.addEventListener("focusout", (e) => this.onMainFocusOut(e));
    main.addEventListener("pointerdown", (e) => this.onMainPointerDown(e));
    main.addEventListener("dragstart", (e) => this.onDragStart(e));
    main.addEventListener("dragover", (e) => this.onDragOver(e));
    main.addEventListener("dragleave", (e) => this.onDragLeave(e));
    main.addEventListener("drop", (e) => this.onDrop(e));
    main.addEventListener("dragend", () => this.onDragEnd());

    document.getElementById("toast").addEventListener("click", (e) => {
      if (e.target.closest("[data-action='undo']")) this.undo();
      if (e.target.closest("[data-action='dismiss-toast']")) this.hideToast();
    });

    this.setupTooltips();
  }

  onMainClick(e) {
    const actionEl = e.target.closest("[data-action]");
    const sessionEl = e.target.closest("[data-session-id]");
    const sessionId = sessionEl ? Number(sessionEl.dataset.sessionId) : null;
    const tabEl = e.target.closest(".tab-item");
    const uid = tabEl?.dataset.tabUid;

    if (actionEl) {
      e.stopPropagation();
      switch (actionEl.dataset.action) {
        case "rename":
          this.startRename(sessionId);
          return;
        case "select-all":
          this.toggleSelectAllInSession(sessionId);
          return;
        case "open-all":
          this.openAllOrSelected(sessionId);
          return;
        case "delete-session":
          this.deleteSessionOrSelected(sessionId);
          return;
        case "open-tab":
          this.openTabByUid(uid);
          return;
        case "delete-tab":
          this.deleteTab(uid);
          return;
        default:
          return;
      }
    }

    const header = e.target.closest(".session-header");
    if (header && !e.target.closest(".session-name-input, .drag-handle")) {
      this.toggleSession(sessionId);
    }
  }

  onMainChange(e) {
    const checkbox = e.target.closest(".tab-checkbox");
    if (!checkbox) return;
    const tabEl = checkbox.closest(".tab-item");
    this.toggleTabSelection(tabEl.dataset.tabUid);
  }

  onMainKeydown(e) {
    const nameInput = e.target.closest(".session-name-input");
    if (nameInput) {
      if (e.key === "Enter") {
        e.preventDefault();
        this.commitRename(nameInput);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.commitRename(nameInput, { cancel: true });
      }
      return;
    }

    const tabEl = e.target.closest(".tab-item");
    if (!tabEl || e.target !== tabEl) return;

    const uid = tabEl.dataset.tabUid;
    const sessionId = Number(tabEl.dataset.sessionId);

    if (e.key === "Enter") {
      e.preventDefault();
      this.openTabByUid(uid);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.deleteTab(uid);
    } else if (e.key === " ") {
      e.preventDefault();
      this.toggleTabSelection(uid);
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const direction = e.key === "ArrowUp" ? -1 : 1;
      if (e.shiftKey) {
        this.moveTabToAdjacentSession(uid, sessionId, direction);
      } else {
        this.nudgeTabWithinSession(uid, sessionId, direction);
      }
    }
  }

  onMainFocusOut(e) {
    const nameInput = e.target.closest(".session-name-input");
    if (nameInput) this.commitRename(nameInput);
  }

  // Enter, Escape and blur can all fire for the same edit; only the first wins.
  commitRename(input, { cancel = false } = {}) {
    if (input.dataset.committed === "true") return;
    input.dataset.committed = "true";

    const sessionId = Number(input.dataset.sessionId);
    if (cancel) {
      this.rerenderSession(sessionId);
      return;
    }
    this.updateSessionName(sessionId, input.value.trim());
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  toggleTabSelection(uid) {
    if (this.selectedTabs.has(uid)) {
      this.selectedTabs.delete(uid);
    } else {
      this.selectedTabs.add(uid);
    }
    const session = this.findSessionByTabUid(uid);
    if (session) this.rerenderSession(session.id, { focusUid: uid });
  }

  toggleSelectAllInSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return;

    const visibleTabs = this.getVisibleTabs(session);
    const allSelected = visibleTabs.every((tab) =>
      this.selectedTabs.has(tab.uid)
    );

    visibleTabs.forEach((tab) => {
      if (allSelected) {
        this.selectedTabs.delete(tab.uid);
      } else {
        this.selectedTabs.add(tab.uid);
      }
    });
    this.rerenderSession(sessionId);
  }

  getSelectedTabsInSession(session) {
    return session.tabs.filter((tab) => this.selectedTabs.has(tab.uid));
  }

  // ---------------------------------------------------------------------------
  // Session / tab mutations
  // ---------------------------------------------------------------------------

  getSession(sessionId) {
    return this.sessions.find((s) => s.id === sessionId);
  }

  findSessionByTabUid(uid) {
    return this.sessions.find((s) => s.tabs.some((t) => t.uid === uid));
  }

  async toggleSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return;
    session.collapsed = !session.collapsed;
    await this.saveSessions();
    this.rerenderSession(sessionId);
  }

  async toggleAllSessions() {
    const allCollapsed = this.sessions.every((s) => s.collapsed);
    this.sessions.forEach((s) => (s.collapsed = !allCollapsed));
    await this.saveSessions();
    this.render();
  }

  startRename(sessionId) {
    const group = this.getSessionElement(sessionId);
    if (!group) return;
    const nameEl = group.querySelector(".session-name");
    const input = group.querySelector(".session-name-input");
    if (!nameEl || !input) return;
    nameEl.style.display = "none";
    input.style.display = "inline-block";
    input.focus();
    input.select();
  }

  async updateSessionName(sessionId, newName) {
    const session = this.getSession(sessionId);
    if (!session) return;
    if (session.name !== newName) {
      session.name = newName;
      await this.saveSessions();
    }
    this.rerenderSession(sessionId);
  }

  async openTab(url) {
    if (!url) return;
    try {
      await chrome.tabs.create({ url, active: false });
    } catch (error) {
      console.error("Error opening tab:", error);
    }
  }

  openTabByUid(uid) {
    const session = this.findSessionByTabUid(uid);
    const tab = session?.tabs.find((t) => t.uid === uid);
    if (tab) this.openTab(tab.url);
  }

  async openAllOrSelected(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return;
    const selected = this.getSelectedTabsInSession(session);
    const targets = selected.length > 0 ? selected : session.tabs;
    for (const tab of targets) {
      await this.openTab(tab.url);
    }
  }

  // Every destructive action goes through here so it can be undone.
  async commitDeletion(message, mutate) {
    this.undoSnapshot = JSON.parse(JSON.stringify(this.sessions));
    mutate();
    await this.saveSessions();
    this.render();
    this.showToast(message, { undoable: true });
  }

  async undo() {
    if (!this.undoSnapshot) return;
    this.sessions = this.undoSnapshot;
    this.undoSnapshot = null;
    await this.saveSessions();
    this.render();
    this.hideToast();
  }

  deleteSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return;
    const label = session.name || "group";
    this.commitDeletion(`Deleted ${label} (${session.tabs.length} tabs)`, () => {
      this.sessions = this.sessions.filter((s) => s.id !== sessionId);
      session.tabs.forEach((t) => this.selectedTabs.delete(t.uid));
    });
  }

  deleteTab(uid) {
    const session = this.findSessionByTabUid(uid);
    if (!session) return;
    this.commitDeletion("Deleted 1 tab", () => {
      session.tabs = session.tabs.filter((t) => t.uid !== uid);
      this.selectedTabs.delete(uid);
      this.pruneEmptySessions();
    });
  }

  deleteSessionOrSelected(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return;
    const selected = this.getSelectedTabsInSession(session);
    if (selected.length === 0) {
      this.deleteSession(sessionId);
      return;
    }
    const uids = new Set(selected.map((t) => t.uid));
    this.commitDeletion(
      `Deleted ${selected.length} tab${selected.length > 1 ? "s" : ""}`,
      () => {
        session.tabs = session.tabs.filter((t) => !uids.has(t.uid));
        uids.forEach((uid) => this.selectedTabs.delete(uid));
        this.pruneEmptySessions();
      }
    );
  }

  pruneEmptySessions() {
    this.sessions = this.sessions.filter((s) => s.tabs.length > 0);
  }

  async moveTabToSession(uid, toSessionId, beforeUid = null) {
    if (uid === beforeUid) return;

    const fromSession = this.findSessionByTabUid(uid);
    const toSession = this.getSession(toSessionId);
    if (!fromSession || !toSession) return;

    const fromIndex = fromSession.tabs.findIndex((t) => t.uid === uid);
    const [tab] = fromSession.tabs.splice(fromIndex, 1);

    let insertIndex = toSession.tabs.length;
    if (beforeUid !== null) {
      const targetIndex = toSession.tabs.findIndex((t) => t.uid === beforeUid);
      if (targetIndex !== -1) insertIndex = targetIndex;
    }
    toSession.tabs.splice(insertIndex, 0, tab);

    this.pruneEmptySessions();
    await this.saveSessions();
    this.render({ focusUid: uid });
  }

  nudgeTabWithinSession(uid, sessionId, direction) {
    const session = this.getSession(sessionId);
    if (!session) return;
    const index = session.tabs.findIndex((t) => t.uid === uid);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= session.tabs.length) return;

    // Moving down means inserting before the item two positions ahead.
    const beforeUid =
      direction > 0 ? session.tabs[targetIndex + 1]?.uid ?? null : session.tabs[targetIndex].uid;
    this.moveTabToSession(uid, sessionId, beforeUid);
  }

  moveTabToAdjacentSession(uid, sessionId, direction) {
    const index = this.sessions.findIndex((s) => s.id === sessionId);
    const target = this.sessions[index + direction];
    if (!target) return;
    // Moving up lands at the bottom of the previous group; moving down at the top of the next.
    const beforeUid = direction > 0 ? target.tabs[0]?.uid ?? null : null;
    this.moveTabToSession(uid, target.id, beforeUid);
  }

  async moveSession(sessionId, beforeSessionId = null) {
    if (sessionId === beforeSessionId) return;
    const fromIndex = this.sessions.findIndex((s) => s.id === sessionId);
    if (fromIndex === -1) return;

    const [session] = this.sessions.splice(fromIndex, 1);
    let insertIndex = this.sessions.length;
    if (beforeSessionId !== null) {
      const targetIndex = this.sessions.findIndex((s) => s.id === beforeSessionId);
      if (targetIndex !== -1) insertIndex = targetIndex;
    }
    this.sessions.splice(insertIndex, 0, session);

    await this.saveSessions();
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Drag and drop
  // ---------------------------------------------------------------------------

  onMainPointerDown(e) {
    const handle = e.target.closest(".drag-handle");
    this.dragArmedElement = handle ? handle.closest("[draggable='true']") : null;
  }

  onDragStart(e) {
    const draggable = e.target.closest("[draggable='true']");
    if (!draggable || draggable !== this.dragArmedElement) {
      e.preventDefault();
      return;
    }

    if (draggable.classList.contains("tab-item")) {
      this.draggedItem = {
        type: "tab",
        uid: draggable.dataset.tabUid,
        sessionId: Number(draggable.dataset.sessionId),
      };
    } else if (draggable.classList.contains("session-header")) {
      this.draggedItem = {
        type: "session",
        sessionId: Number(draggable.dataset.sessionId),
      };
      draggable.closest(".session-group")?.classList.add("dragging");
    } else {
      e.preventDefault();
      return;
    }

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(this.draggedItem));
    draggable.classList.add("dragging");
  }

  onDragOver(e) {
    if (!this.draggedItem) return;
    const group = e.target.closest(".session-group");
    if (!group) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    this.clearDropIndicators();

    if (this.draggedItem.type === "session") {
      const rect = group.getBoundingClientRect();
      const isAfter = e.clientY > rect.top + rect.height / 2;
      group.classList.add(isAfter ? "drop-after" : "drop-before");
      return;
    }

    const tabEl = e.target.closest(".tab-item");
    if (tabEl) {
      const rect = tabEl.getBoundingClientRect();
      const isAfter = e.clientY > rect.top + rect.height / 2;
      tabEl.classList.add(isAfter ? "drop-after" : "drop-before");
    }
    group.classList.add("drop-target");
  }

  onDragLeave(e) {
    const group = e.target.closest(".session-group");
    if (group && !group.contains(e.relatedTarget)) {
      group.classList.remove("drop-target", "drop-before", "drop-after");
      group
        .querySelectorAll(".drop-before, .drop-after")
        .forEach((el) => el.classList.remove("drop-before", "drop-after"));
    }
  }

  onDrop(e) {
    if (!this.draggedItem) return;
    const group = e.target.closest(".session-group");
    if (!group) return;

    e.preventDefault();
    const targetSessionId = Number(group.dataset.sessionId);
    const item = this.draggedItem;

    if (item.type === "session") {
      const placeAfter = group.classList.contains("drop-after");
      const beforeId = placeAfter
        ? this.getAdjacentSessionId(targetSessionId, 1)
        : targetSessionId;
      this.onDragEnd();
      this.moveSession(item.sessionId, beforeId);
      return;
    }

    const tabEl = e.target.closest(".tab-item");
    let beforeUid = null;
    if (tabEl) {
      const placeAfter = tabEl.classList.contains("drop-after");
      const targetUid = tabEl.dataset.tabUid;
      beforeUid = placeAfter
        ? this.getNextTabUid(targetSessionId, targetUid)
        : targetUid;
    }

    this.onDragEnd();
    this.moveTabToSession(item.uid, targetSessionId, beforeUid);
  }

  onDragEnd() {
    this.draggedItem = null;
    this.dragArmedElement = null;
    this.clearDropIndicators();
    document
      .querySelectorAll(".dragging")
      .forEach((el) => el.classList.remove("dragging"));
  }

  clearDropIndicators() {
    document
      .querySelectorAll(".drop-before, .drop-after, .drop-target")
      .forEach((el) => el.classList.remove("drop-before", "drop-after", "drop-target"));
  }

  getNextTabUid(sessionId, uid) {
    const session = this.getSession(sessionId);
    if (!session) return null;
    const index = session.tabs.findIndex((t) => t.uid === uid);
    return session.tabs[index + 1]?.uid ?? null;
  }

  getAdjacentSessionId(sessionId, direction) {
    const index = this.sessions.findIndex((s) => s.id === sessionId);
    return this.sessions[index + direction]?.id ?? null;
  }

  // ---------------------------------------------------------------------------
  // Toast / undo
  // ---------------------------------------------------------------------------

  showToast(message, { undoable = false, tone = "info" } = {}) {
    const toast = document.getElementById("toast");
    clearTimeout(this.toastTimer);

    toast.className = `toast visible ${tone}`;
    toast.innerHTML = `
      <span class="toast-message">${escapeHtml(message)}</span>
      ${undoable ? '<button class="toast-btn" data-action="undo">Undo</button>' : ""}
      <button class="toast-close" data-action="dismiss-toast" aria-label="Dismiss">&times;</button>
    `;

    this.toastTimer = setTimeout(() => this.hideToast(), TOAST_DURATION_MS);
  }

  hideToast() {
    clearTimeout(this.toastTimer);
    const toast = document.getElementById("toast");
    toast.classList.remove("visible");
    this.undoSnapshot = null;
  }

  // ---------------------------------------------------------------------------
  // Tooltips
  // ---------------------------------------------------------------------------

  setupTooltips() {
    document.addEventListener("mouseover", (e) => {
      const el = e.target.closest("[data-tooltip]");
      if (!el) return;
      clearTimeout(this.tooltipTimer);
      this.tooltipTimer = setTimeout(() => this.showTooltip(el), TOOLTIP_DELAY_MS);
    });

    document.addEventListener("mouseout", (e) => {
      if (e.target.closest("[data-tooltip]")) {
        clearTimeout(this.tooltipTimer);
        this.hideTooltip();
      }
    });
  }

  showTooltip(element) {
    this.hideTooltip();
    // The element may have been replaced by a re-render during the hover delay.
    if (!element.isConnected) return;

    const tooltipEl = document.createElement("div");
    tooltipEl.className = "tooltip";
    tooltipEl.textContent = element.getAttribute("data-tooltip");
    tooltipEl.id = "active-tooltip";
    document.body.appendChild(tooltipEl);

    const rect = element.getBoundingClientRect();
    const width = tooltipEl.offsetWidth;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, 10),
      window.innerWidth - width - 10
    );
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${rect.bottom + 8}px`;
  }

  hideTooltip() {
    document.getElementById("active-tooltip")?.remove();
  }

  dismissTooltip() {
    clearTimeout(this.tooltipTimer);
    this.hideTooltip();
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  handleSearch(query) {
    this.currentSearchQuery = query.trim().toLowerCase();
    this.render();
  }

  matchesSearch(tab) {
    const q = this.currentSearchQuery;
    if (!q) return true;
    return (
      (tab.title || "").toLowerCase().includes(q) ||
      (tab.url || "").toLowerCase().includes(q)
    );
  }

  getVisibleTabs(session) {
    return this.currentSearchQuery
      ? session.tabs.filter((tab) => this.matchesSearch(tab))
      : session.tabs;
  }

  // Returns the sessions as they should be displayed: filtered (and force-
  // expanded) while searching, otherwise as stored.
  getVisibleSessions() {
    if (!this.currentSearchQuery) return this.sessions;

    return this.sessions
      .map((session) => {
        const tabs = this.getVisibleTabs(session);
        return tabs.length > 0 ? { ...session, tabs, collapsed: false } : null;
      })
      .filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  getSessionElement(sessionId) {
    return document.querySelector(`.session-group[data-session-id="${sessionId}"]`);
  }

  render({ focusUid = null } = {}) {
    this.dismissTooltip();
    const main = document.getElementById("mainContent");
    const sessions = this.getVisibleSessions();

    if (sessions.length === 0) {
      main.innerHTML = this.currentSearchQuery
        ? this.renderEmptyState(
            "No matches",
            `Nothing matches "${escapeHtml(this.currentSearchQuery)}"`
          )
        : this.renderEmptyState(
            "No saved tabs yet",
            "Highlight tabs, open the Tab Manager popup and choose Save Highlighted Tabs"
          );
      return;
    }

    main.innerHTML = sessions.map((s) => this.renderSession(s)).join("");
    if (focusUid) this.focusTab(focusUid);
  }

  rerenderSession(sessionId, { focusUid = null } = {}) {
    this.dismissTooltip();
    const existing = this.getSessionElement(sessionId);
    const session = this.getVisibleSessions().find((s) => s.id === sessionId);

    if (!existing || !session) {
      this.render({ focusUid });
      return;
    }

    existing.outerHTML = this.renderSession(session);
    if (focusUid) this.focusTab(focusUid);
  }

  focusTab(uid) {
    document.querySelector(`.tab-item[data-tab-uid="${uid}"]`)?.focus();
  }

  renderEmptyState(title, body) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor">
          <rect x="8" y="12" width="48" height="40" rx="4" stroke-width="2"/>
          <line x1="8" y1="20" x2="56" y2="20" stroke-width="2"/>
          <circle cx="14" cy="16" r="1.5" fill="currentColor"/>
          <circle cx="19" cy="16" r="1.5" fill="currentColor"/>
          <circle cx="24" cy="16" r="1.5" fill="currentColor"/>
        </svg>
        <h3>${title}</h3>
        <p>${body}</p>
      </div>
    `;
  }

  renderGripIcon() {
    return `
      <svg class="grip-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <circle cx="5.5" cy="3.5" r="1.3"/><circle cx="10.5" cy="3.5" r="1.3"/>
        <circle cx="5.5" cy="8" r="1.3"/><circle cx="10.5" cy="8" r="1.3"/>
        <circle cx="5.5" cy="12.5" r="1.3"/><circle cx="10.5" cy="12.5" r="1.3"/>
      </svg>
    `;
  }

  renderSession(session) {
    const selectedCount = this.getSelectedTabsInSession(session).length;
    const hasSelected = selectedCount > 0;
    const allSelected =
      session.tabs.length > 0 &&
      session.tabs.every((tab) => this.selectedTabs.has(tab.uid));
    const tabCount = session.tabs.length;
    const savedAt = formatSavedAt(session.savedAt);
    const hasName = session.name.trim().length > 0;
    const selectLabel = allSelected ? "Deselect all" : "Select all";
    const openLabel = hasSelected ? "Open selected tabs" : "Open all tabs";
    const deleteLabel = hasSelected ? "Delete selected tabs" : "Delete group";

    return `
      <div class="session-group ${session.collapsed ? "collapsed" : ""}" data-session-id="${session.id}">
        <div class="session-header" data-session-id="${session.id}" draggable="true">
          <div class="session-header-left">
            <span class="drag-handle" data-tooltip="Drag to reorder group">${this.renderGripIcon()}</span>
            <svg class="collapse-icon" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div class="session-info">
              <span class="session-name ${hasName ? "" : "placeholder"}" data-action="rename" title="Click to rename">${
                hasName ? escapeHtml(session.name) : "Unnamed group"
              }</span>
              <input
                type="text"
                class="session-name-input"
                value="${escapeHtml(session.name)}"
                placeholder="Group name"
                data-session-id="${session.id}"
                style="display: none;"
              >
              <svg class="edit-icon" data-action="rename" data-tooltip="Rename group" role="button" aria-label="Rename group" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2.5l2 2L7 11l-2.5.5.5-2.5 6.5-6.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="session-meta">
                <span>${tabCount} tab${tabCount === 1 ? "" : "s"}</span>
                ${hasSelected ? `<span class="session-meta-selected">${selectedCount} selected</span>` : ""}
                ${savedAt ? `<span class="session-meta-date" title="${escapeHtml(formatSavedAtFull(session.savedAt))}">${escapeHtml(savedAt)}</span>` : ""}
              </span>
            </div>
          </div>
          <div class="session-header-right">
            <button class="icon-btn" data-action="select-all" data-tooltip="${selectLabel}" aria-label="${selectLabel}">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <rect x="3" y="3" width="10" height="10" rx="2" stroke-width="1.5"/>
                ${allSelected ? '<path d="M5 8l2 2 4-4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' : ""}
              </svg>
            </button>
            <button class="icon-btn" data-action="open-all" data-tooltip="${openLabel}" aria-label="${openLabel}">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <path d="M6 3h8v8M14 3L6 11" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="icon-btn delete" data-action="delete-session" data-tooltip="${deleteLabel}" aria-label="${deleteLabel}">
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
    const isSelected = this.selectedTabs.has(tab.uid);
    const title = tab.title || "Untitled";

    return `
      <div class="tab-item ${isSelected ? "selected" : ""}"
           data-tab-uid="${escapeHtml(tab.uid)}"
           data-session-id="${sessionId}"
           draggable="true"
           tabindex="0"
           role="listitem"
           aria-label="${escapeHtml(title)}">
        <span class="drag-handle" data-tooltip="Drag to move">${this.renderGripIcon()}</span>
        <input type="checkbox" class="tab-checkbox" ${isSelected ? "checked" : ""} aria-label="Select tab">
        <div class="tab-favicon">
          ${faviconUrl ? `<img src="${escapeHtml(faviconUrl)}" alt="" loading="lazy">` : "🌐"}
        </div>
        <div class="tab-info">
          <span class="tab-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
          <span class="tab-url" title="${escapeHtml(tab.url || "")}">${escapeHtml(simplifiedUrl)}</span>
        </div>
        <div class="tab-actions">
          <button class="tab-action-btn open" data-action="open-tab" data-tooltip="Open tab" aria-label="Open tab">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M6 3h8v8M14 3L6 11" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="tab-action-btn delete" data-action="delete-tab" data-tooltip="Delete tab" aria-label="Delete tab">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v4M10 7v4M4 4v9a1 1 0 001 1h6a1 1 0 001-1V4" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  getFaviconUrl(url, favIconUrl) {
    const clean = sanitizeFavicon(favIconUrl);
    if (clean) return clean;

    try {
      const { hostname, protocol } = new URL(url);
      if (RESTRICTED_URL_PREFIXES.some((p) => url.startsWith(p)) || !hostname) {
        return "";
      }
      if (protocol !== "http:" && protocol !== "https:") return "";
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
    } catch {
      return "";
    }
  }

  getSimplifiedUrl(url) {
    if (!url) return "";
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, "") + urlObj.pathname.slice(0, 20);
    } catch {
      return url;
    }
  }
}

// Initialize the app
const tabManager = new TabManager();
