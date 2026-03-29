const STORAGE_KEY = "atlas-study-tracker-state-v1";
const THEME_KEY = "atlas-study-theme-v1";

let deferredPrompt = null;

const state = {
  sessions: [],
  dailyGoal: 2,
  timer: {
    running: false,
    paused: false,
    startTime: null,
    elapsedMs: 0,
    intervalId: null
  },
  firebaseReady: false,
  user: null,
  auth: null,
  db: null
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
  importBtn: document.getElementById("importBtn"),
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
  if (!el.toast) {
    console.log(message);
    return;
  }
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(showToast._timeout);
  showToast._timeout = setTimeout(() => {
    el.toast.classList.remove("show");
  }, 2200);
}

function saveLocalState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      sessions: state.sessions,
      dailyGoal: state.dailyGoal
    })
  );
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    state.dailyGoal =
      typeof parsed.dailyGoal === "number" && parsed.dailyGoal > 0
        ? parsed.dailyGoal
        : 2;
  } catch (err) {
    console.error("loadLocalState failed:", err);
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function hoursFromMs(ms) {
  return +(ms / 3600000).toFixed(2);
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function currentElapsedMs() {
  if (!state.timer.running) return state.timer.elapsedMs;
  if (state.timer.paused) return state.timer.elapsedMs;
  if (!state.timer.startTime) return state.timer.elapsedMs;
  return state.timer.elapsedMs + (Date.now() - state.timer.startTime);
}

function renderTimer() {
  if (el.timerDisplay) {
    el.timerDisplay.textContent = formatDuration(currentElapsedMs());
  }
  if (el.timerStatus) {
    if (!state.timer.running) {
      el.timerStatus.textContent = "Ready";
    } else if (state.timer.paused) {
      el.timerStatus.textContent = "Paused";
    } else {
      el.timerStatus.textContent = "Running";
    }
  }
}

function stopTick() {
  if (state.timer.intervalId) {
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
  }
}

function startTick() {
  stopTick();
  state.timer.intervalId = setInterval(renderTimer, 250);
}

function startTimer() {
  if (state.timer.running && !state.timer.paused) return;

  if (!state.timer.running) {
    state.timer.running = true;
    state.timer.paused = false;
    state.timer.elapsedMs = 0;
    state.timer.startTime = Date.now();
  } else if (state.timer.paused) {
    state.timer.paused = false;
    state.timer.startTime = Date.now();
  }

  startTick();
  renderTimer();
}

function pauseTimer() {
  if (!state.timer.running || state.timer.paused) return;
  state.timer.elapsedMs = currentElapsedMs();
  state.timer.paused = true;
  state.timer.startTime = null;
  stopTick();
  renderTimer();
}

function resetTimer() {
  stopTick();
  state.timer.running = false;
  state.timer.paused = false;
  state.timer.startTime = null;
  state.timer.elapsedMs = 0;
  renderTimer();
}

async function stopAndSaveSession() {
  const elapsedMs = currentElapsedMs();

  if (elapsedMs < 1000) {
    resetTimer();
    showToast("Nothing to save");
    return;
  }

  const now = new Date();
  const startedAt = new Date(now.getTime() - elapsedMs);
  const focusRaw = (el.focusRating?.value || "").trim();
  const focus =
    focusRaw === ""
      ? ""
      : String(Math.max(1, Math.min(5, Math.round(Number(focusRaw) || 1))));

  const session = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: (el.studyTitle?.value || "").trim() || "Study Session",
    category: (el.studyCategory?.value || "").trim() || "General",
    focus,
    notes: (el.studyNotes?.value || "").trim(),
    ms: elapsedMs,
    hours: hoursFromMs(elapsedMs),
    startedAt: startedAt.toISOString(),
    endedAt: now.toISOString()
  };

  state.sessions.unshift(session);
  saveLocalState();
  resetTimer();

  if (el.studyTitle) el.studyTitle.value = "";
  if (el.studyCategory) el.studyCategory.value = "";
  if (el.focusRating) el.focusRating.value = "";
  if (el.studyNotes) el.studyNotes.value = "";

  renderAll();
  showToast("Session saved");

  if (state.firebaseReady && state.user) {
    await pushLocalToCloud(true);
  }
}

function getTodayHours() {
  const start = todayStart();
  return state.sessions
    .filter((s) => new Date(s.startedAt) >= start)
    .reduce((sum, s) => sum + (s.hours || 0), 0);
}

function getWeekHours() {
  const start = weekStart();
  return state.sessions
    .filter((s) => new Date(s.startedAt) >= start)
    .reduce((sum, s) => sum + (s.hours || 0), 0);
}

function getStreak() {
  const dayKeys = new Set(
    state.sessions.map((s) => {
      const d = new Date(s.startedAt);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );

  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);

  while (true) {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dayKeys.has(key)) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function renderSnapshot() {
  if (el.todayHours) el.todayHours.textContent = `${getTodayHours().toFixed(2)}h`;
  if (el.weekHours) el.weekHours.textContent = `${getWeekHours().toFixed(2)}h`;
  if (el.streakCount) el.streakCount.textContent = String(getStreak());
  if (el.goalDisplay) el.goalDisplay.textContent = `${state.dailyGoal.toFixed(2)}h`;
  if (el.dailyGoalInput) el.dailyGoalInput.value = String(state.dailyGoal);
  if (el.sessionCount) {
    el.sessionCount.textContent = `${state.sessions.length} session${
      state.sessions.length === 1 ? "" : "s"
    }`;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return map[m];
  });
}

function deleteSession(id) {
  state.sessions = state.sessions.filter((s) => s.id !== id);
  saveLocalState();
  renderAll();
  showToast("Session deleted");
}

function renderSessions() {
  if (!el.sessionList) return;

  if (!state.sessions.length) {
    el.sessionList.innerHTML = `<div class="empty-state">No sessions yet. Start your timer and save one.</div>`;
    bindDeleteButtons();
    return;
  }

  el.sessionList.innerHTML = state.sessions
    .slice(0, 25)
    .map((s) => {
      const started = new Date(s.startedAt);
      return `
        <div class="session-card">
          <div class="session-top">
            <div>
              <div class="session-title">${escapeHtml(s.title)}</div>
              <div class="session-meta">${escapeHtml(s.category)}</div>
              <div class="session-date">${started.toLocaleString()}</div>
            </div>
            <div class="session-hours">${(s.hours || 0).toFixed(2)}h</div>
          </div>
          ${s.notes ? `<div class="session-notes">${escapeHtml(s.notes)}</div>` : ""}
          <button class="delete-session-btn" data-id="${s.id}">Delete</button>
        </div>
      `;
    })
    .join("");

  bindDeleteButtons();
}

function bindDeleteButtons() {
  document.querySelectorAll(".delete-session-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      deleteSession(btn.dataset.id);
      if (state.firebaseReady && state.user) {
        await pushLocalToCloud(true);
      }
    });
  });
}

