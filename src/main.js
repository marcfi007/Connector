"use strict";
const { app, BrowserWindow, ipcMain, safeStorage, nativeTheme, protocol } = require("electron");
const path = require("path");
const fs = require("fs");
const { ConnectorService } = require("./connector");

const CONFIG_PATH = path.join(app.getPath("userData"), "credentials.enc");

let mainWindow = null;
const connector = new ConnectorService();

// ─── Credential storage ───────────────────────────────────────────────────────
function saveCredentials(token, obsPwd) {
  try {
    const data = JSON.stringify({ token, obsPwd });
    if (safeStorage.isEncryptionAvailable()) {
      const enc = safeStorage.encryptString(data);
      fs.writeFileSync(CONFIG_PATH, enc);
    } else {
      fs.writeFileSync(CONFIG_PATH, Buffer.from(data, "utf8"));
    }
  } catch (e) {
    console.error("save credentials failed:", e);
  }
}

function loadCredentials() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { token: "", obsPwd: "" };
    const raw = fs.readFileSync(CONFIG_PATH);
    let data;
    if (safeStorage.isEncryptionAvailable()) {
      data = safeStorage.decryptString(raw);
    } else {
      data = raw.toString("utf8");
    }
    return JSON.parse(data);
  } catch {
    return { token: "", obsPwd: "" };
  }
}

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 320,
    resizable: false,
    title: "SocialSuite OBS Connector",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1a1a2e" : "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  mainWindow.setMenu(null);

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle("load-credentials", () => loadCredentials());

ipcMain.handle("connect", async (_e, { token, obsPwd }) => {
  saveCredentials(token, obsPwd);
  connector.stop();
  await new Promise(r => setTimeout(r, 200));
  connector.start(token, obsPwd);
  return { ok: true };
});

ipcMain.handle("disconnect", () => {
  connector.stop();
  return { ok: true };
});

// ─── Forward connector events to renderer ─────────────────────────────────────
function send(channel, ...args) {
  mainWindow?.webContents?.send(channel, ...args);
}

connector.on("relay-status",  (s)   => send("relay-status", s));
connector.on("obs-status",    (s)   => send("obs-status", s));
connector.on("authenticated", (id)  => send("authenticated", id));
connector.on("auth-failed",   (msg) => send("auth-failed", msg));
connector.on("error-msg",     (msg) => send("error-msg", msg));

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  // Auto-connect if credentials saved
  const creds = loadCredentials();
  if (creds.token) {
    connector.start(creds.token, creds.obsPwd);
  }
});

app.on("window-all-closed", () => {
  connector.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});
