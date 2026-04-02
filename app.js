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
    intervalId: null,
  },
  firebaseReady: false,
  user: null,
  auth: null,
  db: null,
};

const el = {
  timerDisplay: document.getElementById("timerDisplay"),
  timerStatus: document.getElementById("timerStatus"),
  timerBox: document.getElementById("timerBox"),
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
  installBtn: document.getElementById("installBtn"),
  toast: document.getElementById("toast"),
  authForm: document.getElementById("authForm"),
};

/* ─── Toast ─────────────────────────────────────────────── */

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
  }, 2600);
}

/* ─── Local persistence ──────────────────────────────────── */

function saveLocalState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ sessions: state.sessions, dailyGoal: state.dailyGoal }),
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
    console.error(err);
  }
}

/* ─── Time utilities ─────────────────────────────────────── */

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

/* ─── Timer ──────────────────────────────────────────────── */

function currentElapsedMs() {
  if (!state.timer.running) return state.timer.elapsedMs;
  if (state.timer.paused) return state.timer.elapsedMs;
  if (!state.timer.startTime) return state.timer.elapsedMs;
  return state.timer.elapsedMs + (Date.now() - state.timer.startTime);
}

function updateTimerBoxState() {
  const isRunning = state.timer.running && !state.timer.paused;
  const isPaused = state.timer.paused;

  if (el.timerBox) {
    el.timerBox.classList.toggle("running", isRunning);
    el.timerBox.classList.toggle("paused", isPaused);
  }
  if (el.timerDisplay) {
    el.timerDisplay.classList.toggle("running", isRunning);
    el.timerDisplay.classList.toggle("paused", isPaused);
  }
  if (el.timerStatus) {
    el.timerStatus.classList.toggle("running", isRunning);
    el.timerStatus.classList.toggle("paused", isPaused);
  }
}

function renderTimer() {
  if (el.timerDisplay)
    el.timerDisplay.textContent = formatDuration(currentElapsedMs());
  if (el.timerStatus) {
    if (!state.timer.running) el.timerStatus.textContent = "Ready";
    else if (state.timer.paused) el.timerStatus.textContent = "Paused";
    else el.timerStatus.textContent = "Running";
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
  updateTimerBoxState();
  renderTimer();
}

function pauseTimer() {
  if (!state.timer.running || state.timer.paused) return;
  state.timer.elapsedMs = currentElapsedMs();
  state.timer.paused = true;
  state.timer.startTime = null;
  stopTick();
  updateTimerBoxState();
  renderTimer();
}

function resetTimer() {
  stopTick();
  state.timer.running = false;
  state.timer.paused = false;
  state.timer.startTime = null;
  state.timer.elapsedMs = 0;
  updateTimerBoxState();
  renderTimer();
}

async function stopAndSaveTimer() {
  const elapsedMs = currentElapsedMs();
  if (elapsedMs < 1000) {
    resetTimer();
    showToast("Nothing to save");
    return;
  }

  const now = new Date();
  const startedAt = new Date(now.getTime() - elapsedMs);

  const session = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: (el.studyTitle?.value || "").trim() || "Study Session",
    category: (el.studyCategory?.value || "").trim() || "General",
    focus: (el.focusRating?.value || "").trim(),
    notes: (el.studyNotes?.value || "").trim(),
    ms: elapsedMs,
    hours: hoursFromMs(elapsedMs),
    startedAt: startedAt.toISOString(),
    endedAt: now.toISOString(),
  };

  state.sessions.unshift(session);
  if (state.user) await saveSessionToFirebase(session);
  saveLocalState();
  resetTimer();

  if (el.studyTitle) el.studyTitle.value = "";
  if (el.studyCategory) el.studyCategory.value = "";
  if (el.focusRating) el.focusRating.value = "";
  if (el.studyNotes) el.studyNotes.value = "";

  renderAll();
  showToast("Session saved" + (state.user ? " · syncing…" : ""));

  // Auto-push to cloud when logged in
  // if (state.user) await pushLocalToCloud(false);
}

