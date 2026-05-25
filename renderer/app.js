const tokenEl = document.getElementById("token");
const pwEl    = document.getElementById("password");
const btn     = document.getElementById("btn");
const relayDot  = document.getElementById("relay-dot");
const relayText = document.getElementById("relay-text");
const obsDot    = document.getElementById("obs-dot");
const obsText   = document.getElementById("obs-text");
const errorMsg  = document.getElementById("error-msg");

let connected = false;

function setDot(dot, text, label, color) {
  dot.className = "dot dot-" + color;
  text.textContent = label;
}

function setRelay(state) {
  if (state === "online")          setDot(relayDot, relayText, "Verbunden",  "green");
  else if (state === "connecting") setDot(relayDot, relayText, "Verbinde…",  "amber");
  else                             setDot(relayDot, relayText, "Getrennt",   "grey");
}

function setObs(state) {
  if (state === "connected") setDot(obsDot, obsText, "Aktiv",    "green");
  else                       setDot(obsDot, obsText, "Getrennt", "grey");
}

function setConnected(val) {
  connected = val;
  btn.textContent  = val ? "Trennen" : "Verbinden";
  btn.className    = "btn " + (val ? "btn-disconnect" : "btn-connect");
  tokenEl.disabled = val;
  pwEl.disabled    = val;
}

window.api.onRelayStatus(s => {
  setRelay(s);
  if (s === "online")  { setConnected(true); errorMsg.textContent = ""; }
});

window.api.onObsStatus(s => setObs(s));

window.api.onAuthenticated(() => { errorMsg.textContent = ""; });

window.api.onAuthFailed(msg => {
  errorMsg.textContent = "Auth fehlgeschlagen: " + msg;
  setConnected(false);
  setRelay("offline");
});

window.api.onErrorMsg(msg => {
  errorMsg.textContent = "Fehler: " + msg;
});

btn.addEventListener("click", async () => {
  if (connected) {
    await window.api.disconnect();
    setConnected(false);
    setRelay("offline");
    setObs("disconnected");
    return;
  }
  const token  = tokenEl.value.trim();
  const obsPwd = pwEl.value;
  if (!token) { errorMsg.textContent = "Bitte Token eingeben."; return; }
  errorMsg.textContent = "";
  btn.disabled = true;
  await window.api.connect(token, obsPwd);
  btn.disabled = false;
});

window.api.loadCredentials().then(({ token, obsPwd }) => {
  if (token)  tokenEl.value = token;
  if (obsPwd) pwEl.value    = obsPwd;
});
