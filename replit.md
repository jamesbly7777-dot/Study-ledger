# Atlas Study Tracker Pro

A Progressive Web Application (PWA) for tracking study sessions, monitoring productivity with a focus timer, and visualizing progress through statistics.

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Cloud**: Firebase (Authentication + Firestore for cloud sync)
- **PWA**: Service Worker + Web App Manifest
- **Server**: Node.js HTTP server (`server.js`) serving static files

## Project Structure

```
/
├── index.html          # Main app UI and embedded styles
├── app.js              # Application logic, timer, Firebase integration
├── service-worker.js   # PWA caching for offline support
├── manifest.json       # PWA installation config
├── server.js           # Simple Node.js static file server
├── icon.png            # App icons
├── icon-192.png
└── icon-512.png
```

## Running the App

```bash
node server.js
```

Serves on `http://0.0.0.0:5000`.

## Features

- Focus Engine: timer for study sessions
- Session tracking with names, categories, focus ratings, notes
- Daily/weekly stats and study streak tracking
- Daily study goal setting
- Cloud sync via Firebase (optional, requires login)
- Offline support via Service Worker
- JSON export/import for session data
- PWA installable on mobile and desktop

## Data Persistence

- Primary: Browser `localStorage`
- Optional cloud sync: Firebase Firestore (requires Firebase config)
