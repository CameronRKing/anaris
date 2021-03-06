const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// Live Reload
require('electron-reload')(__dirname, {
  electron: path.join(__dirname, '../node_modules', '.bin', 'electron'),
  awaitWriteFinish: true
});

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    // these bits should be user-configured
    backgroundColor: '#fff',
    width: 800,
    height: 600,
    fullscreen: true,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true
    }
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, './index.html'));

  // Open the DevTools.
  // this bit should be user-configured
  mainWindow.webContents.openDevTools();

  // really, I just want to prevent ctrl+w from closing the window right now
  const template = [
    {
      role: 'view',
      submenu: [
        {
          label: 'Toggle fullscreen',
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          },
          accelerator: 'F11'
        },
        {
          label: 'Refresh',
          click: () => {
            mainWindow.reload();
          },
          accelerator: 'Ctrl+R'
        },
        {
          label: 'Toggle devtools',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          },
          accelerator: 'Ctrl+Shift+I'
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
