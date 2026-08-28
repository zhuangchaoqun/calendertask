'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Circle, Clock3, ListTodo, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

type Task = { id: string; title: string; date: string; time?: string; completed: boolean; color: 'blue' | 'coral' | 'green' | 'gold' };
const DAYS = ['一', '二', '三', '四', '五', '六', '日'];
const COLORS: Task['color'][] = ['blue', 'coral', 'green', 'gold'];
const starterTasks: Task[] = [
  { id: 'welcome-1', title: '整理今天的优先事项', date: '2026-08-28', time: '09:30', completed: true, color: 'blue' },
  { id: 'welcome-2', title: '完成项目周报', date: '2026-08-28', time: '14:00', completed: false, color: 'coral' },
  { id: 'welcome-3', title: '晚间散步 30 分钟', date: '2026-08-28', time: '19:30', completed: false, color: 'green' },
  { id: 'welcome-4', title: '准备下周计划', date: '2026-08-31', completed: false, color: 'gold' },
];

const keyFor = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
function buildMonthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
}

export default function Home() {
  const today = useMemo(() => new Date(2026, 7, 28), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewDate, setViewDate] = useState(today);
  const [tasks, setTasks] = useState<Task[]>(starterTasks);
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('daylight-tasks');
    if (saved) { try { setTasks(JSON.parse(saved) as Task[]); } catch { setTasks(starterTasks); } }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) window.localStorage.setItem('daylight-tasks', JSON.stringify(tasks)); }, [tasks, loaded]);

  const monthDays = useMemo(() => buildMonthGrid(viewDate), [viewDate]);
  const selectedKey = keyFor(selectedDate);
  const filteredTasks = tasks.filter((task) => task.title.toLowerCase().includes(search.trim().toLowerCase()));
  const dayTasks = filteredTasks.filter((task) => task.date === selectedKey);
  const remaining = tasks.filter((task) => !task.completed).length;
  const done = tasks.length - remaining;

  const addTask = (event: FormEvent) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setTasks((current) => [...current, { id: crypto.randomUUID(), title: cleanTitle, date: selectedKey, completed: false, color: COLORS[current.length % COLORS.length] }]);
    setTitle('');
  };
  const moveMonth = (step: number) => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + step, 1));

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-[1540px] grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-sidebar px-5 py-7 md:flex md:flex-col">
          <div className="flex items-center gap-3 px-2">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(42,80,229,0.22)]"><Check className="size-5 stroke-[2.8]" /></div>
            <div><p className="font-heading text-lg font-bold tracking-tight">Daylight</p><p className="text-xs text-muted-foreground">把每一天过清楚</p></div>
          </div>
          <nav className="mt-10 space-y-1.5" aria-label="主导航">
            <button className="nav-item nav-item-active" type="button"><CalendarDays /> 日历<span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[11px]">{remaining}</span></button>
            <button className="nav-item" type="button"><ListTodo /> 所有待办</button>
            <button className="nav-item" type="button"><Sparkles /> 已完成</button>
          </nav>
          <div className="mt-9 px-2">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">清单</p>
            <div className="space-y-3 text-sm">
              <p className="flex items-center gap-3"><span className="size-2.5 rounded-full bg-[#4e6af3]" />工作</p>
              <p className="flex items-center gap-3"><span className="size-2.5 rounded-full bg-[#f27d64]" />生活</p>
              <p className="flex items-center gap-3"><span className="size-2.5 rounded-full bg-[#39a878]" />健康</p>
            </div>
          </div>
          <div className="mt-auto rounded-3xl bg-[#eef1ff] p-5">
            <p className="text-sm font-semibold">今天也很棒</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">你已经完成 {done} 项，继续保持这份轻盈的节奏。</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} /></div>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
          <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <div><p className="mb-1 text-sm text-muted-foreground">星期五 · 2026年8月28日</p><h1 className="font-heading text-3xl font-bold tracking-[-0.04em] sm:text-4xl">早上好，今天要做什么？</h1></div>
            <label className="relative block w-full sm:w-64"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 rounded-2xl border-transparent bg-card pl-10 shadow-sm" placeholder="搜索待办…" aria-label="搜索待办" /></label>
          </header>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
            <section className="overflow-hidden rounded-[30px] border border-border bg-card p-4 shadow-[0_18px_50px_rgba(36,45,74,0.06)] sm:p-7">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2"><Button variant="ghost" size="icon" onClick={() => moveMonth(-1)} aria-label="上个月"><ChevronLeft /></Button><h2 className="min-w-32 text-center font-heading text-xl font-bold">{viewDate.getFullYear()}年 {viewDate.getMonth() + 1}月</h2><Button variant="ghost" size="icon" onClick={() => moveMonth(1)} aria-label="下个月"><ChevronRight /></Button></div>
                <Button variant="outline" className="rounded-xl" onClick={() => { setViewDate(today); setSelectedDate(today); }}>今天</Button>
              </div>
              <div className="grid grid-cols-7 border-b border-border pb-3 text-center text-xs font-semibold text-muted-foreground">{DAYS.map((day) => <span key={day}>{day}</span>)}</div>
              <div className="grid grid-cols-7">
                {monthDays.map((date) => {
                  const dateKey = keyFor(date); const dateTasks = tasks.filter((task) => task.date === dateKey); const selected = dateKey === selectedKey; const isToday = dateKey === keyFor(today);
                  return <button type="button" key={dateKey} onClick={() => setSelectedDate(date)} className={`calendar-day ${!sameMonth(date, viewDate) ? 'calendar-day-muted' : ''} ${selected ? 'calendar-day-selected' : ''}`} aria-label={`${date.getMonth() + 1}月${date.getDate()}日${dateTasks.length ? `，${dateTasks.length}项待办` : ''}`}><span className={isToday && !selected ? 'today-number' : ''}>{date.getDate()}</span>{dateTasks.length > 0 && <span className="mt-auto flex justify-center gap-1" aria-hidden="true">{dateTasks.slice(0, 3).map((task) => <i key={task.id} className={`task-dot task-dot-${task.color}`} />)}</span>}</button>;
                })}
              </div>
            </section>

            <section className="rounded-[30px] border border-border bg-card p-5 shadow-[0_18px_50px_rgba(36,45,74,0.06)] sm:p-7">
              <div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">今日安排</p><h2 className="mt-1 font-heading text-2xl font-bold">{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日</h2></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">{dayTasks.length} 项</span></div>
              <form onSubmit={addTask} className="mb-6 flex gap-2"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="添加一项待办…" aria-label="待办内容" className="h-11 rounded-2xl bg-secondary/70 px-4" /><Button type="submit" size="icon-lg" className="size-11 rounded-2xl shadow-[0_8px_18px_rgba(42,80,229,0.2)]" aria-label="添加待办"><Plus className="size-5" /></Button></form>
              <div className="space-y-2">
                {dayTasks.length === 0 ? <div className="rounded-3xl border border-dashed border-border px-5 py-12 text-center"><Circle className="mx-auto mb-3 size-7 text-muted-foreground/50" /><p className="font-medium">这一天还是空白</p><p className="mt-1 text-sm text-muted-foreground">写下一件想完成的小事吧。</p></div> : dayTasks.map((task) => (
                  <article key={task.id} className={`task-row group ${task.completed ? 'task-row-done' : ''}`}>
                    <Checkbox checked={task.completed} onCheckedChange={(checked) => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, completed: Boolean(checked) } : item))} aria-label={`标记“${task.title}”为${task.completed ? '未完成' : '已完成'}`} className="mt-0.5 size-[18px] rounded-md" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{task.title}</p>{task.time && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3" />{task.time}</p>}</div>
                    <span className={`task-accent task-accent-${task.color}`} />
                    <Button variant="ghost" size="icon-sm" className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))} aria-label={`删除“${task.title}”`}><Trash2 /></Button>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <footer className="mt-6 flex items-center justify-between rounded-2xl bg-[#18202f] px-5 py-4 text-white sm:px-6"><div><p className="text-sm font-semibold">今日进度</p><p className="text-xs text-white/60">专注当下，一次完成一件事。</p></div><div className="text-right"><strong className="text-xl">{done}</strong><span className="text-sm text-white/60"> / {tasks.length}</span></div></footer>
        </section>
      </div>
    </main>
  );
}
