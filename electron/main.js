const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#07070a',
    title: 'FOBS TV',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  Menu.setApplicationMenu(null);

  // Load the FOBS TV frontend in 16:9 widescreen (connects to live backend API)
  const localIndex = path.join(__dirname, '..', 'public', 'index.html');
  if (require('fs').existsSync(localIndex)) {
    mainWindow.loadFile(localIndex);
  } else {
    mainWindow.loadURL('https://fobstv.duckdns.org/');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
