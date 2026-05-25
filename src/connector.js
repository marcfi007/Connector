"use strict";
const { EventEmitter } = require("events");
const WebSocket = require("ws");

const RELAY_URL = "wss://tool.blazedherotv.de/obs-connector/ws";
const OBS_URL = "ws://127.0.0.1:4455";
const AGENT_VERSION = "1.1.0";
const HEARTBEAT_MS = 25_000;

class ConnectorService extends EventEmitter {
  constructor() {
    super();
    this._token = "";
    this._obsPwd = "";
    this._relay = null;
    this._obs = null;
    this._obsConnected = false;
    this._authenticated = false;
    this._stopping = false;
    this._reconnectMs = 2000;
    this._heartbeatTimer = null;
    this._reconnectTimer = null;
  }

  async start(token, obsPwd) {
    this._token = token;
    this._obsPwd = obsPwd;
    this._stopping = false;
    this._reconnectMs = 2000;

    // Try OBS first (non-blocking)
    this._connectObs().catch(() => {});
    this._connectRelay();
  }

  stop() {
    this._stopping = true;
    clearTimeout(this._reconnectTimer);
    clearInterval(this._heartbeatTimer);
    if (this._relay) {
      try { this._relay.close(); } catch {}
      this._relay = null;
    }
    if (this._obs) {
      try { this._obs.disconnect(); } catch {}
      this._obs = null;
    }
    this._obsConnected = false;
    this._authenticated = false;
    this.emit("relay-status", "offline");
    this.emit("obs-status", "disconnected");
  }

  async _connectObs() {
    try {
      // Dynamic import of ESM obs-websocket-js
      if (!this._OBSWebSocket) {
        const mod = await import("obs-websocket-js");
        this._OBSWebSocketClass = mod.default;
      }
      if (this._obs) {
        try { await this._obs.disconnect(); } catch {}
      }
      this._obs = new this._OBSWebSocketClass();
      await this._obs.connect(OBS_URL, this._obsPwd, { rpcVersion: 1 });
      this._obsConnected = true;
      this.emit("obs-status", "connected");
    } catch {
      this._obsConnected = false;
      this.emit("obs-status", "disconnected");
    }
  }

  async _ensureObs() {
    if (this._obs && this._obsConnected) return;
    await this._connectObs();
    if (!this._obsConnected) throw new Error("OBS nicht erreichbar");
  }

  _connectRelay() {
    if (this._stopping) return;
    this.emit("relay-status", "connecting");

    const ws = new WebSocket(RELAY_URL, { handshakeTimeout: 20_000 });
    this._relay = ws;

    ws.on("open", () => {
      this._reconnectMs = 2000;
      ws.send(JSON.stringify({ type: "auth", token: this._token, agentVersion: AGENT_VERSION }));
    });

    ws.on("message", (data) => {
      void this._handleMessage(data.toString(), ws);
    });

    ws.on("close", (code) => {
      if (ws !== this._relay) return;
      this._authenticated = false;
      this.emit("relay-status", "offline");
      this._scheduleReconnect();
    });

    ws.on("error", (err) => {
      if (ws !== this._relay) return;
      this.emit("error-msg", err.message || "Verbindungsfehler");
      if (!this._authenticated) this.emit("relay-status", "offline");
    });

    // Heartbeat
    clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      }
    }, HEARTBEAT_MS);
  }

  _scheduleReconnect() {
    if (this._stopping) return;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectMs = Math.min(this._reconnectMs * 1.5, 60_000);
      this._connectRelay();
    }, this._reconnectMs);
  }

  async _handleMessage(raw, ws) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case "auth_ok":
        this._authenticated = true;
        this.emit("relay-status", "online");
        this.emit("authenticated", msg.credentialId);
        // Retry OBS if not connected
        if (!this._obsConnected) this._connectObs().catch(() => {});
        break;

      case "auth_fail":
        this.emit("auth-failed", msg.error || "Token ungültig");
        this._stopping = true;
        ws.close();
        break;

      case "ping":
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        break;

      case "pong":
        break;

      case "rpc":
        if (typeof msg.id !== "string" || typeof msg.requestType !== "string") break;
        try {
          await this._ensureObs();
          const responseData = await this._obs.call(msg.requestType, msg.requestData || {});
          ws.send(JSON.stringify({ type: "rpc_result", id: msg.id, ok: true, responseData }));
        } catch (e) {
          ws.send(JSON.stringify({ type: "rpc_result", id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) }));
        }
        break;
    }
  }
}

module.exports = { ConnectorService };
