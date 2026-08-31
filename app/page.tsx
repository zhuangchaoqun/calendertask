'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Cloud,
  Clock3,
  Copy,
  Ellipsis,
  Menu,
  Minimize2,
  Palette,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type TaskColor = 'blue' | 'coral' | 'green' | 'gold';
type Task = {
  id: string;
  title: string;
  date: string;
  time?: string;
  completed: boolean;
  color: TaskColor;
  reminder?: boolean;
};
type DesktopSize = 'compact' | 'standard' | 'large';
type DesktopState = { autoStart: boolean; alwaysOnTop: boolean; sizePreset: DesktopSize; opacity: number };
type AccountUser = { id: string; username: string };

declare global {
  interface Window {
    daylightDesktop?: {
      isDesktop: boolean;
      getState: () => Promise<DesktopState>;
      setOpacity: (value: number) => void;
      setAutoStart: (enabled: boolean) => Promise<boolean>;
      setSize: (preset: DesktopSize) => Promise<DesktopState>;
      setAlwaysOnTop: (enabled: boolean) => Promise<boolean>;
      minimize: () => void;
      close: () => void;
    };
  }
}

const DAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const COLORS: { value: TaskColor; label: string; className: string }[] = [
  { value: 'blue', label: '蓝色', className: 'bg-[#3976dc]' },
  { value: 'coral', label: '珊瑚色', className: 'bg-[#ef7b68]' },
  { value: 'green', label: '绿色', className: 'bg-[#49a981]' },
  { value: 'gold', label: '金色', className: 'bg-[#d6a62e]' },
];
const starterTasks: Task[] = [
  { id: 'welcome-1', title: '整理今天的优先事项', date: '2026-08-28', time: '09:30', completed: true, color: 'blue' },
  { id: 'welcome-2', title: '完成项目周报', date: '2026-08-28', time: '14:00', completed: false, color: 'coral', reminder: true },
  { id: 'welcome-3', title: '晚间散步 30 分钟', date: '2026-08-28', time: '19:30', completed: false, color: 'green' },
  { id: 'welcome-4', title: '准备下周计划', date: '2026-08-31', completed: false, color: 'gold' },
  { id: 'welcome-5', title: '团队例会', date: '2026-09-02', time: '10:00', completed: false, color: 'blue' },
  { id: 'welcome-6', title: '提交费用报销', date: '2026-09-03', completed: false, color: 'coral' },
];

const keyFor = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const formatDate = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
const parseKey = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

function buildMonthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function encryptionKey(secret: string) {
  const source = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('daylight-calendar-sync-v1'), iterations: 150_000 },
    source,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptTasks(tasks: Task[], secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(secret), new TextEncoder().encode(JSON.stringify(tasks)));
  return JSON.stringify({ version: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) });
}

async function decryptTasks(payload: string, secret: string) {
  const parsed = JSON.parse(payload) as { version: number; iv: string; data: string };
  if (parsed.version !== 1) throw new Error('不支持的同步数据版本');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(parsed.iv) }, await encryptionKey(secret), base64ToBytes(parsed.data));
  return JSON.parse(new TextDecoder().decode(decrypted)) as Task[];
}

