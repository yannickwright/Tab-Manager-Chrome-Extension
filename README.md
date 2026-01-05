# Tab Manager - Chrome Extension

A modern Chrome extension for managing and organizing your browser tabs, inspired by Tabsurfer.

## Features

- 📑 **Save Tab Sessions** - Save all your current tabs into organized sessions
- 🗂️ **Collapsible Groups** - Organize tabs into collapsible session groups
- 🔍 **Quick Search** - Find tabs instantly with keyboard shortcut (⌘K)
- 🎨 **Beautiful Dark UI** - Modern, clean interface matching the Tabsurfer design
- ⚡ **Fast & Lightweight** - Built with vanilla JavaScript for optimal performance
- 🔄 **Persistent Storage** - Your sessions are saved locally and persist across browser restarts

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the extension folder

## Usage

### Opening the Extension

- Click the extension icon in your toolbar
- The Tab Manager will open in a new browser tab

### Saving Tabs

- Click the `+` button in the top right to save all current tabs

### Managing Sessions

- Click on a session header to expand/collapse it
- Click the pencil icon to rename a session
- Click individual tabs to open them
- Hover over tabs to see action buttons (delete, tag, schedule, etc.)

### Search

- Click the search box or press `⌘K` (Mac) or `Ctrl+K` (Windows/Linux)
- Type to filter tabs by title or URL

## Project Structure

```
Tab Extension/
├── manifest.json          # Extension configuration
├── index.html            # Main UI
├── app.js                # Main application logic
├── background.js         # Background service worker
├── styles.css            # All styles
├── icons/                # Extension icons
└── README.md             # This file
```

## Technologies Used

- Vanilla JavaScript (no frameworks)
- Chrome Extension APIs (Manifest V3)
- CSS3 with CSS Variables
- Chrome Storage API
- Background Service Worker

## Keyboard Shortcuts

- `⌘K` / `Ctrl+K` - Focus search box

## Future Enhancements

- [ ] Folders for organizing sessions
- [ ] Tags for categorizing tabs
- [ ] Scheduled tab opening
- [ ] Export/import sessions
- [ ] Drag and drop reordering
- [ ] Cloud sync across devices
- [ ] AI-powered tab summaries

## License

MIT License - Feel free to use and modify as needed.

## Credits

UI Design inspired by [Tabsurfer](https://tabsurfer.com/)