function renderChart() {
  if (!el.hoursChart) return;

  const wrap = el.hoursChart;
  wrap.innerHTML = "";

  const labels = [];
  const values = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    const total = state.sessions
      .filter((s) => sameDay(new Date(s.startedAt), d))
      .reduce((sum, s) => sum + (s.hours || 0), 0);
    values.push(+total.toFixed(2));
  }

  const max = Math.max(...values, 0.25);

  values.forEach((value, index) => {
    const col = document.createElement("div");
    col.className = "bar-col";

    const top = document.createElement("div");
    top.className = "bar-value";
    top.textContent = value.toFixed(1);

    const track = document.createElement("div");
    track.className = "bar-track";

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.max(8, (value / max) * 140)}px`;

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = labels[index];

    track.appendChild(bar);
    col.appendChild(top);
    col.appendChild(track);
    col.appendChild(label);
    wrap.appendChild(col);
  });
}

function renderAll() {
  renderTimer();
  renderSnapshot();
  renderSessions();
  renderChart();
  updateCloudStatus();
}

function saveGoal() {
  const value = Number(el.dailyGoalInput?.value || 2);
  state.dailyGoal = value > 0 ? value : 2;
  saveLocalState();
  renderSnapshot();
  showToast("Goal saved");
}

function exportJson() {
  const payload = {
    sessions: state.sessions,
    dailyGoal: state.dailyGoal,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "atlas-study-backup.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Exported JSON");
}

function importJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      state.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
      state.dailyGoal =
        typeof parsed.dailyGoal === "number" && parsed.dailyGoal > 0
          ? parsed.dailyGoal
          : 2;
      saveLocalState();
      renderAll();
      showToast("Imported backup");

      if (state.firebaseReady && state.user) {
        await pushLocalToCloud(true);
      }
    } catch (err) {
      console.error(err);
      showToast("Import failed");
    }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm("Clear all local data?")) return;
  state.sessions = [];
  state.dailyGoal = 2;
  saveLocalState();
  renderAll();
  showToast("Local data cleared");
}

function addDemoData() {
  const now = new Date();
  state.sessions = [
    {
      id: String(Date.now()) + "-1",
      title: "Google IT Networking",
      category: "Google IT",
      focus: "4",
      notes: "Reviewed TCP vs UDP",
      ms: 5400000,
      hours: 1.5,
      startedAt: new Date(now.getTime() - 86400000).toISOString(),
      endedAt: new Date(now.getTime() - 32400000).toISOString()
    },
    {
      id: String(Date.now()) + "-2",
      title: "Cybersecurity Notes",
      category: "Codecademy",
      focus: "5",
      notes: "Encryption and basic cryptography",
      ms: 2700000,
      hours: 0.75,
      startedAt: now.toISOString(),
      endedAt: new Date(now.getTime() + 2700000).toISOString()
    }
  ];
  saveLocalState();
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
    showToast("Notifications denied");
  }
}

function applyTheme(theme) {
  if (theme === "light") {
    document.body.classList.add("light");
    if (el.themeBtn) el.themeBtn.textContent = "☀️";
  } else {
    document.body.classList.remove("light");
    if (el.themeBtn) el.themeBtn.textContent = "🌙";
  }
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);
}

function toggleTheme() {
  const next = document.body.classList.contains("light") ? "dark" : "light";
  applyTheme(next);
}

function initFirebase() {
  try {
    if (typeof firebase === "undefined" || !window.FIREBASE_CONFIG) {
      updateCloudStatus("Firebase not ready");
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    }

    state.auth = firebase.auth();
    state.db = firebase.firestore();
    state.firebaseReady = true;

    state.auth.onAuthStateChanged((user) => {
      state.user = user || null;
      if (el.authText) {
        el.authText.textContent = user
          ? `Logged in as ${user.email}`
          : "Firebase ready. Login to sync your sessions.";
      }
      updateCloudStatus();
    });
  } catch (err) {
    console.error("Firebase init failed:", err);
    updateCloudStatus("Firebase setup failed");
  }
}

function updateCloudStatus(message) {
  if (!el.cloudStatus) return;

  if (message) {
    el.cloudStatus.textContent = message;
    return;
  }

  if (!state.firebaseReady) {
    el.cloudStatus.textContent = "Firebase not ready";
  } else if (state.user) {
    el.cloudStatus.textContent = `Cloud connected: ${state.user.email}`;
  } else {
    el.cloudStatus.textContent = "Firebase ready";
  }
}

async function signUp() {
  if (!state.auth) {
    showToast("Firebase auth not ready");
    return;
  }
  const email = el.emailInput?.value?.trim();
  const password = el.passwordInput?.value?.trim();
  if (!email || !password) {
    showToast("Enter email and password");
    return;
  }
  try {
    await state.auth.createUserWithEmailAndPassword(email, password);
    showToast("Account created");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Signup failed");
  }
}

async function login() {
  if (!state.auth) {
    showToast("Firebase auth not ready");
    return;
  }
  const email = el.emailInput?.value?.trim();
  const password = el.passwordInput?.value?.trim();
  if (!email || !password) {
    showToast("Enter email and password");
    return;
  }
  try {
    await state.auth.signInWithEmailAndPassword(email, password);
    showToast("Logged in");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Login failed");
  }
}

async function logout() {
  if (!state.auth) return;
  try {
    await state.auth.signOut();
    showToast("Logged out");
  } catch (err) {
    console.error(err);
    showToast("Logout failed");
  }
}

async function pushLocalToCloud(showSuccessToast = false) {
  if (!state.db || !state.user) {
    if (!showSuccessToast) showToast("Login first to sync");
    return;
  }
  try {
    await state.db.collection("studySessions").doc(state.user.uid).set({
      sessions: state.sessions,
      dailyGoal: state.dailyGoal,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      email: state.user.email
    });
    if (showSuccessToast) {
      showToast("Synced to cloud");
    }
  } catch (err) {
    console.error(err);
    showToast("Cloud sync failed");
  }
}

function bindEvents() {
  el.startBtn?.addEventListener("click", startTimer);
  el.pauseBtn?.addEventListener("click", pauseTimer);
  el.stopBtn?.addEventListener("click", stopAndSaveSession);

  el.saveGoalBtn?.addEventListener("click", saveGoal);
  el.exportBtn?.addEventListener("click", exportJson);
  el.clearBtn?.addEventListener("click", clearAllData);
  el.seedBtn?.addEventListener("click", addDemoData);
  el.notifyBtn?.addEventListener("click", enableNotifications);
  el.themeBtn?.addEventListener("click", toggleTheme);

  el.signupBtn?.addEventListener("click", signUp);
  el.loginBtn?.addEventListener("click", login);
  el.logoutBtn?.addEventListener("click", logout);
  el.syncBtn?.addEventListener("click", () => pushLocalToCloud(true));

  el.importFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importJson(file);
    e.target.value = "";
  });
}

function initInstallPrompt() {
  ensureInstallButton();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (el.installBtn) {
      el.installBtn.style.display = "block";
    }
  });

  el.installBtn?.addEventListener("click", async () => {
    if (!deferredPrompt) {
      showToast("Install not available yet");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (el.installBtn) {
      el.installBtn.style.display = "none";
    }
  });

  window.addEventListener("appinstalled", () => {
    if (el.installBtn) {
      el.installBtn.style.display = "none";
    }
    showToast("App installed");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  ensureInstallButton();
  loadLocalState();
  initTheme();
  bindEvents();
  initFirebase();
  initInstallPrompt();
  renderAll();
});
