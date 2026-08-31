'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellRing,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Copy,
  Ellipsis,
  Menu,
  Palette,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

  useEffect(() => {
    const saved = window.localStorage.getItem('daylight-tasks');
    if (saved) {
      try { setTasks(JSON.parse(saved) as Task[]); } catch { setTasks(starterTasks); }
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) window.localStorage.setItem('daylight-tasks', JSON.stringify(tasks));
  }, [tasks, loaded]);

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

  return (
    <main className="min-h-screen bg-[#07101e] p-2 text-white sm:p-3 lg:p-4">
      <section className="mx-auto min-h-[calc(100vh-16px)] max-w-[1700px] overflow-hidden rounded-[24px] border border-white/10 bg-[#102844] shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:min-h-[calc(100vh-24px)] lg:min-h-[calc(100vh-32px)]">
        <header className="calendar-topbar">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/60">Daylight Calendar</p>
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
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="日历菜单" />}><Menu /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>{viewDate.getFullYear()}年 {viewDate.getMonth() + 1}月</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => openNew(today)}><Plus /> 新建今日待办</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSearch('')}><RotateCcw /> 清除搜索</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" title="选择颜色" aria-label="选择颜色" />}><Palette /></DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  <DropdownMenuLabel>任务颜色</DropdownMenuLabel>
                  {COLORS.map((color) => <DropdownMenuItem key={color.value} onClick={() => setDraftColor(color.value)}><span className={`size-3 rounded-full ${color.className}`} />{color.label}{draftColor === color.value && <Check className="ml-auto" />}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" variant={draftReminder ? 'secondary' : 'ghost'} size="icon" onClick={() => setDraftReminder((value) => !value)} title="提醒" aria-label="切换提醒">{draftReminder ? <BellRing /> : <Bell />}</Button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" title="更多操作" aria-label="更多操作" />}><Ellipsis /></DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem onClick={moveToTomorrow}><ChevronRight /> 移到明天</DropdownMenuItem>
                  <DropdownMenuItem onClick={duplicateTask}><Copy /> 创建副本</DropdownMenuItem>
                  {editingId && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={deleteTask}><Trash2 /> 删除待办</DropdownMenuItem></>}
                </DropdownMenuContent>
              </DropdownMenu>
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
