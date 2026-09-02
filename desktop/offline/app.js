'use strict';

const bridge = window.daylightDesktop;
const STORAGE_KEY = 'chaoqun-offline-tasks-v1';
const SESSION_KEY = 'chaoqun-sync-session-v1';
const API_BASE = 'https://124.223.175.138';
const COLORS = new Set(['blue', 'coral', 'green', 'gold']);
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = (value) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); };
const formatDate = (date) => `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
const today = new Date();
let viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
let editingId = null;
let searchText = '';
let session = loadSession();
let tasks = loadTasks();
let desktopState = { autoStart: true, alwaysOnTop: false, desktopPinned: true, sizePreset: 'standard', opacity: 1, collapsed: false, update: { status: 'idle', message: '已是最新版本' } };
let pointerAction = null;
let syncTimer = null;
let syncing = false;
let syncPending = false;

function loadSession() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return value?.token && value?.username ? value : null;
  } catch { return null; }
}

function taskStorageKey() {
  return session ? `${STORAGE_KEY}:${session.username.toLocaleLowerCase('zh-CN')}` : STORAGE_KEY;
}

function revisionStorageKey() {
  return session ? `chaoqun-sync-revision:${session.username.toLocaleLowerCase('zh-CN')}` : 'chaoqun-sync-revision:local';
}

function normalizeTask(value) {
  if (!value || typeof value.title !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date || '')) return null;
  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    title: value.title.slice(0, 160), date: value.date,
    time: /^\d{2}:\d{2}$/.test(value.time || '') ? value.time : '',
    completed: Boolean(value.completed), reminder: Boolean(value.reminder),
    color: COLORS.has(value.color) ? value.color : 'blue',
    updatedAt: Number(value.updatedAt) || Date.now(),
    deletedAt: Number(value.deletedAt) || 0,
  };
}

function loadTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(taskStorageKey()) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeTask).filter(Boolean) : [];
  } catch { return []; }
}

function saveTasks() {
  persistTasks();
  render();
  scheduleSync();
}

function persistTasks() { localStorage.setItem(taskStorageKey(), JSON.stringify(tasks)); }

function monthGrid() {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start); date.setDate(start.getDate() + index); return date;
  });
}

function render() {
  $('todayTitle').textContent = `今天是 ${formatDate(today)}`;
  $('monthLabel').textContent = `${viewDate.getFullYear()}年 ${viewDate.getMonth() + 1}月`;
  const currentTasks = tasks.filter((task) => !task.deletedAt);
  const visible = currentTasks.filter((task) => task.title.toLowerCase().includes(searchText));
  $('remaining').textContent = `${currentTasks.filter((task) => !task.completed).length} 项待完成`;
  $('miniDay').textContent = today.getDate();
  $('miniRemaining').textContent = currentTasks.filter((task) => !task.completed).length;
  const calendar = $('calendar');
  calendar.replaceChildren();
  monthGrid().forEach((date) => {
    const key = dateKey(date);
    const day = document.createElement('section');
    day.className = `day${date.getMonth() !== viewDate.getMonth() ? ' muted' : ''}${key === dateKey(today) ? ' today' : ''}`;
    const head = document.createElement('button');
    head.className = 'day-head';
    head.innerHTML = `<span>${date.getDate()}</span>${date.getDate() === 1 ? `<small>${date.getMonth() + 1}月</small>` : ''}<span class="plus">＋</span>`;
    head.addEventListener('click', () => openEditor(key));
    const list = document.createElement('div'); list.className = 'tasks';
    const dayTasks = visible.filter((task) => task.date === key).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    dayTasks.slice(0, 4).forEach((task) => {
      const button = document.createElement('button');
      button.className = `task ${task.color}${task.completed ? ' done' : ''}`;
      if (task.time) { const time = document.createElement('span'); time.className = 'task-time'; time.textContent = task.time; button.append(time); }
      const title = document.createElement('span'); title.className = 'task-title'; title.textContent = task.title; button.append(title);
      if (task.reminder) { const bell = document.createElement('span'); bell.textContent = '◉'; button.append(bell); }
      button.addEventListener('click', () => openEditor(task.date, task.id)); list.append(button);
    });
    if (dayTasks.length > 4) { const more = document.createElement('span'); more.className = 'more'; more.textContent = `还有 ${dayTasks.length - 4} 项`; list.append(more); }
    day.append(head, list); calendar.append(day);
  });
}

function openEditor(key, id = null) {
  editingId = id;
  const task = id ? tasks.find((item) => item.id === id) : null;
  $('editorMode').textContent = task ? '编辑待办' : '新建待办';
  $('taskTitle').value = task?.title || '';
  $('taskDate').value = task?.date || key;
  $('taskTime').value = task?.time || '';
  $('taskCompleted').checked = Boolean(task?.completed);
  $('taskReminder').checked = Boolean(task?.reminder);
  const color = task?.color || 'blue';
  document.querySelector(`input[name="color"][value="${color}"]`).checked = true;
  $('deleteTask').hidden = !task; $('duplicateTask').hidden = !task;
  $('editorDateTitle').textContent = formatDate(parseDate(task?.date || key));
  $('taskDialog').showModal(); setTimeout(() => $('taskTitle').focus(), 0);
}

function closeDialog(id) { $(id).close(); }

$('taskForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const title = $('taskTitle').value.trim(); if (!title) return;
  const next = {
    id: editingId || crypto.randomUUID(), title, date: $('taskDate').value, time: $('taskTime').value,
    completed: $('taskCompleted').checked, reminder: $('taskReminder').checked,
    color: document.querySelector('input[name="color"]:checked').value,
    updatedAt: Date.now(), deletedAt: 0,
  };
  tasks = editingId ? tasks.map((task) => task.id === editingId ? next : task) : [...tasks, next];
  closeDialog('taskDialog'); saveTasks();
});

$('deleteTask').addEventListener('click', () => { if (editingId) tasks = tasks.map((task) => task.id === editingId ? { ...task, deletedAt: Date.now(), updatedAt: Date.now() } : task); closeDialog('taskDialog'); saveTasks(); });
$('duplicateTask').addEventListener('click', () => {
  const task = tasks.find((item) => item.id === editingId); if (!task) return;
  tasks.push({ ...task, id: crypto.randomUUID(), title: `${task.title}（副本）`, completed: false, deletedAt: 0, updatedAt: Date.now() }); closeDialog('taskDialog'); saveTasks();
});
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeDialog(button.dataset.close)));
$('taskDate').addEventListener('change', () => { if ($('taskDate').value) $('editorDateTitle').textContent = formatDate(parseDate($('taskDate').value)); });
$('prevMonth').addEventListener('click', () => { viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1); render(); });
$('nextMonth').addEventListener('click', () => { viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1); render(); });
$('goToday').addEventListener('click', () => { viewDate = new Date(today.getFullYear(), today.getMonth(), 1); render(); });
$('addToday').addEventListener('click', () => openEditor(dateKey(today)));
$('searchInput').addEventListener('input', (event) => { searchText = event.target.value.trim().toLowerCase(); render(); });
$('minimize').addEventListener('click', () => bridge?.minimize());
$('close').addEventListener('click', () => bridge?.close());
$('collapseWidget').addEventListener('click', async () => applyDesktopState(await bridge?.setCollapsed(true)));
$('expandWidget').addEventListener('click', async () => applyDesktopState(await bridge?.setCollapsed(false)));

function applyDesktopState(state) {
  if (!state) return;
  desktopState = state;
  document.body.classList.toggle('collapsed', Boolean(desktopState.collapsed));
  refreshSettings();
}

function refreshSettings() {
  $('autoStart').classList.toggle('active', desktopState.autoStart); $('autoStart').textContent = desktopState.autoStart ? '✓ 开机启动' : '开机启动';
  $('desktopPinned').classList.toggle('active', desktopState.desktopPinned); $('desktopPinned').textContent = desktopState.desktopPinned ? '✓ 已固定桌面' : '固定桌面';
  $('alwaysTop').classList.toggle('active', desktopState.alwaysOnTop); $('alwaysTop').textContent = desktopState.alwaysOnTop ? '✓ 浮动置顶' : '浮动置顶';
  $('alwaysTop').disabled = desktopState.desktopPinned;
  document.querySelectorAll('[data-size]').forEach((button) => button.classList.toggle('active', button.dataset.size === desktopState.sizePreset));
  const opacity = Math.round(desktopState.opacity * 100); $('opacity').value = String(opacity); $('opacityValue').textContent = `${opacity}%`;
  $('updateStatus').textContent = desktopState.update?.message || '尚未检查更新';
  $('installUpdate').hidden = desktopState.update?.status !== 'ready';
}

$('openSettings').addEventListener('click', () => { refreshSettings(); $('settingsDialog').showModal(); });
$('autoStart').addEventListener('click', async () => { desktopState.autoStart = await bridge?.setAutoStart(!desktopState.autoStart); refreshSettings(); });
$('desktopPinned').addEventListener('click', async () => { desktopState.desktopPinned = await bridge?.setDesktopPinned(!desktopState.desktopPinned); refreshSettings(); });
$('alwaysTop').addEventListener('click', async () => { desktopState.alwaysOnTop = await bridge?.setAlwaysOnTop(!desktopState.alwaysOnTop); refreshSettings(); });
document.querySelectorAll('[data-size]').forEach((button) => button.addEventListener('click', async () => { desktopState = await bridge?.setSize(button.dataset.size) || desktopState; refreshSettings(); }));
$('opacity').addEventListener('input', (event) => { const value = Number(event.target.value); desktopState.opacity = value / 100; $('opacityValue').textContent = `${value}%`; bridge?.setOpacity(value / 100); });
$('checkUpdate').addEventListener('click', async () => { desktopState.update = { status: 'checking', message: '正在检查更新…' }; refreshSettings(); const update = await bridge?.checkForUpdates(); if (update) { desktopState.update = update; refreshSettings(); } });
$('installUpdate').addEventListener('click', () => bridge?.installUpdate());

$('exportBackup').addEventListener('click', async () => {
  const contents = JSON.stringify({ app: 'BEIOCalender', version: 1, exportedAt: new Date().toISOString(), tasks }, null, 2);
  $('backupStatus').textContent = await bridge?.exportBackup(contents) ? '备份已导出。' : '';
});
$('importBackup').addEventListener('click', async () => {
  const contents = await bridge?.importBackup(); if (!contents) return;
  try {
    const parsed = JSON.parse(contents); const incoming = Array.isArray(parsed) ? parsed : parsed.tasks;
    if (!Array.isArray(incoming)) throw new Error('invalid');
    tasks = incoming.map(normalizeTask).filter(Boolean); saveTasks(); $('backupStatus').textContent = `已导入 ${tasks.length} 项待办。`;
  } catch { $('backupStatus').textContent = '备份文件格式不正确。'; }
});

function mergeTasks(localTasks, remoteTasks) {
  const merged = new Map();
  [...localTasks, ...remoteTasks].map(normalizeTask).filter(Boolean).forEach((task) => {
    const existing = merged.get(task.id);
    if (!existing || task.updatedAt > existing.updatedAt || (task.updatedAt === existing.updatedAt && task.deletedAt > existing.deletedAt)) merged.set(task.id, task);
  });
  return [...merged.values()];
}

async function api(path, options = {}, authenticated = true) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authenticated && session?.token) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let body = {};
  try { body = await response.json(); } catch { body = { error: '服务器返回了无法识别的内容' }; }
  if (!response.ok) {
    const error = new Error(body.error || `请求失败（${response.status}）`);
    error.status = response.status; error.body = body; throw error;
  }
  return body;
}

function setSyncStatus(message, online = Boolean(session)) {
  $('accountStatus').textContent = session ? `${session.username} · ${message}` : '未登录，本机待办仍可离线使用。';
  $('syncBadge').textContent = online ? '● 已联网' : '● 本地';
  $('syncBadge').classList.toggle('online', online);
  $('authForm').hidden = Boolean(session);
  $('signedInActions').hidden = !session;
}

function scheduleSync() {
  if (!session) return;
  syncPending = true;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), 900);
}

async function syncNow() {
  if (!session || syncing) return;
  syncPending = false;
  syncing = true;
  setSyncStatus('正在同步…', true);
  try {
    let remote = await api('/api/sync');
    tasks = mergeTasks(tasks, remote.found ? remote.payload : []);
    let revision = Number(remote.revision) || 0;
    let saved;
    try {
      saved = await api('/api/sync', { method: 'PUT', body: JSON.stringify({ payload: tasks, baseRevision: revision }) });
    } catch (error) {
      if (error.status !== 409) throw error;
      tasks = mergeTasks(tasks, error.body.payload || []);
      revision = Number(error.body.revision) || 0;
      saved = await api('/api/sync', { method: 'PUT', body: JSON.stringify({ payload: tasks, baseRevision: revision }) });
    }
    tasks = tasks.filter((task) => !task.deletedAt || Date.now() - task.deletedAt < 30 * 24 * 60 * 60 * 1000);
    localStorage.setItem(revisionStorageKey(), String(saved.revision));
    persistTasks(); render();
    setSyncStatus(`已同步 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`, true);
    $('authMessage').textContent = '';
  } catch (error) {
    if (error.status === 401) {
      session = null; localStorage.removeItem(SESSION_KEY); refreshAccount();
      $('authMessage').textContent = '登录已失效，请重新登录。';
    } else {
      setSyncStatus('离线，恢复网络后会自动重试', false);
      $('authMessage').textContent = error.message || '同步失败';
    }
  } finally {
    syncing = false;
    if (syncPending && session) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => syncNow(), 300);
    }
  }
}

function refreshAccount() {
  setSyncStatus(session ? '等待同步' : '', Boolean(session));
}

async function authenticate(mode) {
  const username = $('accountUsername').value.trim();
  const password = $('accountPassword').value;
  $('authMessage').textContent = mode === 'register' ? '正在注册…' : '正在登录…';
  try {
    const anonymous = !session && !localStorage.getItem('chaoqun-anonymous-migrated') ? tasks : [];
    const result = await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ username, password }) }, false);
    session = { token: result.token, username: result.username };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    const accountTasks = loadTasks();
    tasks = mergeTasks(accountTasks, anonymous);
    if (anonymous.length) localStorage.setItem('chaoqun-anonymous-migrated', '1');
    $('accountPassword').value = '';
    persistTasks(); render(); refreshAccount();
    await syncNow();
  } catch (error) { $('authMessage').textContent = error.message || '操作失败'; }
}

$('loginAccount').addEventListener('click', () => authenticate('login'));
$('registerAccount').addEventListener('click', () => authenticate('register'));
$('accountPassword').addEventListener('keydown', (event) => { if (event.key === 'Enter') authenticate('login'); });
$('syncNow').addEventListener('click', () => syncNow());
$('logoutAccount').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* local logout still succeeds */ }
  session = null; localStorage.removeItem(SESSION_KEY); tasks = loadTasks(); render(); refreshAccount(); $('authMessage').textContent = '已退出账号。';
});
window.addEventListener('online', () => syncNow());

function beginPointer(event, mode, edge) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pointerAction = { mode, edge, x: event.screenX, y: event.screenY }; }
function movePointer(event) {
  if (!pointerAction || !bridge) return; const dx = event.screenX - pointerAction.x; const dy = event.screenY - pointerAction.y; if (!dx && !dy) return;
  if (pointerAction.mode === 'move') bridge.moveBy(dx, dy); else bridge.resizeBy(pointerAction.edge, dx, dy);
  pointerAction.x = event.screenX; pointerAction.y = event.screenY;
}
function endPointer() { pointerAction = null; }
$('dragGrip').addEventListener('pointerdown', (event) => beginPointer(event, 'move'));
$('dragGrip').addEventListener('pointermove', movePointer); $('dragGrip').addEventListener('pointerup', endPointer); $('dragGrip').addEventListener('pointercancel', endPointer);
$('miniDrag').addEventListener('pointerdown', (event) => beginPointer(event, 'move'));
$('miniDrag').addEventListener('pointermove', movePointer); $('miniDrag').addEventListener('pointerup', endPointer); $('miniDrag').addEventListener('pointercancel', endPointer);
document.querySelectorAll('.resize').forEach((handle) => { handle.addEventListener('pointerdown', (event) => beginPointer(event, 'resize', handle.dataset.edge)); handle.addEventListener('pointermove', movePointer); handle.addEventListener('pointerup', endPointer); handle.addEventListener('pointercancel', endPointer); });

bridge?.onStateChanged((state) => applyDesktopState(state));
bridge?.getState().then((state) => applyDesktopState(state)).catch(() => undefined);
refreshAccount();
if (session) api('/api/auth/session').then(() => syncNow()).catch((error) => {
  if (error.status === 401) {
    session = null; localStorage.removeItem(SESSION_KEY); tasks = loadTasks(); render(); refreshAccount();
  } else {
    setSyncStatus('离线，联网后自动同步', false);
  }
});
render();
