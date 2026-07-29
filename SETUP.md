# Labour Connect - Desktop App Setup

## Option 1: Install as Web App (PWA)
Open `index.html` in Chrome/Edge and look for the install icon in the address bar.
Or right-click → "Install Labour Connect"

## Option 2: Desktop App with Electron

### Prerequisites
Install Node.js from https://nodejs.org

### Install & Run
```bash
cd labour-connect
npm install
npm start
```

### Build .exe
```bash
npm run build
```
The .exe will be in `dist/` folder.

### Files Created
- `package.json` - npm config
- `electron-main.js` - Desktop app window
- `manifest.json` - PWA manifest
- `sw.js` - Service worker for offline