/* ─── Stats calculations ────────────────────── ��──────────── */

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
    }),
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

/* ─── Render ─────────────────────────────────────────────── */

function renderSnapshot() {
  if (el.todayHours)
    el.todayHours.textContent = `${getTodayHours().toFixed(2)}h`;
  if (el.weekHours) el.weekHours.textContent = `${getWeekHours().toFixed(2)}h`;
  if (el.streakCount) el.streakCount.textContent = String(getStreak());
  if (el.goalDisplay)
    el.goalDisplay.textContent = `${state.dailyGoal.toFixed(2)}h`;
  if (el.dailyGoalInput) el.dailyGoalInput.value = String(state.dailyGoal);
  if (el.sessionCount) {
    el.sessionCount.textContent = `${state.sessions.length} session${state.sessions.length === 1 ? "" : "s"}`;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[m];
  });
}

function deleteSession(id) {
  state.sessions = state.sessions.filter((s) => s.id !== id);
  saveLocalState();
  renderAll();
  showToast("Session deleted");
  // Auto-push to cloud when logged in
  if (state.user) pushLocalToCloud(false);
}

function renderSessions() {
  if (!el.sessionList) return;

  if (!state.sessions.length) {
    el.sessionList.innerHTML = `<div class="empty-state">No sessions yet. Start your timer and save one.</div>`;
    return;
  }

  el.sessionList.innerHTML = state.sessions
    .slice(0, 25)
    .map((s) => {
      const started = new Date(s.startedAt);
      const focusBadge = s.focus
        ? `<span style="margin-left:6px;opacity:0.7;">· Focus ${escapeHtml(s.focus)}/5</span>`
        : "";
      return `
        <div class="session-card">
          <div class="session-top">
            <div style="min-width:0;">
              <div class="session-title">${escapeHtml(s.title)}</div>
              <div class="session-meta">${escapeHtml(s.category)}${focusBadge}</div>
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

  document.querySelectorAll(".delete-session-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteSession(btn.dataset.id));
  });
}

function renderChart() {
  if (!el.hoursChart) return;

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(today);
    dayStart.setDate(today.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);

    const hours = state.sessions
      .filter((s) => {
        const t = new Date(s.startedAt);
        return t >= dayStart && t < dayEnd;
      })
      .reduce((sum, s) => sum + (s.hours || 0), 0);

    days.push({
      label: DAY_LABELS[dayStart.getDay()],
      hours,
      isToday: i === 0,
    });
  }

  const maxHours = Math.max(...days.map((d) => d.hours), state.dailyGoal, 0.5);

  el.hoursChart.innerHTML = days
    .map((day) => {
      const pct = Math.min((day.hours / maxHours) * 100, 100);
      const height = Math.max(pct, 2);
      const valueLabel = day.hours > 0 ? day.hours.toFixed(1) : "";
      return `
        <div class="bar-col">
          <div class="bar-value">${escapeHtml(valueLabel)}</div>
          <div class="bar-track">
            <div class="bar ${day.isToday ? "bar-today" : ""}" style="height:${height}%"></div>
          </div>
          <div class="bar-label ${day.isToday ? "bar-label-today" : ""}">${day.label}</div>
        </div>
      `;
    })
    .join("");
}

function renderAll() {
  renderTimer();
  renderSnapshot();
  renderSessions();
  renderChart();
  updateCloudStatus();
}

/* ─── Goal ───────────────────────────────────────────────── */

async function saveGoal() {
  const value = Number(el.dailyGoalInput?.value || 2);
  state.dailyGoal = value > 0 ? value : 2;
  saveLocalState();
  renderSnapshot();
  renderChart();
  showToast("Goal saved");
  // Auto-push to cloud when logged in
  if (state.user) await pushLocalToCloud(false);
}

/* ─── Export / Import / Clear / Demo ────────────────────── */

function exportJson() {
  const payload = {
    sessions: state.sessions,
    dailyGoal: state.dailyGoal,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
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
      if (state.user) await pushLocalToCloud(false);
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
      startedAt: new Date(now.getTime() - 86400000 * 1).toISOString(),
      endedAt: new Date(now.getTime() - 86400000 * 1 + 5400000).toISOString(),
    },
    {
      id: String(Date.now()) + "-2",
      title: "Python Basics",
      category: "Codecademy",
      focus: "5",
      notes: "Lists, dicts, functions",
      ms: 3600000,
      hours: 1.0,
      startedAt: new Date(now.getTime() - 86400000 * 2).toISOString(),
      endedAt: new Date(now.getTime() - 86400000 * 2 + 3600000).toISOString(),
    },
    {
      id: String(Date.now()) + "-3",
      title: "SQL Fundamentals",
      category: "Database",
      focus: "3",
      notes: "JOINs and subqueries",
      ms: 7200000,
      hours: 2.0,
      startedAt: new Date(now.getTime() - 86400000 * 4).toISOString(),
      endedAt: new Date(now.getTime() - 86400000 * 4 + 7200000).toISOString(),
    },
    {
      id: String(Date.now()) + "-4",
      title: "React Hooks Deep Dive",
      category: "Frontend",
      focus: "5",
      notes: "useEffect, useCallback, useMemo",
      ms: 4500000,
      hours: 1.25,
      startedAt: new Date(now.getTime() - 86400000 * 5).toISOString(),
      endedAt: new Date(now.getTime() - 86400000 * 5 + 4500000).toISOString(),
    },
  ];
  saveLocalState();
  renderAll();
  showToast("Demo data added");
}

/* ─── Notifications ──────────────────────────────────────── */

async function enableNotifications() {
  if (!("Notification" in window)) {
    showToast("Notifications not supported");
    return;
  }
  const result = await Notification.requestPermission();
  showToast(
    result === "granted" ? "Notifications enabled" : "Notifications denied",
  );
}

/* ─── Theme ──────────────────────────────────────────────── */

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

/* ─── Firebase auth error → human message ────────────────── */

function parseAuthError(err) {
  const code = err.code || "";
  const map = {
    "auth/email-already-in-use": "That email is already registered.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts — try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/operation-not-allowed": "Email/password sign-in is not enabled.",
  };
  return map[code] || err.message || "Something went wrong.";
}

/* ─── Auth UI state ──────────────────────────────────────── */

function updateAuthUI() {
  const loggedIn = !!state.user;

  // Hide email/password form fields and sign-up/login buttons when logged in
  const showWhenLoggedOut = [
    el.emailInput,
    el.passwordInput,
    el.signupBtn,
    el.loginBtn,
  ];
  const showWhenLoggedIn = [el.logoutBtn, el.syncBtn];

  showWhenLoggedOut.forEach((node) => {
    if (node) node.style.display = loggedIn ? "none" : "";
  });
  showWhenLoggedIn.forEach((node) => {
    if (node) node.style.display = loggedIn ? "" : "none";
  });

  if (el.authText) {
    el.authText.textContent = loggedIn
      ? `Signed in as ${state.user.email}`
      : "Create an account or login to sync your sessions across devices.";
  }
}

/* ─── Firebase init ──────────────────────────────────────── */

function updateCloudStatus(message) {
  if (!el.cloudStatus) return;
  if (message) {
    el.cloudStatus.textContent = message;
    return;
  }
  if (!state.firebaseReady) el.cloudStatus.textContent = "Offline";
  else if (state.user) el.cloudStatus.textContent = `☁ ${state.user.email}`;
  else el.cloudStatus.textContent = "Local mode";
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

    state.auth.onAuthStateChanged(async (user) => {
      state.user = user || null;
      updateCloudStatus();
      updateAuthUI();

      if (user) {
        await loadFromCloud(true);
      } else {
        // Restore local state on logout
        loadLocalState();
        renderAll();
      }
    });
  } catch (err) {
    console.error(err);
    updateCloudStatus("Firebase error");
  }
}

/* ─── Cloud sync ─────────────────────────────────────────── */

async function pushLocalToCloud(showSuccessToast = false) {
  if (!state.db || !state.user) {
    if (showSuccessToast) showToast("Login first to sync");
    return;
  }
  try {
    await state.db.collection("studySessions").doc(state.user.uid).set({
      sessions: state.sessions,
      dailyGoal: state.dailyGoal,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      email: state.user.email,
    });
    updateCloudStatus();
    if (showSuccessToast) showToast("Synced to cloud ☁");
  } catch (err) {
    console.error(err);
  }
}

async function loadFromCloud(showSuccessToast = false) {
  if (!state.db || !state.user) return;
  try {
    const snapshot = await state.db
      .collection("users")
      .doc(state.user.uid)
      .collection("studySessions")
      .orderBy("createdAt", "desc")
      .get();

    const sessions = [];
    snapshot.forEach(doc => {
      sessions.push(doc.data());
    });

    state.sessions = sessions;
    renderAll();
    return;
    } catch (err) {
      console.error(err);
      if (showSuccessToast) showToast("Cloud sync failed");
    }
    }
   

    
   
}

/* ─── Auth actions ───────────────────────────────────────── */

async function signUp() {
  if (!state.auth) return showToast("Firebase not ready");
  const email = el.emailInput?.value?.trim();
  const password = el.passwordInput?.value?.trim();
  if (!email || !password) return showToast("Enter email and password");
  try {
    el.signupBtn && (el.signupBtn.disabled = true);
    await state.auth.createUserWithEmailAndPassword(email, password);
    if (el.passwordInput) el.passwordInput.value = "";
    showToast("Account created — welcome!");
  } catch (err) {
    console.error(err);
    showToast(parseAuthError(err));
  } finally {
    el.signupBtn && (el.signupBtn.disabled = false);
  }
}

async function login() {
  if (!state.auth) return showToast("Firebase not ready");
  const email = el.emailInput?.value?.trim();
  const password = el.passwordInput?.value?.trim();
  if (!email || !password) return showToast("Enter email and password");
  try {
    el.loginBtn && (el.loginBtn.disabled = true);
    await state.auth.signInWithEmailAndPassword(email, password);
    if (el.passwordInput) el.passwordInput.value = "";
    showToast("Logged in");
  } catch (err) {
    console.error(err);
    showToast(parseAuthError(err));
  } finally {
    el.loginBtn && (el.loginBtn.disabled = false);
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

/* ─── Events ─────────────────────────────────────────────── */

function bindEvents() {
  el.startBtn?.addEventListener("click", startTimer);
  el.pauseBtn?.addEventListener("click", pauseTimer);
  el.stopBtn?.addEventListener("click", stopAndSaveTimer);
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

  // Allow Enter key to log in from password field
  el.passwordInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });

  if (el.importBtn && el.importFile) {
    el.importBtn.addEventListener("click", () => el.importFile.click());
  }

  el.importFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importJson(file);
    e.target.value = "";
  });
}

/* ─── Install prompt ─────────────────────────────────────── */

function initInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (el.installBtn) el.installBtn.style.display = "block";
  });

  el.installBtn?.addEventListener("click", async () => {
    if (!deferredPrompt) return showToast("Install not available yet");
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (el.installBtn) el.installBtn.style.display = "none";
  });

  window.addEventListener("appinstalled", () => {
    if (el.installBtn) el.installBtn.style.display = "none";
    showToast("App installed!");
  });
}

/* ─── Boot ───────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  loadLocalState();
  initTheme();
  bindEvents();
  updateAuthUI(); // set initial UI state (logged-out) before Firebase resolves
  initFirebase();
  loadSessionsFromFirebase();
  initInstallPrompt();
  renderAll();
});
async function saveSessionToFirebase(session) {
  const user = firebase.auth().currentUser;

  if (!user) {
    alert("You must be logged in.");
    return;
  }

  const uid = user.uid;

  await firebase
    .firestore()
    .collection("users")
    .doc(uid)
    .collection("studySessions")
    .add({
      ...session,
      createdAt: new Date(),
    });

  console.log("Saved to user cloud");
}
