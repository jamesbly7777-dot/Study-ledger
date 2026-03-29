const STORAGE_KEY = "atlas-study-tracker-data-v1";
const THEME_KEY = "atlas-study-theme-v1";

let deferredInstallPrompt = null;

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
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(showToast._timeout);
  showToast._timeout = setTimeout(() => {
    el.toast.classList.remove("show");
  }, 2600);
}

function clampFocus(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return Math.min(5, Math.max(1, Math.round(num)));
}

function saveLocalState() {
  const payload = {
    sessions: state.sessions,
    dailyGoal: state.dailyGoal
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    state.dailyGoal = Number.isFinite(parsed.dailyGoal) ? parsed.dailyGoal : 2;
  } catch (err) {
    console.error(err);
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
  return ms / 3600000;
}

function formatHours(num) {
  return `${num.toFixed(2)}h`;
}

function toDateKey(dateInput) {
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return toDateKey(new Date());
}

function getLast7Days() {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d);
  }
  return days;
}

function computeDailyTotals() {
  const map = new Map();
  for (const session of state.sessions) {
    const key = toDateKey(session.createdAt);
    map.set(key, (map.get(key) || 0) + session.durationMs);
  }
  return map;
}

function getTodayHours() {
  const total = computeDailyTotals().get(todayKey()) || 0;
  return hoursFromMs(total);
}

function getWeekHours() {
  const totals = computeDailyTotals();
  return getLast7Days().reduce((sum, d) => {
    const key = toDateKey(d);
    return sum + hoursFromMs(totals.get(key) || 0);
  }, 0);
}

