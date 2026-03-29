const STORAGE_KEY = "atlas-study-tracker-v1";
const THEME_KEY = "atlas-study-theme-v1";

let state = {
  sessions: [],
  dailyGoal: 2,
  timer: {
    running: false,
    paused: false,
    startTime: null,
    elapsedMs: 0,
    intervalId: null
  },
  installPrompt: null,
  firebaseReady: false,
  user: null,
  db: null,
  auth: null
};

const el = {
  timerDisplay: document.getElementById("timerDisplay"),
  timerStatus: document.getElementById("timerStatus"),
  studyTitle: document.getElementById("studyTitle"),
  studyCategory: document.getElementById("studyCategory"),
  focusRating: document.getElementById("focusRating"),
  studyNotes: document.getElementById("studyNotes"),
  todayHours: document.getElementById("todayHours"),
  weekHours: document.getElementById("weekHours"),
  streakCount: document.getElementById("streakCount"),
  goalDisplay: document.getElementById("goalDisplay"),
  dailyGoalInput: document.getElementById("dailyGoalInput"),
  sessionList: document.getElementById("sessionList"),
  sessionCount: document.getElementById("sessionCount"),
  hoursChart: document.getElementById("hoursChart"),
  exportBtn: document.getElementById("exportBtn"),
  importFile: document.getElementById("importFile"),
  clearBtn: document.getElementById("clearBtn"),
  seedBtn: document.getElementById("seedBtn"),
  saveGoalBtn: document.getElementById("saveGoalBtn"),
  notifyBtn: document.getElementById("notifyBtn"),
  installBtn: document.getElementById("installBtn"),
  themeBtn: document.getElementById("themeBtn"),
  signupBtn: document.getElementById("signupBtn"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  emailInput: document.getElementById("emailInput"),
  passwordInput: document.getElementById("passwordInput"),
  authText: document.getElementById("authText"),
  cloudStatus: document.getElementById("cloudStatus"),
  syncBtn: document.getElementById("syncBtn"),
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  stopBtn: document.getElementById("stopBtn"),
  toast: document.getElementById("toast")
};

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => {
    el.toast.classList.remove("show");
  }, 2300);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatHours(ms) {
  return (ms / 3600000).toFixed(2);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.sessions = Array.isArray(saved.sessions) ? saved.sessions : [];
    state.dailyGoal = Number(saved.dailyGoal) > 0 ? Number(saved.dailyGoal) : 2;
  } catch {
    state.sessions = [];
    state.dailyGoal = 2;
  }
}

function persistState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      sessions: state.sessions,
      dailyGoal: state.dailyGoal
    })
  );
}

function applyTheme() {
  const theme = localStorage.getItem(THEME_KEY) || "dark";
  if (theme === "light") {
    document.documentElement.style.setProperty("--bg-1", "#dbeafe");
    document.documentElement.style.setProperty("--bg-2", "#eff6ff");
    document.documentElement.style.setProperty("--bg-3", "#bfdbfe");
    document.documentElement.style.setProperty("--card", "rgba(255,255,255,.55)");
    document.documentElement.style.setProperty("--card-strong", "rgba(255,255,255,.72)");
    document.documentElement.style.setProperty("--border", "rgba(15,23,42,.10)");
    document.documentElement.style.setProperty("--text", "#0f172a");
    document.documentElement.style.setProperty("--muted", "#42526b");
    el.themeBtn.textContent = "☀️";
  } else {
    document.documentElement.style.setProperty("--bg-1", "#020617");
    document.documentElement.style.setProperty("--bg-2", "#0f172a");
    document.documentElement.style.setProperty("--bg-3", "#1e293b");
    document.documentElement.style.setProperty("--card", "rgba(255,255,255,.10)");
    document.documentElement.style.setProperty("--card-strong", "rgba(255,255,255,.14)");
    document.documentElement.style.setProperty("--border", "rgba(255,255,255,.14)");
    document.documentElement.style.setProperty("--text", "#e5eefc");
    document.documentElement.style.setProperty("--muted", "#9fb0cf");
    el.themeBtn.textContent = "🌙";
  }
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || "dark";
  localStorage.setItem(THEME_KEY, current === "dark" ? "light" : "dark");
  applyTheme();
}

function isSameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  return d;
}

function getTodayMs() {
  const today = new Date();
  return state.sessions
    .filter(s => isSameDay(s.date, today))
    .reduce((sum, s) => sum + Number(s.durationMs || 0), 0);
}

function getWeekMs() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0,0,0,0);

  return state.sessions
    .filter(s => new Date(s.date) >= monday)
    .reduce((sum, s) => sum + Number(s.durationMs || 0), 0);
}

