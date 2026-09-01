'use strict';

const bridge = window.daylightDesktop;
const STORAGE_KEY = 'chaoqun-offline-tasks-v1';
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
let tasks = loadTasks();
let desktopState = { autoStart: true, alwaysOnTop: false, sizePreset: 'standard', opacity: 1 };
let pointerAction = null;

function normalizeTask(value) {
  if (!value || typeof value.title !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date || '')) return null;
  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    title: value.title.slice(0, 160), date: value.date,
    time: /^\d{2}:\d{2}$/.test(value.time || '') ? value.time : '',
    completed: Boolean(value.completed), reminder: Boolean(value.reminder),
    color: COLORS.has(value.color) ? value.color : 'blue',
  };
}

function loadTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeTask).filter(Boolean) : [];
  } catch { return []; }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  render();
}

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
  const visible = tasks.filter((task) => task.title.toLowerCase().includes(searchText));
  $('remaining').textContent = `${tasks.filter((task) => !task.completed).length} 项待完成`;
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
  };
  tasks = editingId ? tasks.map((task) => task.id === editingId ? next : task) : [...tasks, next];
  closeDialog('taskDialog'); saveTasks();
});

$('deleteTask').addEventListener('click', () => { if (editingId) tasks = tasks.filter((task) => task.id !== editingId); closeDialog('taskDialog'); saveTasks(); });
$('duplicateTask').addEventListener('click', () => {
  const task = tasks.find((item) => item.id === editingId); if (!task) return;
  tasks.push({ ...task, id: crypto.randomUUID(), title: `${task.title}（副本）`, completed: false }); closeDialog('taskDialog'); saveTasks();
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

function refreshSettings() {
  $('autoStart').classList.toggle('active', desktopState.autoStart); $('autoStart').textContent = desktopState.autoStart ? '✓ 开机启动' : '开机启动';
  $('alwaysTop').classList.toggle('active', desktopState.alwaysOnTop); $('alwaysTop').textContent = desktopState.alwaysOnTop ? '✓ 已置顶' : '桌面置顶';
  document.querySelectorAll('[data-size]').forEach((button) => button.classList.toggle('active', button.dataset.size === desktopState.sizePreset));
  const opacity = Math.round(desktopState.opacity * 100); $('opacity').value = String(opacity); $('opacityValue').textContent = `${opacity}%`;
}

$('openSettings').addEventListener('click', () => { refreshSettings(); $('settingsDialog').showModal(); });
$('autoStart').addEventListener('click', async () => { desktopState.autoStart = await bridge?.setAutoStart(!desktopState.autoStart); refreshSettings(); });
$('alwaysTop').addEventListener('click', async () => { desktopState.alwaysOnTop = await bridge?.setAlwaysOnTop(!desktopState.alwaysOnTop); refreshSettings(); });
document.querySelectorAll('[data-size]').forEach((button) => button.addEventListener('click', async () => { desktopState = await bridge?.setSize(button.dataset.size) || desktopState; refreshSettings(); }));
$('opacity').addEventListener('input', (event) => { const value = Number(event.target.value); desktopState.opacity = value / 100; $('opacityValue').textContent = `${value}%`; bridge?.setOpacity(value / 100); });

$('exportBackup').addEventListener('click', async () => {
  const contents = JSON.stringify({ app: 'chaoquncalender', version: 1, exportedAt: new Date().toISOString(), tasks }, null, 2);
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

function beginPointer(event, mode, edge) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pointerAction = { mode, edge, x: event.screenX, y: event.screenY }; }
function movePointer(event) {
  if (!pointerAction || !bridge) return; const dx = event.screenX - pointerAction.x; const dy = event.screenY - pointerAction.y; if (!dx && !dy) return;
  if (pointerAction.mode === 'move') bridge.moveBy(dx, dy); else bridge.resizeBy(pointerAction.edge, dx, dy);
  pointerAction.x = event.screenX; pointerAction.y = event.screenY;
}
function endPointer() { pointerAction = null; }
$('dragGrip').addEventListener('pointerdown', (event) => beginPointer(event, 'move'));
$('dragGrip').addEventListener('pointermove', movePointer); $('dragGrip').addEventListener('pointerup', endPointer); $('dragGrip').addEventListener('pointercancel', endPointer);
document.querySelectorAll('.resize').forEach((handle) => { handle.addEventListener('pointerdown', (event) => beginPointer(event, 'resize', handle.dataset.edge)); handle.addEventListener('pointermove', movePointer); handle.addEventListener('pointerup', endPointer); handle.addEventListener('pointercancel', endPointer); });

bridge?.getState().then((state) => { desktopState = state; refreshSettings(); }).catch(() => undefined);
render();
