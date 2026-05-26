/* ============================================================
   Kairos — Premium Task Management
   Pure HTML/CSS/JS. Persistence: localStorage.
   Email reminders: Formspree (https://formspree.io/f/xwvzrayn)
   ============================================================ */

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xwvzrayn';

// ===== Storage Keys =====
const K_USERS = 'kairos.users';
const K_SESSION = 'kairos.session';
const tasksKey = (email) => `kairos.tasks.${email}`;
const sentKey  = (email) => `kairos.reminders.${email}`;

// ===== Utilities =====
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const load = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 3000);
}

// ===== State =====
let currentUser = null;       // { name, email }
let tasks = [];
let filter = 'all';
let editingId = null;
let alarmAudioCtx = null;
let alarmOscillator = null;

// ===== AUTH =====
function getUsers() { return load(K_USERS, {}); }
function setUsers(u) { save(K_USERS, u); }

function registerUser(name, email, password) {
  const users = getUsers();
  email = email.toLowerCase().trim();
  if (users[email]) return { ok: false, msg: 'An account with that email already exists.' };
  // NOTE: localStorage is not secure; this is for demo/coursework only.
  users[email] = { name: name.trim(), password };
  setUsers(users);
  return { ok: true };
}

function loginUser(email, password) {
  const users = getUsers();
  email = email.toLowerCase().trim();
  const u = users[email];
  if (!u || u.password !== password) return { ok: false, msg: 'Invalid email or password.' };
  const session = { name: u.name, email };
  save(K_SESSION, session);
  return { ok: true, session };
}

function logout() {
  localStorage.removeItem(K_SESSION);
  currentUser = null;
  tasks = [];
  showAuth();
}

function showAuth() {
  $('#auth-screen').classList.remove('hidden');
  $('#app-screen').classList.add('hidden');
}

function showApp() {
  $('#auth-screen').classList.add('hidden');
  $('#app-screen').classList.remove('hidden');
  $('#hello').textContent = `Welcome, ${currentUser.name}`;
  tasks = load(tasksKey(currentUser.email), []);
  renderTasks();
}

// ===== Auth UI =====
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  $$('.auth-form').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $(`#${t.dataset.tab}-form`).classList.add('active');
}));

$('#register-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const res = registerUser(f.name.value, f.email.value, f.password.value);
  const msg = $('#register-msg');
  if (!res.ok) { msg.textContent = res.msg; msg.classList.remove('success'); return; }
  msg.textContent = 'Account created. Signing you in...';
  msg.classList.add('success');
  setTimeout(() => {
    const login = loginUser(f.email.value, f.password.value);
    currentUser = login.session;
    f.reset();
    msg.textContent = '';
    showApp();
  }, 600);
});

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const res = loginUser(f.email.value, f.password.value);
  const msg = $('#login-msg');
  if (!res.ok) { msg.textContent = res.msg; return; }
  currentUser = res.session;
  f.reset(); msg.textContent = '';
  showApp();
});

$('#logout-btn').addEventListener('click', logout);

// ===== TASK CRUD =====
function saveTasks() { save(tasksKey(currentUser.email), tasks); }

$('#task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const data = {
    title: f.title.value.trim(),
    description: f.description.value.trim(),
    deadline: new Date(f.deadline.value).getTime(),
    priority: f.priority.value,
    reminder: f.reminder.checked,
  };
  if (!data.title || !data.deadline) return;

  if (editingId) {
    const t = tasks.find(x => x.id === editingId);
    Object.assign(t, data);
    editingId = null;
    $('#form-title').textContent = 'Create a Task';
    $('#task-submit').textContent = 'Add Task';
    $('#cancel-edit').classList.add('hidden');
    toast('Task updated');
  } else {
    tasks.unshift({ id: uid(), createdAt: Date.now(), done: false, alarmed: false, ...data });
    toast('Task added');
  }
  saveTasks();
  f.reset();
  f.priority.value = 'medium';
  f.reminder.checked = true;
  renderTasks();
});

$('#cancel-edit').addEventListener('click', () => {
  editingId = null;
  $('#task-form').reset();
  $('#task-form').priority.value = 'medium';
  $('#task-form').reminder.checked = true;
  $('#form-title').textContent = 'Create a Task';
  $('#task-submit').textContent = 'Add Task';
  $('#cancel-edit').classList.add('hidden');
});

function editTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  const f = $('#task-form');
  f.id.value = t.id;
  f.title.value = t.title;
  f.description.value = t.description || '';
  // datetime-local needs local ISO without tz
  const d = new Date(t.deadline);
  const pad = (n) => String(n).padStart(2, '0');
  f.deadline.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  f.priority.value = t.priority;
  f.reminder.checked = !!t.reminder;
  editingId = t.id;
  $('#form-title').textContent = 'Edit Task';
  $('#task-submit').textContent = 'Save Changes';
  $('#cancel-edit').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderTasks();
  toast('Task deleted');
}

function toggleDone(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  saveTasks();
  renderTasks();
}

// ===== Filters =====
$$('.chip').forEach(c => c.addEventListener('click', () => {
  $$('.chip').forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  filter = c.dataset.filter;
  renderTasks();
}));