function getStreak() {
  if (!state.sessions.length) return 0;

  const daySet = new Set(state.sessions.map(s => startOfDay(s.date).getTime()));
  let streak = 0;
  let cursor = startOfDay(new Date());

  while (daySet.has(cursor.getTime())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function updateStats() {
  el.todayHours.textContent = `${formatHours(getTodayMs())}h`;
  el.weekHours.textContent = `${formatHours(getWeekMs())}h`;
  el.streakCount.textContent = String(getStreak());
  el.goalDisplay.textContent = `${Number(state.dailyGoal).toFixed(2)}h`;
  el.dailyGoalInput.value = state.dailyGoal;
  el.sessionCount.textContent = `${state.sessions.length} session${state.sessions.length === 1 ? "" : "s"}`;

  if (getTodayMs() >= state.dailyGoal * 3600000) {
    el.goalDisplay.textContent += " ✅";
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSessions() {
  if (!state.sessions.length) {
    el.sessionList.innerHTML = `<div class="hint">No sessions yet. Start your timer and save one.</div>`;
    return;
  }

  const sorted = [...state.sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
  el.sessionList.innerHTML = sorted.map((s, index) => {
    const title = escapeHtml(s.title || "Untitled Session");
    const category = escapeHtml(s.category || "General");
    const notes = escapeHtml(s.notes || "");
    const focus = s.focus ? ` • Focus ${escapeHtml(s.focus)}/5` : "";
    const dateText = new Date(s.date).toLocaleString();
    return `
      <div class="session-item">
        <div class="session-top">
          <div class="session-name">${title}</div>
          <div class="pill">${formatHours(s.durationMs)}h</div>
        </div>
        <div class="meta">${category}${focus}</div>
        <div class="meta">${dateText}</div>
        ${notes ? `<div class="meta">${notes}</div>` : ""}
        <div>
          <button class="btn secondary" onclick="deleteSession('${s.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

function deleteSession(id) {
  state.sessions = state.sessions.filter(s => s.id !== id);
  persistState();
  renderAll();
  showToast("Session deleted");
}

window.deleteSession = deleteSession;

function getLast7DaysData() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - i);

    const total = state.sessions
      .filter(s => isSameDay(s.date, d))
      .reduce((sum, s) => sum + Number(s.durationMs || 0), 0);

    out.push({
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      hours: total / 3600000
    });
  }
  return out;
}

function drawChart() {
  const canvas = el.hoursChart;
  const ctx = canvas.getContext("2d");
  const data = getLast7DaysData();

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const left = 48;
  const right = 20;
  const top = 18;
  const bottom = 36;
  const chartW = w - left - right;
  const chartH = h - top - bottom;
  const max = Math.max(1, ...data.map(d => d.hours));

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = top + (chartH / 4) * i;
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + chartW, y);
    ctx.stroke();

    const labelVal = ((max * (4 - i)) / 4).toFixed(1);
    ctx.fillStyle = "rgba(200,220,255,.8)";
    ctx.font = "12px Inter, sans-serif";
    ctx.fillText(labelVal, 8, y + 4);
  }

  const barGap = 18;
  const barW = (chartW - barGap * (data.length - 1)) / data.length;

  data.forEach((item, i) => {
    const x = left + i * (barW + barGap);
    const barH = (item.hours / max) * chartH;
    const y = top + chartH - barH;

    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, "rgba(96,165,250,.95)");
    grad.addColorStop(1, "rgba(34,197,94,.78)");

    ctx.fillStyle = grad;
    roundRect(ctx, x, y, barW, barH, 12);
    ctx.fill();

    ctx.fillStyle = "rgba(225,236,255,.92)";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(item.label, x + barW / 2, h - 12);

    ctx.fillStyle = "rgba(255,255,255,.90)";
    ctx.fillText(item.hours.toFixed(1), x + barW / 2, y - 8);
  });

  ctx.textAlign = "left";
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function renderAll() {
  updateStats();
  renderSessions();
  drawChart();
}

function updateTimerUi() {
  let displayMs = state.timer.elapsedMs;
  if (state.timer.running && state.timer.startTime) {
    displayMs += Date.now() - state.timer.startTime;
  }
  el.timerDisplay.textContent = formatDuration(displayMs);

  if (state.timer.running) {
    el.timerStatus.textContent = "Running";
  } else if (state.timer.paused) {
    el.timerStatus.textContent = "Paused";
  } else {
    el.timerStatus.textContent = "Ready";
  }
}

function startTimer() {
  if (state.timer.running) return;

  state.timer.running = true;
  state.timer.paused = false;
  state.timer.startTime = Date.now();
  state.timer.intervalId = window.setInterval(updateTimerUi, 250);
  updateTimerUi();
  showToast("Timer started");
}

function pauseTimer() {
  if (!state.timer.running) return;
  state.timer.elapsedMs += Date.now() - state.timer.startTime;
  state.timer.running = false;
  state.timer.paused = true;
  state.timer.startTime = null;
  window.clearInterval(state.timer.intervalId);
  updateTimerUi();
  showToast("Timer paused");
}

function resetTimerState() {
  state.timer.running = false;
  state.timer.paused = false;
  state.timer.startTime = null;
  state.timer.elapsedMs = 0;
  window.clearInterval(state.timer.intervalId);
  updateTimerUi();
}

function stopAndSaveTimer() {
  if (!state.timer.running && !state.timer.paused) {
    showToast("No timer to save");
    return;
  }

  if (state.timer.running) {
    state.timer.elapsedMs += Date.now() - state.timer.startTime;
  }

  const durationMs = state.timer.elapsedMs;
  if (durationMs < 1000) {
    resetTimerState();
    showToast("Session too short");
    return;
  }

  const session = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    title: el.studyTitle.value.trim() || "Untitled Session",
    category: el.studyCategory.value.trim() || "General",
    focus: el.focusRating.value.trim(),
    notes: el.studyNotes.value.trim(),
    durationMs,
    date: new Date().toISOString()
  };

  state.sessions.push(session);
  persistState();
  renderAll();
  maybeCelebrateGoal();
  maybeNotifyStreak();
  if (state.firebaseReady && state.user) {
    pushLocalToCloud();
  }

  el.studyTitle.value = "";
  el.studyCategory.value = "";
  el.focusRating.value = "";
  el.studyNotes.value = "";

  resetTimerState();
  showToast("Session saved");
}

function maybeCelebrateGoal() {
  const todayMs = getTodayMs();
  if (todayMs >= state.dailyGoal * 3600000) {
    showToast("Daily goal hit ✅");
  }
}

function maybeNotifyStreak() {
  if ("Notification" in window && Notification.permission === "granted") {
    const streak = getStreak();
    new Notification("Study session saved", {
      body: `Current streak: ${streak} day${streak === 1 ? "" : "s"}`
    });
  }
}

function saveGoal() {
  const val = Number(el.dailyGoalInput.value);
  if (!val || val <= 0) {
    showToast("Enter a valid goal");
    return;
  }
  state.dailyGoal = val;
  persistState();
  renderAll();
  showToast("Goal updated");
}

function exportJson() {
  const blob = new Blob(
    [JSON.stringify({ sessions: state.sessions, dailyGoal: state.dailyGoal }, null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "atlas-study-tracker-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Exported");
}

function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
      state.dailyGoal = Number(data.dailyGoal) > 0 ? Number(data.dailyGoal) : state.dailyGoal;
      persistState();
      renderAll();
      showToast("Import complete");
    } catch {
      showToast("Invalid JSON file");
    }
    event.target.value = "";
  };
  reader.readAsText(file);
}

function clearAll() {
  if (!confirm("Delete all local study data?")) return;
  state.sessions = [];
  persistState();
  renderAll();
  resetTimerState();
  showToast("Local data cleared");
}

function addDemoData() {
  const now = new Date();
  const demo = [];
  const labels = [
    ["Google IT Networking", "Google IT"],
    ["Intro to Cybersecurity", "Codecademy"],
    ["A+ Review", "CompTIA"],
    ["SQL Basics", "Database"]
  ];

  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - Math.floor(Math.random() * 7));
    d.setHours(5 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);

    const pick = labels[i % labels.length];
    demo.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + i),
      title: pick[0],
      category: pick[1],
      focus: String(3 + (i % 3)),
      notes: "Demo session",
      durationMs: (30 + Math.floor(Math.random() * 75)) * 60000,
      date: d.toISOString()
    });
  }

  state.sessions = [...state.sessions, ...demo];
  persistState();
  renderAll();
  showToast("Demo data added");
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    showToast("Notifications not supported");
    return;
  }
  const result = await Notification.requestPermission();
  if (result === "granted") {
    showToast("Notifications enabled");
  } else {
    showToast("Notifications not enabled");
  }
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.installPrompt = e;
    el.installBtn.classList.remove("hidden");
  });

  el.installBtn.addEventListener("click", async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    el.installBtn.classList.add("hidden");
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      console.warn("SW registration failed");
    });
  }
}

function firebaseConfigured() {
  const cfg = window.FIREBASE_CONFIG || {};
  return Boolean(
    cfg.apiKey &&
    cfg.authDomain &&
    cfg.projectId &&
    cfg.appId
  );
}

function setupFirebase() {
  if (typeof firebase === "undefined" || !firebaseConfigured()) {
    el.authText.textContent = "Firebase not configured yet. App works fully in local mode until you add your Firebase keys.";
    el.cloudStatus.textContent = "Local mode";
    return;
  }

  try {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    state.auth = firebase.auth();
    state.db = firebase.firestore();
    state.firebaseReady = true;
    el.authText.textContent = "Firebase ready. You can sign up, login, and sync your sessions.";
    el.cloudStatus.textContent = "Cloud ready";

    state.auth.onAuthStateChanged(async (user) => {
      state.user = user || null;
      if (user) {
        el.authText.textContent = `Logged in as ${user.email}`;
        el.cloudStatus.textContent = "Cloud connected";
        await pullCloudToLocal();
      } else {
        if (state.firebaseReady) {
          el.authText.textContent = "Firebase ready. Login to sync your sessions.";
          el.cloudStatus.textContent = "Cloud ready";
        }
      }
    });
  } catch (err) {
    console.error(err);
    el.authText.textContent = "Firebase init failed. Check your config.";
    el.cloudStatus.textContent = "Cloud error";
  }
}

async function signup() {
  if (!state.firebaseReady) {
    showToast("Add Firebase config first");
    return;
  }
  const email = el.emailInput.value.trim();
  const password = el.passwordInput.value.trim();
  if (!email || !password) {
    showToast("Enter email and password");
    return;
  }
  try {
    await state.auth.createUserWithEmailAndPassword(email, password);
    showToast("Account created");
  } catch (err) {
    showToast(err.message || "Signup failed");
  }
}

async function login() {
  if (!state.firebaseReady) {
    showToast("Add Firebase config first");
    return;
  }
  const email = el.emailInput.value.trim();
  const password = el.passwordInput.value.trim();
  if (!email || !password) {
    showToast("Enter email and password");
    return;
  }
  try {
    await state.auth.signInWithEmailAndPassword(email, password);
    showToast("Logged in");
  } catch (err) {
    showToast(err.message || "Login failed");
  }
}

async function logout() {
  if (!state.firebaseReady || !state.auth) {
    showToast("Not logged in");
    return;
  }
  await state.auth.signOut();
  showToast("Logged out");
}

async function pushLocalToCloud() {
  if (!state.firebaseReady || !state.user || !state.db) {
    showToast("Login first for cloud sync");
    return;
  }
  try {
    await state.db.collection("users").doc(state.user.uid).set({
      sessions: state.sessions,
      dailyGoal: state.dailyGoal,
      updatedAt: new Date().toISOString()
    });
    showToast("Synced to cloud");
  } catch (err) {
    console.error(err);
    showToast("Cloud sync failed");
  }
}

async function pullCloudToLocal() {
  if (!state.firebaseReady || !state.user || !state.db) return;

  try {
    const doc = await state.db.collection("users").doc(state.user.uid).get();
    if (!doc.exists) {
      el.authText.textContent = `Logged in as ${state.user.email}. No cloud data yet.`;
      return;
    }

    const data = doc.data() || {};
    const cloudSessions = Array.isArray(data.sessions) ? data.sessions : [];
    const cloudGoal = Number(data.dailyGoal) > 0 ? Number(data.dailyGoal) : state.dailyGoal;

    if (cloudSessions.length || data.dailyGoal) {
      state.sessions = cloudSessions;
      state.dailyGoal = cloudGoal;
      persistState();
      renderAll();
      showToast("Cloud data loaded");
    }

    el.authText.textContent = `Logged in as ${state.user.email}`;
  } catch (err) {
    console.error(err);
    showToast("Cloud load failed");
  }
}

function bindEvents() {
  el.startBtn.addEventListener("click", startTimer);
  el.pauseBtn.addEventListener("click", pauseTimer);
  el.stopBtn.addEventListener("click", stopAndSaveTimer);
  el.saveGoalBtn.addEventListener("click", saveGoal);
  el.exportBtn.addEventListener("click", exportJson);
  el.importFile.addEventListener("change", importJson);
  el.clearBtn.addEventListener("click", clearAll);
  el.seedBtn.addEventListener("click", addDemoData);
  el.notifyBtn.addEventListener("click", enableNotifications);
  el.themeBtn.addEventListener("click", toggleTheme);
  el.signupBtn.addEventListener("click", signup);
  el.loginBtn.addEventListener("click", login);
  el.logoutBtn.addEventListener("click", logout);
  el.syncBtn.addEventListener("click", pushLocalToCloud);
}

function init() {
  loadState();
  applyTheme();
  bindEvents();
  setupInstallPrompt();
  registerServiceWorker();
  setupFirebase();
  renderAll();
  updateTimerUi();
}

window.addEventListener("load", init);
