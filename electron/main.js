const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');

// Hardware Acceleration & GPU Rasterization for Smooth 60-120fps PC Playback
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,CanvasOopRasterization,SmoothScrolling');
app.commandLine.appendSwitch('disable-features', 'UseChromeOSDirectVideoDecoder');
app.commandLine.appendSwitch('high-dpi-support', '1');

let mainWindow;

const PC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 FOBS-TV-PC-App/1.0.0 Electron/33.2.0';

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
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
      spellcheck: false,
      v8CacheOptions: 'bypassHeatCheck'
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  Menu.setApplicationMenu(null);

  // Ensure all outbound requests carry the official PC app signature
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = PC_USER_AGENT;
    details.requestHeaders['X-FOBS-Client'] = 'pc-app';
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  mainWindow.webContents.setUserAgent(PC_USER_AGENT);

  // Load the live FOBS TV platform with PC client signature
  mainWindow.loadURL('https://fobstv.duckdns.org/?fobs_app=pc', {
    userAgent: PC_USER_AGENT,
    extraHeaders: 'X-FOBS-Client: pc-app\n'
  });

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
