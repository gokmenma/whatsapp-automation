const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let mainWindow;
let serverProcess;

function checkPort(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const socket = net.connect(port, 'localhost', () => {
        socket.end();
        resolve();
      });

      socket.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Port ${port} bekleme zaman aşımına uğradı.`));
        } else {
          setTimeout(tryConnect, 1000);
        }
      });
    };
    tryConnect();
  });
}

function createWindow() {
  const userDataPath = app.getPath('userData');
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'static', 'favicon.png'),
  });

  const isDev = process.env.IS_DEV === 'true';
  const port = isDev ? (process.env.PORT || 5173) : 3000;

  if (isDev) {
    checkPort(port).then(() => {
      mainWindow.loadURL(`http://localhost:${port}`);
    });
  } else {
    // Üretim modunda build edilmiş server'ı başlat
    const serverPath = path.join(__dirname, 'build', 'index.js');
    serverProcess = spawn('node', [serverPath], {
      env: { 
        ...process.env, 
        PORT: port, 
        USER_DATA_PATH: userDataPath 
      },
      stdio: 'inherit'
    });

    checkPort(port).then(() => {
      mainWindow.loadURL(`http://localhost:${port}`);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
