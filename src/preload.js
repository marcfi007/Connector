"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  loadCredentials: ()              => ipcRenderer.invoke("load-credentials"),
  connect:         (token, obsPwd) => ipcRenderer.invoke("connect", { token, obsPwd }),
  disconnect:      ()              => ipcRenderer.invoke("disconnect"),

  onRelayStatus:   (cb) => ipcRenderer.on("relay-status",  (_e, s)  => cb(s)),
  onObsStatus:     (cb) => ipcRenderer.on("obs-status",    (_e, s)  => cb(s)),
  onAuthenticated: (cb) => ipcRenderer.on("authenticated", (_e, id) => cb(id)),
  onAuthFailed:    (cb) => ipcRenderer.on("auth-failed",   (_e, m)  => cb(m)),
});