// ===== Render =====
function formatCountdown(ms) {
  if (ms <= 0) return 'Time up';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${String(sec).padStart(2,'0')}s`;
  return `${m}m ${String(sec).padStart(2,'0')}s`;
}

function formatDeadline(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function renderTasks() {
  const list = $('#task-list');
  const empty = $('#empty-state');
  const filtered = tasks.filter(t =>
    filter === 'all' ? true : filter === 'done' ? t.done : !t.done
  );
  list.innerHTML = '';
  empty.style.display = filtered.length ? 'none' : 'block';
  empty.textContent = tasks.length === 0
    ? 'No tasks yet. Create your first one above.'
    : `No ${filter} tasks.`;

  filtered.forEach(t => {
    const li = document.createElement('li');
    li.className = `task-item priority-${t.priority}${t.done ? ' done' : ''}`;
    const remaining = t.deadline - Date.now();
    if (remaining < 0 && !t.done) li.classList.add('overdue');

    li.innerHTML = `
      <button class="task-check ${t.done ? 'checked' : ''}" aria-label="Toggle done"></button>
      <div class="task-body">
        <div class="task-title"></div>
        ${t.description ? `<div class="task-desc"></div>` : ''}
        <div class="task-meta">
          <span>📅 <span class="deadline-text"></span></span>
          <span class="countdown" data-deadline="${t.deadline}" data-done="${t.done}"></span>
          <span>⚑ ${t.priority}</span>
          ${t.reminder ? `<span>✉ reminder on</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn edit-btn" aria-label="Edit">✎</button>
        <button class="icon-btn danger del-btn" aria-label="Delete">🗑</button>
      </div>
    `;
    li.querySelector('.task-title').textContent = t.title;
    if (t.description) li.querySelector('.task-desc').textContent = t.description;
    li.querySelector('.deadline-text').textContent = formatDeadline(t.deadline);

    li.querySelector('.task-check').addEventListener('click', () => toggleDone(t.id));
    li.querySelector('.edit-btn').addEventListener('click', () => editTask(t.id));
    li.querySelector('.del-btn').addEventListener('click', () => deleteTask(t.id));
    list.appendChild(li);
  });
  updateCountdowns();
}

function updateCountdowns() {
  $$('.countdown').forEach(el => {
    const deadline = +el.dataset.deadline;
    const done = el.dataset.done === 'true';
    const remaining = deadline - Date.now();
    if (done) { el.textContent = '✓ completed'; el.classList.add('done'); return; }
    el.textContent = formatCountdown(remaining);
    el.classList.toggle('urgent', remaining > 0 && remaining < 60 * 60 * 1000);
  });
}

// ===== Countdown / Alarm Tick =====
function startBeep() {
  try {
    alarmAudioCtx = alarmAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (alarmOscillator) return;
    const o = alarmAudioCtx.createOscillator();
    const g = alarmAudioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(alarmAudioCtx.destination);
    o.start();
    // pulse the frequency
    let high = true;
    alarmOscillator = { o, g, interval: setInterval(() => {
      o.frequency.value = high ? 660 : 880;
      high = !high;
    }, 400) };
  } catch (e) { /* audio not available */ }
}
function stopBeep() {
  if (!alarmOscillator) return;
  clearInterval(alarmOscillator.interval);
  try { alarmOscillator.o.stop(); } catch {}
  alarmOscillator = null;
}

function triggerAlarm(task) {
  $('#alarm-task').textContent = `"${task.title}" is due now.`;
  $('#alarm-modal').classList.remove('hidden');
  startBeep();
  // browser notification (best-effort)
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Kairos — Task Due', { body: task.title });
  }
}

$('#alarm-dismiss').addEventListener('click', () => {
  $('#alarm-modal').classList.add('hidden');
  stopBeep();
});

// ===== Email Reminder via Formspree =====
async function sendReminderEmail(task) {
  if (!currentUser) return false;
  try {
    const res = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        email: currentUser.email,
        _replyto: currentUser.email,
        _subject: `Kairos Reminder: "${task.title}" is due soon`,
        name: currentUser.name,
        task_title: task.title,
        task_description: task.description || '(no description)',
        task_priority: task.priority,
        deadline: formatDeadline(task.deadline),
        message: `Hi ${currentUser.name},\n\nThis is a reminder that your task "${task.title}" is due at ${formatDeadline(task.deadline)}.\n\nPriority: ${task.priority}\n${task.description ? `\nDetails: ${task.description}\n` : ''}\n— Kairos`,
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn('Reminder failed', e);
    return false;
  }
}

function checkRemindersAndAlarms() {
  if (!currentUser) return;
  const now = Date.now();
  const sent = load(sentKey(currentUser.email), {});
  let dirty = false;

  tasks.forEach(t => {
    if (t.done) return;
    const remaining = t.deadline - now;

    // Email reminder: 30 min before, once per task
    if (t.reminder && !sent[t.id] && remaining <= 30 * 60 * 1000 && remaining > 0) {
      sent[t.id] = true;
      save(sentKey(currentUser.email), sent);
      sendReminderEmail(t).then(ok => {
        if (ok) toast(`Reminder email sent for "${t.title}"`);
      });
    }

    // Alarm: when deadline reached, once
    if (!t.alarmed && remaining <= 0 && remaining > -60 * 1000) {
      t.alarmed = true;
      dirty = true;
      triggerAlarm(t);
    }
  });

  if (dirty) saveTasks();
  updateCountdowns();
}

setInterval(checkRemindersAndAlarms, 1000);

// ===== Init =====
function init() {
  const session = load(K_SESSION, null);
  if (session) {
    currentUser = session;
    showApp();
  } else {
    showAuth();
  }
  // Ask for notification permission once user interacts
  if ('Notification' in window && Notification.permission === 'default') {
    document.addEventListener('click', () => {
      Notification.requestPermission().catch(() => {});
    }, { once: true });
  }
}
init();
