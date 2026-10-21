'use strict';
/* Thin Electron wrapper around montage.html.

   montage.html is not modified or copied by this. The window loads it from
   disk, so an edit shows up on Ctrl+R, and the same file still works
   double-clicked in Chrome. If this wrapper ever needs the app to change, the
   wrapper is wrong — a coach with no install has to keep getting the plain
   HTML file. */

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const APP_FILE = path.join(__dirname, '..', 'montage.html');

function createWindow(){
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    backgroundColor: '#0d1117',          // --bg, so there is no white flash on open
    webPreferences: {
      contextIsolation: true,            // montage.html needs no Node; keep the
      nodeIntegration: false,            // secure defaults
    },
  });

  win.loadFile(APP_FILE);

  /* An export or an external link opens outside the app window rather than
     replacing the tool in a chrome-less frame the coach cannot navigate back
     from. */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