function getStreakCount() {
  const totals = computeDailyTotals();
  let streak = 0;
  const d = new Date();

  while (true) {
    const key = toDateKey(d);
    const amount = totals.get(key) || 0;
    if (amount > 0) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function renderChart() {
  if (!el.hoursChart) return;

  const totals = computeDailyTotals();
  const last7 = getLast7Days();
  const values = last7.map((d) => hoursFromMs(totals.get(toDateKey(d)) || 0));
  const max = Math.max(...values, 0.25);

  el.hoursChart.innerHTML = "";

  last7.forEach((date, idx) => {
    const value = values[idx];
    const col = document.createElement("div");
    col.className = "bar-col";

    const valueLabel = document.createElement("div");
    valueLabel.className = "bar-value";
    valueLabel.textContent = value.toFixed(1);

    const track = document.createElement("div");
    track.className = "bar-track";

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.max(8, (value / max) * 140)}px`;

    const day = document.createElement("div");
    day.className = "bar-label";
    day.textContent = date.toLocaleDateString(undefined, { weekday: "short" });

    track.appendChild(bar);
    col.appendChild(valueLabel);
    col.appendChild(track);
    col.appendChild(day);
    el.hoursChart.appendChild(col);
  });
}

function renderStats() {
  if (el.todayHours) el.todayHours.textContent = formatHours(getTodayHours());
  if (el.weekHours) el.weekHours.textContent = formatHours(getWeekHours());
  if (el.streakCount) el.streakCount.textContent = String(getStreakCount());
  if (el.goalDisplay) el.goalDisplay.textContent = formatHours(state.dailyGoal);
  if (el.dailyGoalInput) el.dailyGoalInput.value = state.dailyGoal;
  if (el.sessionCount) {
    el.sessionCount.textContent = `${state.sessions.length} ${state.sessions.length === 1 ? "session" : "sessions"}`;
  }
}

function sessionHtml(session) {
  const wrapper = document.createElement("div");
  wrapper.className = "session-item";

  const head = document.createElement("div");
  head.className = "session-head";

  const left = document.createElement("div");
  const title = document.createElement("h4");
  title.className = "session-title";
  title.textContent = session.title || "Untitled Session";

  const meta = document.createElement("div");
  meta.className = "session-meta";
  meta.innerHTML = `
    <div>${session.category || "General"}</div>
    <div>${new Date(session.createdAt).toLocaleString()}</div>
    <div>Focus: ${session.focus || "—"}</div>
  `;

  left.appendChild(title);
  left.appendChild(meta);

  const duration = document.createElement("div");
  duration.className = "session-duration";
  duration.textContent = formatHours(hoursFromMs(session.durationMs));

  head.appendChild(left);
  head.appendChild(duration);

  wrapper.appendChild(head);

  if (session.notes) {
    const notes = document.createElement("div");
    notes.className = "session-notes";
    notes.textContent = session.notes;
    wrapper.appendChild(notes);
  }

  const actions = document.createElement("div");
  actions.className = "session-actions";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "small-btn delete";
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", async () => {
    state.sessions = state.sessions.filter((s) => s.id !== session.id);
    saveLocalState();
    renderAll();
    showToast("Session deleted");

    if (state.firebaseReady && state.user) {
      await pushLocalToCloud();
    }
  });

  actions.appendChild(deleteBtn);
  wrapper.appendChild(actions);

  return wrapper;
}

function renderSessions() {
  if (!el.sessionList) return;

  el.sessionList.innerHTML = "";

  if (!state.sessions.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No sessions yet. Start your timer and save one.";
    el.sessionList.appendChild(empty);
    return;
  }

  const sorted = [...state.sessions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  sorted.forEach((session) => {
    el.sessionList.appendChild(sessionHtml(session));
  });
}

function renderCloudStatus() {
  if (!el.cloudStatus || !el.authText) return;

  if (!state.firebaseReady) {
    el.cloudStatus.textContent = "Local mode";
    el.authText.textContent = "Firebase not configured yet. App works fully in local mode until you add your Firebase keys.";
    return;
  }

  if (state.user) {
    el.cloudStatus.textContent = "Cloud ready";
    el.authText.textContent = `Logged in as ${state.user.email}`;
  } else {
    el.cloudStatus.textContent = "Firebase ready";
    el.authText.textContent = "Firebase ready. Login to sync your sessions.";
  }
}

function renderAll() {
  if (el.timerDisplay) el.timerDisplay.textContent = formatDuration(state.timer.elapsedMs);
  renderStats();
  renderChart();
  renderSessions();
  renderCloudStatus();
}

function startTimer() {
  if (state.timer.running) return;

  state.timer.running = true;
  state.timer.paused = false;
  state.timer.startTime = Date.now() - state.timer.elapsedMs;

  state.timer.intervalId = setInterval(() => {
    state.timer.elapsedMs = Date.now() - state.timer.startTime;
    if (el.timerDisplay) el.timerDisplay.textContent = formatDuration(state.timer.elapsedMs);
  }, 250);

  if (el.timerStatus) el.timerStatus.textContent = "Running";
}

function pauseTimer() {
  if (!state.timer.running) return;

  clearInterval(state.timer.intervalId);
  state.timer.intervalId = null;
  state.timer.running = false;
  state.timer.paused = true;
  state.timer.elapsedMs = Date.now() - state.timer.startTime;

  if (el.timerStatus) el.timerStatus.textContent = "Paused";
  if (el.timerDisplay) el.timerDisplay.textContent = formatDuration(state.timer.elapsedMs);
}

function resetTimer() {
  clearInterval(state.timer.intervalId);
  state.timer.intervalId = null;
  state.timer.running = false;
  state.timer.paused = false;
  state.timer.startTime = null;
  state.timer.elapsedMs = 0;

  if (el.timerDisplay) el.timerDisplay.textContent = "00:00:00";
  if (el.timerStatus) el.timerStatus.textContent = "Ready";
}

async function stopAndSaveSession() {
  let finalMs = state.timer.elapsedMs;

  if (state.timer.running) {
    finalMs = Date.now() - state.timer.startTime;
  }

  clearInterval(state.timer.intervalId);
  state.timer.intervalId = null;
  state.timer.running = false;
  state.timer.paused = false;

  if (finalMs < 1000) {
    showToast("Run the timer a bit longer before saving.");
    resetTimer();
    return;
  }

  const title = el.studyTitle ? el.studyTitle.value.trim() : "";
  const category = el.studyCategory ? el.studyCategory.value.trim() : "";
  const focus = clampFocus(el.focusRating ? el.focusRating.value : "");
  const notes = el.studyNotes ? el.studyNotes.value.trim() : "";

  const session = {
    id: crypto.randomUUID(),
    title: title || "Untitled Session",
    category: category || "General",
    focus: focus || "",
    notes,
    durationMs: finalMs,
    createdAt: new Date().toISOString()
  };

  state.sessions.push(session);
  saveLocalState();
  renderAll();
  showToast("Session saved");

  if (el.studyTitle) el.studyTitle.value = "";
  if (el.studyCategory) el.studyCategory.value = "";
  if (el.focusRating) el.focusRating.value = "";
  if (el.studyNotes) el.studyNotes.value = "";

  if (state.firebaseReady && state.user) {
    await pushLocalToCloud();
  }

  resetTimer();
}

function exportJson() {
  const blob = new Blob([JSON.stringify({
    sessions: state.sessions,
    dailyGoal: state.dailyGoal
  }, null, 2)], { type: "application/json" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `atlas-study-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Exported JSON");
}

function importJsonFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      state.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
      state.dailyGoal = Number.isFinite(parsed.dailyGoal) ? parsed.dailyGoal : 2;
      saveLocalState();
      renderAll();
      showToast("Imported JSON");

      if (state.firebaseReady && state.user) {
        await pushLocalToCloud();
      }
    } catch (err) {
      console.error(err);
      showToast("Import failed");
    }
  };
  reader.readAsText(file);
}

async function clearAllLocalData() {
  if (!confirm("Clear all local data?")) return;
  state.sessions = [];
  saveLocalState();
  renderAll();
  showToast("Local data cleared");
}

function addDemoData() {
  const now = new Date();
  const demo = [];

  for (let i = 0; i < 5; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);

    demo.push({
      id: crypto.randomUUID(),
      title: `Demo Session ${i + 1}`,
      category: i % 2 === 0 ? "Google IT" : "Codecademy",
      focus: String(5 - (i % 3)),
      notes: "Sample session for UI testing.",
      durationMs: (25 + i * 10) * 60000,
      createdAt: d.toISOString()
    });
  }

  state.sessions = [...demo, ...state.sessions];
  saveLocalState();
  renderAll();
  showToast("Demo data added");
}

function saveGoal() {
  const value = parseFloat(el.dailyGoalInput ? el.dailyGoalInput.value : "");
  if (!Number.isFinite(value) || value < 0) {
    showToast("Enter a valid goal");
    return;
  }

  state.dailyGoal = value;
  saveLocalState();
  renderAll();
  showToast("Goal saved");
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

function applyTheme(theme) {
  if (theme === "light") {
    document.body.classList.add("light");
    if (el.themeBtn) el.themeBtn.textContent = "☀️";
  } else {
    document.body.classList.remove("light");
    if (el.themeBtn) el.themeBtn.textContent = "🌙";
  }
}

function initTheme() {
  const saved
