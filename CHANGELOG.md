# Changelog

## Version 1.1.0 - January 2026

### 🎉 Major Changes

#### Opens in Browser Tab (Not Side Panel)
- **Changed:** Extension now opens in a full browser tab instead of side panel
- **Why:** Better visibility and easier to use
- **How:** Click the extension icon and it opens in a new tab

#### Simplified Navigation
- **Removed:** Folders and Schedules tabs
- **Removed:** Number badges (1, 2, 3) from navigation tabs
- **Kept:** Home tab (active) and Notes tab (coming soon)
- **Result:** Cleaner, simpler navigation

### 🔧 Technical Changes

#### Files Added
- `background.js` - Service worker to handle extension icon clicks
- `index.html` - Main UI (replaces sidepanel.html)
- `app.js` - Main logic (replaces sidepanel.js)

#### Files Removed
- `popup.html` - No longer needed
- `popup.js` - No longer needed
- `sidepanel.html` - Replaced by index.html
- `sidepanel.js` - Replaced by app.js

#### Manifest Changes
- Removed `sidePanel` permission
- Removed `side_panel` configuration
- Added `background` service worker
- Simplified `action` configuration

#### UI Changes
- Removed number badges from nav tabs
- Centered content with max-width: 1400px
- Optimized for full browser tab view

### ✨ Features (Unchanged)

All core features remain the same:
- ✅ Save all open tabs as sessions
- ✅ Search tabs (⌘K / Ctrl+K)
- ✅ Collapsible session groups
- ✅ Click to reopen tabs
- ✅ Rename sessions
- ✅ Delete tabs/sessions
- ✅ Beautiful dark UI
- ✅ Persistent storage

### 📝 Documentation Updates

Updated all documentation to reflect new changes:
- `README.md` - Updated usage instructions
- `QUICKSTART.md` - Updated setup steps
- `INSTALLATION.md` - Updated installation guide
- `CHANGELOG.md` - This file (new)

### 🔄 Migration Guide

If you had the previous version installed:

1. **Remove old version:**
   - Go to `chrome://extensions/`
   - Remove the old Tab Manager extension

2. **Install new version:**
   - Click "Load unpacked"
   - Select the updated extension folder
   - Your saved sessions will be preserved!

3. **New behavior:**
   - Click extension icon → Opens in new tab (not side panel)
   - Simpler navigation (Home and Notes only)

### 🐛 Bug Fixes

- Fixed issue where Tab Manager would save itself as a tab
- Improved tab filtering to exclude extension pages

---

## Version 1.0.0 - January 2026

### Initial Release

- Full tab management system
- Side panel interface
- Save and organize tabs
- Search functionality
- Dark theme UI
- Persistent storage

---

**Current Version:** 1.1.0  
**Last Updated:** January 2026