export default function Home() {
  const today = useMemo(() => new Date(2026, 7, 31), []);
  const [viewDate, setViewDate] = useState(today);
  const [tasks, setTasks] = useState<Task[]>(starterTasks);
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDate, setDraftDate] = useState(keyFor(today));
  const [draftTime, setDraftTime] = useState('');
  const [draftColor, setDraftColor] = useState<TaskColor>('blue');
  const [draftCompleted, setDraftCompleted] = useState(false);
  const [draftReminder, setDraftReminder] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [opacity, setOpacity] = useState(100);
  const [syncSecret, setSyncSecret] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState('尚未启用云同步');
  const [syncBusy, setSyncBusy] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [desktopState, setDesktopState] = useState<DesktopState>({ autoStart: true, alwaysOnTop: false, sizePreset: 'standard', opacity: 1 });
  const [accountUser, setAccountUser] = useState<AccountUser | null>(null);
  const [accountSyncSecret, setAccountSyncSecret] = useState('');
  const [accountLoading, setAccountLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirm, setAuthConfirm] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const suppressNextUpload = useRef(false);
  const accountConnectedOnce = useRef(false);

  useEffect(() => {
    const savedOpacity = Number(window.localStorage.getItem('daylight-opacity'));
    if (savedOpacity >= 45 && savedOpacity <= 100) setOpacity(savedOpacity);
    const legacyTasks = window.localStorage.getItem('daylight-tasks');
    if (legacyTasks && !window.localStorage.getItem('chaoqun-legacy-tasks-backup')) {
      window.localStorage.setItem('chaoqun-legacy-tasks-backup', legacyTasks);
    }
    window.localStorage.removeItem('daylight-sync-secret');
  }, []);
  useEffect(() => {
    const bridge = window.daylightDesktop;
    if (!bridge?.isDesktop) return;
    setIsDesktop(true);
    document.documentElement.classList.add('desktop-app');
    bridge.getState().then(setDesktopState).catch(() => undefined);
    return () => document.documentElement.classList.remove('desktop-app');
  }, []);
  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result: { user: AccountUser | null; syncSecret?: string }) => {
        setAccountUser(result.user);
        if (result.syncSecret) setAccountSyncSecret(result.syncSecret);
      })
      .catch(() => setAuthError('暂时无法连接服务器'))
      .finally(() => setAccountLoading(false));
  }, []);
  useEffect(() => {
    if (!accountUser) return;
    const saved = window.localStorage.getItem(`chaoqun-tasks:${accountUser.id}`);
    if (saved) {
      try { setTasks(JSON.parse(saved) as Task[]); } catch { setTasks(starterTasks); }
    } else {
      const legacy = window.localStorage.getItem('chaoqun-legacy-tasks-backup') ?? window.localStorage.getItem('daylight-tasks');
      if (legacy) {
        try { setTasks(JSON.parse(legacy) as Task[]); } catch { setTasks(starterTasks); }
      } else {
        setTasks(starterTasks);
      }
    }
    accountConnectedOnce.current = false;
    setLoaded(true);
  }, [accountUser]);
  useEffect(() => {
    if (loaded && accountUser) window.localStorage.setItem(`chaoqun-tasks:${accountUser.id}`, JSON.stringify(tasks));
  }, [tasks, loaded, accountUser]);
  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem('daylight-opacity', String(opacity));
    window.daylightDesktop?.setOpacity(opacity / 100);
  }, [opacity, loaded]);

  const uploadTasks = async (items: Task[], secret: string) => {
    const payload = await encryptTasks(items, secret);
    const response = await fetch('/api/sync', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload }),
    });
    if (!response.ok) throw new Error('云端保存失败');
  };

  const connectWithSecret = async (secret: string) => {
    if (secret.length < 8) {
      setSyncStatus('同步密钥至少需要 8 个字符');
      return;
    }
    setSyncBusy(true);
    setSyncStatus('正在连接云端…');
    try {
      const response = await fetch('/api/sync', { cache: 'no-store' });
      if (!response.ok) throw new Error('无法连接云端');
      const result = await response.json() as { found: boolean; payload?: string };
      if (result.found && result.payload) {
        const remoteTasks = await decryptTasks(result.payload, secret);
        suppressNextUpload.current = true;
        setTasks(remoteTasks);
        setSyncStatus(`同步完成，已获取 ${remoteTasks.length} 项待办`);
      } else {
        await uploadTasks(tasks, secret);
        setSyncStatus(`同步空间已创建，已上传 ${tasks.length} 项待办`);
      }
      setSyncSecret(secret);
      setSyncEnabled(true);
      setSyncReady(true);
    } catch {
      setSyncReady(false);
      setSyncStatus('同步失败，请确认密钥或网络后重试');
    } finally {
      setSyncBusy(false);
    }
  };

  useEffect(() => {
    if (!loaded || !accountSyncSecret || accountConnectedOnce.current) return;
    accountConnectedOnce.current = true;
    setSyncSecret(accountSyncSecret);
    setSyncEnabled(true);
    setSyncStatus('账号已登录，正在同步数据…');
    connectWithSecret(accountSyncSecret);
  }, [loaded, accountSyncSecret]);

  useEffect(() => {
    if (!loaded || !syncEnabled || !syncReady || !syncSecret) return;
    if (suppressNextUpload.current) {
      suppressNextUpload.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      setSyncStatus('正在自动同步…');
      uploadTasks(tasks, syncSecret)
        .then(() => setSyncStatus(`已同步 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`))
        .catch(() => setSyncStatus('自动同步失败，将保留本机数据'));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [tasks, loaded, syncEnabled, syncReady, syncSecret]);

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError('');
    if (authMode === 'register' && authPassword !== authConfirm) {
      setAuthError('两次输入的密码不一致');
      return;
    }
    setAuthBusy(true);
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '操作失败');
      const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
      const session = await sessionResponse.json() as { user: AccountUser; syncSecret: string };
      setAccountUser(session.user);
      setAccountSyncSecret(session.syncSecret);
      setAuthPassword('');
      setAuthConfirm('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '操作失败，请稍后重试');
    } finally {
      setAuthBusy(false);
      setAccountLoading(false);
    }
  };

  const logoutAccount = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAccountUser(null);
    setAccountSyncSecret('');
    setSyncEnabled(false);
    setSyncReady(false);
    setSyncSecret('');
    setLoaded(false);
    setTasks(starterTasks);
    setSettingsOpen(false);
    setSyncStatus('账号已退出');
  };

  const changeDesktopSize = async (preset: DesktopSize) => {
    const state = await window.daylightDesktop?.setSize(preset);
    if (state) setDesktopState(state);
  };

  const toggleAutoStart = async () => {
    const enabled = await window.daylightDesktop?.setAutoStart(!desktopState.autoStart);
    if (typeof enabled === 'boolean') setDesktopState((state) => ({ ...state, autoStart: enabled }));
  };

  const toggleAlwaysOnTop = async () => {
    const enabled = await window.daylightDesktop?.setAlwaysOnTop(!desktopState.alwaysOnTop);
    if (typeof enabled === 'boolean') setDesktopState((state) => ({ ...state, alwaysOnTop: enabled }));
  };

  const monthDays = useMemo(() => buildMonthGrid(viewDate), [viewDate]);
  const visibleTasks = tasks.filter((task) => task.title.toLowerCase().includes(search.trim().toLowerCase()));
  const remaining = tasks.filter((task) => !task.completed).length;

  const openNew = (date: Date) => {
    setEditingId(null);
    setDraftTitle('');
    setDraftDate(keyFor(date));
    setDraftTime('');
    setDraftColor('blue');
    setDraftCompleted(false);
    setDraftReminder(false);
    setEditorOpen(true);
  };

  const openTask = (task: Task) => {
    setEditingId(task.id);
    setDraftTitle(task.title);
    setDraftDate(task.date);
    setDraftTime(task.time ?? '');
    setDraftColor(task.color);
    setDraftCompleted(task.completed);
    setDraftReminder(Boolean(task.reminder));
    setEditorOpen(true);
  };

  const closeEditor = () => setEditorOpen(false);

  const saveTask = (event?: FormEvent) => {
    event?.preventDefault();
    const cleanTitle = draftTitle.trim();
    if (!cleanTitle) return;
    if (editingId) {
      setTasks((current) => current.map((task) => task.id === editingId ? {
        ...task,
        title: cleanTitle,
        date: draftDate,
        time: draftTime || undefined,
        color: draftColor,
        completed: draftCompleted,
        reminder: draftReminder,
      } : task));
    } else {
      setTasks((current) => [...current, {
        id: crypto.randomUUID(),
        title: cleanTitle,
        date: draftDate,
        time: draftTime || undefined,
        color: draftColor,
        completed: draftCompleted,
        reminder: draftReminder,
      }]);
    }
    closeEditor();
  };

  const deleteTask = () => {
    if (editingId) setTasks((current) => current.filter((task) => task.id !== editingId));
    closeEditor();
  };

  const duplicateTask = () => {
    const cleanTitle = draftTitle.trim();
    if (!cleanTitle) return;
    setTasks((current) => [...current, {
      id: crypto.randomUUID(),
      title: `${cleanTitle}（副本）`,
      date: draftDate,
      time: draftTime || undefined,
      color: draftColor,
      completed: false,
      reminder: draftReminder,
    }]);
    closeEditor();
  };

  const moveToTomorrow = () => {
    const next = parseKey(draftDate);
    next.setDate(next.getDate() + 1);
    setDraftDate(keyFor(next));
  };

  if (accountLoading || !accountUser) {
    return (
      <main className="login-gate">
        <section className="login-card">
          {isDesktop && <div className="login-window-bar"><span>chaoquncalender</span><div className="desktop-window-buttons"><button type="button" onClick={() => window.daylightDesktop?.minimize()} aria-label="最小化"><Minimize2 /></button><button type="button" onClick={() => window.daylightDesktop?.close()} aria-label="关闭"><X /></button></div></div>}
          <div className="login-logo"><CalendarDays /></div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200/60">chaoquncalender</p>
          <h1 className="mt-2 text-2xl font-bold text-white">{authMode === 'login' ? '登录你的日历' : '创建日历账号'}</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-300">在当前服务器注册账号，多台电脑登录同一账号即可同步待办。</p>
          {accountLoading ? <div className="mt-7 flex items-center gap-2 text-sm text-cyan-100/70"><RefreshCw className="size-4 animate-spin" />正在检查登录状态…</div> : (
            <form className="mt-6 w-full max-w-xs space-y-3" onSubmit={submitAuth}>
              <Input value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} autoComplete="username" placeholder="用户名（3–32 个字符）" aria-label="用户名" className="h-11 border-white/15 bg-white/8 text-white placeholder:text-white/35" />
              <Input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} placeholder="密码（至少 8 个字符）" aria-label="密码" className="h-11 border-white/15 bg-white/8 text-white placeholder:text-white/35" />
              {authMode === 'register' && <Input type="password" value={authConfirm} onChange={(event) => setAuthConfirm(event.target.value)} autoComplete="new-password" placeholder="再次输入密码" aria-label="确认密码" className="h-11 border-white/15 bg-white/8 text-white placeholder:text-white/35" />}
              {authError && <p className="rounded-xl bg-red-400/10 px-3 py-2 text-left text-xs leading-5 text-red-200">{authError}</p>}
              <Button type="submit" disabled={authBusy} className="h-11 w-full bg-[#12b7f5] text-base hover:bg-[#0da7e1]">{authBusy && <RefreshCw className="animate-spin" />}{authMode === 'login' ? '登录并同步' : '注册并登录'}</Button>
              <button type="button" className="text-sm text-cyan-200/75 hover:text-cyan-100" onClick={() => { setAuthMode((mode) => mode === 'login' ? 'register' : 'login'); setAuthError(''); }}>{authMode === 'login' ? '没有账号？立即注册' : '已有账号？返回登录'}</button>
            </form>
          )}
          <p className="mt-5 text-xs text-slate-500">密码经过加盐哈希保存，服务器不会保存明文密码。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07101e] p-2 text-white sm:p-3 lg:p-4">
      <section style={{ opacity: isDesktop ? 1 : opacity / 100 }} className="calendar-shell mx-auto min-h-[calc(100vh-16px)] max-w-[1700px] overflow-hidden rounded-[24px] border border-white/10 bg-[#102844] shadow-[0_30px_90px_rgba(0,0,0,0.35)] transition-opacity sm:min-h-[calc(100vh-24px)] lg:min-h-[calc(100vh-32px)]">
        <header className="calendar-topbar">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/60">chaoquncalender</p>
            <h1 className="truncate text-base font-semibold text-[#fff8ae] sm:text-lg">今天是 {formatDate(today)}</h1>
          </div>
          <label className="relative hidden w-56 md:block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/45" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索待办…" aria-label="搜索待办" className="h-9 border-white/10 bg-white/8 pl-9 text-white placeholder:text-white/40" />
          </label>
          <div className="flex items-center gap-1">
            <span className="mr-2 hidden rounded-full bg-white/8 px-3 py-1.5 text-xs text-white/65 sm:inline">{remaining} 项待完成</span>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setViewDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))} aria-label="上个月"><ChevronLeft /></Button>
            <Button variant="ghost" className="hidden text-[#fff8ae] hover:bg-white/10 hover:text-[#fff8ae] sm:inline-flex" onClick={() => setViewDate(today)}>今天</Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setViewDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))} aria-label="下个月"><ChevronRight /></Button>
            <details className="native-menu">
              <summary className="native-menu-trigger text-white" aria-label="日历菜单"><Menu /></summary>
              <div className="native-menu-panel right-0 w-48">
                <p className="native-menu-label">{viewDate.getFullYear()}年 {viewDate.getMonth() + 1}月</p>
                <button type="button" onClick={() => openNew(today)}><Plus /> 新建今日待办</button>
                <button type="button" onClick={() => setSearch('')}><RotateCcw /> 清除搜索</button>
                <button type="button" onClick={() => setSettingsOpen(true)}><Settings2 /> 设置与同步</button>
              </div>
            </details>
            {isDesktop && <div className="desktop-window-buttons"><button type="button" onClick={() => window.daylightDesktop?.minimize()} aria-label="最小化"><Minimize2 /></button><button type="button" onClick={() => window.daylightDesktop?.close()} aria-label="关闭"><X /></button></div>}
          </div>
        </header>

        <div className="grid grid-cols-7 border-y border-white/12 bg-[#6f9fb8] text-center text-[11px] font-semibold text-[#fffbd0] sm:text-sm">
          {DAYS.map((day) => <div className="border-r border-[#173650] px-1 py-2 last:border-r-0" key={day}>{day}</div>)}
        </div>

        <div className="calendar-grid">
          {monthDays.map((date) => {
            const dateKey = keyFor(date);
            const dateTasks = visibleTasks.filter((task) => task.date === dateKey);
            const isToday = dateKey === keyFor(today);
            const muted = !sameMonth(date, viewDate);
            return (
              <section key={dateKey} className={`date-cell ${muted ? 'date-cell-muted' : ''} ${isToday ? 'date-cell-today' : ''}`}>
                <button type="button" className="date-cell-header" onClick={() => openNew(date)} aria-label={`${formatDate(date)}添加待办`}>
                  <span className="date-number">{date.getDate()}</span>
                  {date.getDate() === 1 && <span className="month-tag">{date.getMonth() + 1}月</span>}
                  <Plus className="date-add" />
                </button>
                <div className="date-task-list">
                  {dateTasks.slice(0, 4).map((task) => (
                    <button type="button" key={task.id} onClick={() => openTask(task)} className={`calendar-task calendar-task-${task.color} ${task.completed ? 'calendar-task-done' : ''}`}>
                      <span className="calendar-task-mark">{task.completed ? <Check /> : task.time ? task.time : '·'}</span>
                      <span className="truncate">{task.title}</span>
                      {task.reminder && <BellRing className="ml-auto size-3 shrink-0" />}
                    </button>
                  ))}
                  {dateTasks.length > 4 && <button type="button" className="more-tasks" onClick={() => openTask(dateTasks[4])}>还有 {dateTasks.length - 4} 项</button>}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {settingsOpen && (
        <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-panel" aria-label="设置与同步">
            <div className="editor-heading">
              <span className="editor-color editor-color-blue" />
              <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">chaoquncalender</p><h2 className="text-lg font-bold text-slate-900">设置与账号同步</h2></div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setSettingsOpen(false)} aria-label="关闭设置"><X /></Button>
            </div>

            <div className="settings-block">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#12b7f5] text-white"><UserRound className="size-5" /></div>
                <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">日历账号</p><p className="text-xs leading-5 text-slate-500">登录后自动同步不同电脑上的待办。</p></div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-white px-3 py-2"><span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700"><UserRound className="size-4" /><span className="truncate">{accountUser.username}</span></span><Button type="button" variant="ghost" size="sm" onClick={logoutAccount}>退出</Button></div>
            </div>

            {isDesktop && <div className="settings-block">
              <div className="flex items-center justify-between"><div><p className="font-semibold text-slate-800">桌面小组件</p><p className="text-xs text-slate-500">拖动窗口边缘也可以自由调整大小。</p></div><span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-primary">Win11</span></div>
              <div className="mt-3 grid grid-cols-3 gap-2">{(['compact', 'standard', 'large'] as DesktopSize[]).map((size, index) => <Button key={size} type="button" size="sm" variant={desktopState.sizePreset === size ? 'default' : 'outline'} onClick={() => changeDesktopSize(size)}>{['紧凑', '标准', '大号'][index]}</Button>)}</div>
              <div className="mt-3 grid grid-cols-2 gap-2"><Button type="button" variant={desktopState.autoStart ? 'secondary' : 'outline'} onClick={toggleAutoStart}>{desktopState.autoStart ? <Check /> : <X />} 开机启动</Button><Button type="button" variant={desktopState.alwaysOnTop ? 'secondary' : 'outline'} onClick={toggleAlwaysOnTop}>{desktopState.alwaysOnTop ? <Pin /> : <PinOff />} {desktopState.alwaysOnTop ? '已置顶' : '不置顶'}</Button></div>
            </div>}

            <div className="settings-block">
              <div className="flex items-center justify-between"><div><p className="font-semibold text-slate-800">界面透明度</p><p className="text-xs text-slate-500">桌面版中也会同步调整窗口透明度</p></div><strong className="text-sm text-primary">{opacity}%</strong></div>
              <input className="opacity-slider" type="range" min="45" max="100" step="5" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} aria-label="界面透明度" />
              <div className="flex justify-between text-[11px] text-slate-400"><span>更透明</span><span>不透明</span></div>
            </div>

            <div className="settings-block">
              <div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary">{syncReady ? <ShieldCheck className="size-5" /> : <Cloud className="size-5" />}</div><div><p className="font-semibold text-slate-800">账号加密同步</p><p className="text-xs leading-5 text-slate-500">同一个账号登录不同电脑后，会自动读取和更新同一份待办。</p></div></div>
              <p className={`mt-3 flex items-center gap-1.5 text-xs ${syncReady ? 'text-emerald-600' : 'text-slate-500'}`}><Cloud className="size-3.5" />{syncStatus}</p>
              <Button type="button" onClick={() => connectWithSecret(accountSyncSecret)} disabled={syncBusy || !accountSyncSecret} className="mt-4 w-full">{syncBusy ? <RefreshCw className="animate-spin" /> : <Cloud />} 立即同步</Button>
              <p className="mt-3 text-[11px] leading-4 text-slate-400">同步数据仍然经过端到端加密，账号退出后将停止访问云端内容。</p>
            </div>
          </section>
        </div>
      )}

      {editorOpen && (
        <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
          <form className="task-editor" onSubmit={saveTask} aria-label={editingId ? '编辑待办' : '新建待办'}>
            <div className="editor-heading">
              <span className={`editor-color editor-color-${draftColor}`} />
              <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{editingId ? '编辑待办' : '新建待办'}</p><p className="truncate text-sm font-semibold text-slate-800">{formatDate(parseKey(draftDate))}</p></div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={closeEditor} aria-label="关闭编辑器"><X /></Button>
            </div>

            <Textarea autoFocus value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="写下待办内容…" className="min-h-32 resize-none border-0 bg-slate-50 p-4 text-[15px] shadow-inner focus-visible:ring-2" />

            <div className="grid grid-cols-2 gap-2">
              <label className="editor-field"><CalendarDays /><input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} aria-label="待办日期" /></label>
              <label className="editor-field"><Clock3 /><input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} aria-label="待办时间" /></label>
            </div>

            <div className="editor-toolbar">
              <Button type="button" variant={draftCompleted ? 'default' : 'ghost'} size="icon" onClick={() => setDraftCompleted((value) => !value)} title="标记完成" aria-label="标记完成"><CircleCheck /></Button>
              <details className="native-menu">
                <summary className="native-menu-trigger" title="选择颜色" aria-label="选择颜色"><Palette /></summary>
                <div className="native-menu-panel left-0 bottom-full mb-2 w-36">
                  <p className="native-menu-label">任务颜色</p>
                  {COLORS.map((color) => <button type="button" key={color.value} onClick={() => setDraftColor(color.value)}><span className={`size-3 rounded-full ${color.className}`} />{color.label}{draftColor === color.value && <Check className="ml-auto" />}</button>)}
                </div>
              </details>
              <Button type="button" variant={draftReminder ? 'secondary' : 'ghost'} size="icon" onClick={() => setDraftReminder((value) => !value)} title="提醒" aria-label="切换提醒">{draftReminder ? <BellRing /> : <Bell />}</Button>
              <details className="native-menu">
                <summary className="native-menu-trigger" title="更多操作" aria-label="更多操作"><Ellipsis /></summary>
                <div className="native-menu-panel left-0 bottom-full mb-2 w-44">
                  <button type="button" onClick={moveToTomorrow}><ChevronRight /> 移到明天</button>
                  <button type="button" onClick={duplicateTask}><Copy /> 创建副本</button>
                  {editingId && <><hr /><button type="button" className="text-red-600" onClick={deleteTask}><Trash2 /> 删除待办</button></>}
                </div>
              </details>
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="ghost" onClick={closeEditor}>取消</Button>
                <Button type="submit" className="min-w-20">保存</Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
