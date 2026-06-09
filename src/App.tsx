import { useState, useEffect, useRef } from 'react';
import {
  format, isToday, isYesterday, parseISO,
  startOfWeek, endOfWeek, eachDayOfInterval,
  startOfMonth, endOfMonth, getDay, addMonths, subMonths,
} from 'date-fns';
import { id } from 'date-fns/locale';
import { Chart, registerables } from 'chart.js';
import {
  LayoutDashboard, CalendarCheck, TrendingUp, Clock,
  Folder, BarChart2, AlertTriangle, Settings,
  ChevronDown, ChevronLeft, ChevronRight,
  Plus, X, FileText, Briefcase,
  CheckCircle2, Circle, Target, Calendar, SquareCheck,
  Smile, Meh, Frown, Zap, Activity, Coffee, Code,
  Pencil, Check,
} from 'lucide-react';
import './App.css';

Chart.register(...registerables);

/* ── Version migration: clear v1 dummy data on first v2 load ─────────── */
if (!localStorage.getItem('scm_v2_clean')) {
  localStorage.removeItem('scm_entries');
  localStorage.removeItem('scm_projects');
  localStorage.removeItem('scm_blockers');
  localStorage.setItem('scm_v2_clean', '1');
}

/* ── Types ────────────────────────────────────────────────────────────── */
type Priority   = 'tinggi' | 'sedang' | 'rendah';
type Mood       = 'berat'  | 'biasa'  | 'oke'    | 'produktif';
type TaskStatus = 'selesai'| 'on_progress' | 'belum_mulai';
type View = 'dashboard'|'dailyplan'|'progress'|'timeline'|'projects'|'weekly'|'reports'|'calendar'|'blockers'|'settings';

interface Task    { id:string; text:string; done:boolean; priority:Priority; status:TaskStatus; }
interface TLItem  { id:string; time:string; activity:string; category:'meeting'|'coding'|'review'|'other'; }
interface Entry   { id:string; date:string; title:string; notes:string; mood:Mood|null; tasks:Task[]; jamKerja:number; timeline:TLItem[]; }
interface Project { id:string; name:string; progress:number; status:'active'|'completed'|'on_hold'; color:string; }
interface Blocker { id:string; title:string; dampak:string; priority:'high'|'medium'|'low'; resolved:boolean; date:string; }
interface AppSettings { nama:string; jabatan:string; targetTask:number; targetJam:number; }

/* ── Constants ────────────────────────────────────────────────────────── */
const MOODS = [
  { value:'berat'    as Mood, label:'Berat',    icon:Frown, color:'#F06060' },
  { value:'biasa'    as Mood, label:'Biasa',    icon:Meh,   color:'#9898A6' },
  { value:'oke'      as Mood, label:'Oke',      icon:Smile, color:'#4ECBA4' },
  { value:'produktif'as Mood, label:'Produktif',icon:Zap,   color:'#C2185B' },
];
const PRIO = {
  tinggi: { label:'Tinggi', color:'#F06060', bg:'rgba(240,96,96,0.12)'   },
  sedang: { label:'Sedang', color:'#F5A623', bg:'rgba(245,166,35,0.12)'  },
  rendah: { label:'Rendah', color:'#4ECBA4', bg:'rgba(78,203,164,0.12)'  },
};
const STAT = {
  selesai:    { label:'Selesai',    color:'#4ECBA4', bg:'rgba(78,203,164,0.12)'  },
  on_progress:{ label:'On Progress',color:'#F5A623', bg:'rgba(245,166,35,0.12)'  },
  belum_mulai:{ label:'Belum Mulai',color:'#9898A6', bg:'rgba(152,152,166,0.12)' },
};
const CAT_COLORS:Record<TLItem['category'],string> = { meeting:'#F5A623', coding:'#4ECBA4', review:'#7C6FF7', other:'#9898A6' };
const CAT_ICONS:Record<TLItem['category'],typeof Coffee> = { meeting:Coffee, coding:Code, review:Activity, other:Briefcase };

/* ── Storage utils ────────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => format(new Date(), 'yyyy-MM-dd');
function load<T>(key:string, fallback:T):T {
  try { return JSON.parse(localStorage.getItem(key)||'null') ?? fallback; } catch { return fallback; }
}
const persist = <T,>(key:string, v:T) => localStorage.setItem(key, JSON.stringify(v));

/* ── Default data (NO dummy data) ─────────────────────────────────────── */
const DEFAULT_SETTINGS:AppSettings = { nama:'Arian Firmansyah', jabatan:'Supply Chain Excellence', targetTask:8, targetJam:8 };

function emptyEntry():Entry {
  return {
    id:uid(), date:todayStr(),
    title: format(new Date(), 'EEEE, d MMMM yyyy', { locale:id }),
    notes:'', mood:null, jamKerja:0, tasks:[], timeline:[],
  };
}

/* ── Helpers ──────────────────────────────────────────────────────────── */
function greeting():string {
  const h = new Date().getHours();
  if (h < 12) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}
function fmtDate(ds:string):string {
  const d = parseISO(ds);
  if (isToday(d))     return 'Hari ini';
  if (isYesterday(d)) return 'Kemarin';
  return format(d, 'EEEE, d MMM yyyy', { locale:id });
}
function initials(name:string) {
  return (name || 'U').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase();
}

/* ── EmptyState component ─────────────────────────────────────────────── */
function EmptyState({ icon:Icon, text }: { icon:typeof Plus; text:string }) {
  return (
    <div className="empty-state">
      <Icon size={36} strokeWidth={1.2} style={{ color:'var(--bg-elevated)' }}/>
      <p>{text}</p>
    </div>
  );
}

/* ── DonutChart ───────────────────────────────────────────────────────── */
function DonutChart({ selesai, onProg, belum }:{ selesai:number; onProg:number; belum:number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<any>(null); // eslint-disable-line

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();
    const total = selesai + onProg + belum;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Selesai','On Progress','Belum Mulai'],
        datasets:[{ data: total ? [selesai, onProg, belum] : [1], backgroundColor: total ? ['#C2185B','#F5A623','#E8ECF0'] : ['#E8ECF0'], borderWidth:0, hoverOffset:4 }],
      },
      options: { cutout:'72%', plugins:{ legend:{ display:false }, tooltip:{ enabled:!!total } }, responsive:true, maintainAspectRatio:false },
    });
    return () => chartRef.current?.destroy();
  }, [selesai, onProg, belum]);

  const pct = selesai+onProg+belum ? Math.round(selesai/(selesai+onProg+belum)*100) : 0;
  return (
    <div className="donut-wrap">
      <canvas ref={canvasRef}/>
      <div className="donut-center"><span className="donut-pct">{pct}%</span><span className="donut-sub">selesai</span></div>
    </div>
  );
}

/* ── LineChart ────────────────────────────────────────────────────────── */
function LineChart({ data }:{ data:{ label:string; value:number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<any>(null); // eslint-disable-line

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type:'line',
      data:{ labels:data.map(d=>d.label), datasets:[{ data:data.map(d=>d.value), borderColor:'#C2185B', backgroundColor:'rgba(194,24,91,0.07)', fill:true, tension:0.4, pointBackgroundColor:'#C2185B', pointRadius:4, pointHoverRadius:6, borderWidth:2 }] },
      options:{ scales:{ y:{ min:0, max:100, ticks:{ color:'rgba(0,0,0,0.35)', font:{ size:10 } }, grid:{ color:'rgba(0,0,0,0.06)' } }, x:{ ticks:{ color:'rgba(0,0,0,0.35)', font:{ size:10 } }, grid:{ display:false } } }, plugins:{ legend:{ display:false } }, responsive:true, maintainAspectRatio:false },
    });
    return () => chartRef.current?.destroy();
  }, [data]);

  return <canvas ref={canvasRef}/>;
}

/* ── QuickNote (debounced) ────────────────────────────────────────────── */
function QuickNote({ value, onSave, readonly }:{ value:string; onSave:(v:string)=>void; readonly?:boolean }) {
  const [text, setText] = useState(value);
  const [savedFlash, setSavedFlash] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => { setText(value); }, [value]);

  const handleChange = (e:React.ChangeEvent<HTMLTextAreaElement>) => {
    if (readonly) return;
    const v = e.target.value;
    setText(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSave(v);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    }, 1000);
  };

  return (
    <div className="quick-note">
      <div className="quick-note-hdr">
        <FileText size={11}/><span>Catatan Cepat</span>
        {savedFlash && <span className="auto-saved-pill">tersimpan</span>}
        {!readonly && <span className="char-counter">{text.length}</span>}
      </div>
      <textarea
        className="quick-note-area"
        placeholder={readonly ? 'Catatan tidak bisa diedit di luar hari ini.' : 'Tulis catatan cepat...'}
        value={text}
        onChange={handleChange}
        readOnly={readonly}
        rows={3}
        style={readonly ? { opacity:0.65, cursor:'default' } : {}}
      />
    </div>
  );
}

/* ── DatePickerDropdown ───────────────────────────────────────────────── */
function DatePickerDropdown({ selectedDate, entries, onSelect }:{
  selectedDate:string; entries:Entry[]; onSelect:(d:string)=>void;
}) {
  const [viewMonth, setViewMonth] = useState(()=>startOfMonth(parseISO(selectedDate)));
  const first = startOfMonth(viewMonth);
  const days  = eachDayOfInterval({ start:first, end:endOfMonth(viewMonth) });
  const pad   = getDay(first)===0 ? 6 : getDay(first)-1;
  const entryDates = new Set(entries.map(e=>e.date));
  const today = todayStr();

  return (
    <div className="dp-dropdown">
      <div className="dp-header">
        <button className="dp-nav-btn" onClick={()=>setViewMonth(subMonths(viewMonth,1))}><ChevronLeft size={12}/></button>
        <span className="dp-month-lbl">{format(viewMonth,'MMMM yyyy',{ locale:id })}</span>
        <button className="dp-nav-btn" onClick={()=>setViewMonth(addMonths(viewMonth,1))}><ChevronRight size={12}/></button>
      </div>
      <div className="dp-grid">
        {['Sen','Sel','Rab','Kam','Jum','Sab','Min'].map(d=><div key={d} className="dp-dow">{d}</div>)}
        {Array(pad).fill(null).map((_,i)=><div key={`p${i}`}/>)}
        {days.map(day=>{
          const ds = format(day,'yyyy-MM-dd');
          return (
            <button key={ds}
              className={`dp-day${ds===selectedDate?' dp-selected':''}${ds===today?' dp-today':''}`}
              onClick={()=>onSelect(ds)}
            >
              {format(day,'d')}
              {entryDates.has(ds)&&<span className="dp-dot"/>}
            </button>
          );
        })}
      </div>
      <div className="dp-footer">
        <button className="dp-today-btn" onClick={()=>onSelect(today)}>Hari ini</button>
      </div>
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────────────────────── */
function Dashboard({ entries, projects, blockers, settings, onToggleTask, onUpdateEntry, onSetView }:{
  entries:Entry[]; projects:Project[]; blockers:Blocker[]; settings:AppSettings;
  onToggleTask:(id:string)=>void; onUpdateEntry:(p:Partial<Entry>)=>void; onSetView:(v:View)=>void;
}) {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showPicker,   setShowPicker]   = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const isViewingToday = selectedDate === todayStr();

  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setShowPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const today   = entries.find(e => e.date === selectedDate);
  const tasks   = today?.tasks || [];
  const selesai = tasks.filter(t => t.status==='selesai').length;
  const onProg  = tasks.filter(t => t.status==='on_progress').length;
  const belum   = tasks.filter(t => t.status==='belum_mulai').length;
  const done    = tasks.filter(t => t.done).length;
  const rate    = tasks.length ? Math.round(done/tasks.length*100) : 0;
  const activeB = blockers.filter(b => !b.resolved);

  const weekDays = eachDayOfInterval({ start:startOfWeek(new Date(),{ weekStartsOn:1 }), end:endOfWeek(new Date(),{ weekStartsOn:1 }) });
  const weekData = weekDays.map(day => {
    const ds  = format(day,'yyyy-MM-dd');
    const ent = entries.find(e => e.date===ds);
    const t   = ent?.tasks.length||0;
    const d   = ent?.tasks.filter(x=>x.done).length||0;
    return { label:format(day,'EEE',{ locale:id }), value:t?Math.round(d/t*100):0, day, ent, t, d };
  });

  const quickActions = [
    { icon:Plus,          label:'Tambah Tugas',    color:'#C2185B', view:'dailyplan'  as View },
    { icon:Clock,         label:'Catat Waktu',      color:'#7C6FF7', view:'timeline'   as View },
    { icon:AlertTriangle, label:'Laporkan Blocker', color:'#F5A623', view:'blockers'   as View },
    { icon:TrendingUp,    label:'Update Progress',  color:'#4ECBA4', view:'progress'   as View },
  ];

  return (
    <div className="dash-wrap">
      <div className="dash-topbar">
        <div>
          <h1 className="dash-greeting">{greeting()}, <span>{(settings.nama||'Pengguna').split(' ')[0]}</span>!</h1>
          <p className="dash-date">
            {isViewingToday
              ? format(new Date(),'EEEE, d MMMM yyyy',{ locale:id })
              : <span className="dp-viewing-badge">Menampilkan: {format(parseISO(selectedDate),'EEEE, d MMMM yyyy',{ locale:id })}</span>
            }
          </p>
        </div>
        <div className="dash-topbar-right">
          <div className="date-picker-wrap" ref={pickerRef}>
            <button
              className={`btn-outline${showPicker?' dp-btn-active':''}`}
              onClick={()=>setShowPicker(v=>!v)}
            >
              <Calendar size={13}/>
              {isViewingToday
                ? 'Pilih Tanggal'
                : format(parseISO(selectedDate),'d MMM yyyy',{ locale:id })
              }
              {!isViewingToday && (
                <X size={11} style={{ marginLeft:2, opacity:0.6 }}
                  onClick={e=>{ e.stopPropagation(); setSelectedDate(todayStr()); setShowPicker(false); }}/>
              )}
            </button>
            {showPicker && (
              <DatePickerDropdown
                selectedDate={selectedDate}
                entries={entries}
                onSelect={d=>{ setSelectedDate(d); setShowPicker(false); }}
              />
            )}
          </div>
          <button className="btn-accent-main" onClick={()=>onSetView('dailyplan')}><Plus size={13}/> Add Journal</button>
        </div>
      </div>

      <div className="metrics-grid">
        {[
          { label:'Total Task',      value:String(tasks.length),      icon:Target,        color:'#C2185B', sub:`target ${settings.targetTask}` },
          { label:'Completion Rate', value:`${rate}%`,                icon:TrendingUp,    color:'#4ECBA4', sub:`${done} selesai` },
          { label:'On Progress',     value:String(onProg),            icon:Activity,      color:'#F5A623', sub:'sedang dikerjakan' },
          { label:'Blocker',         value:String(activeB.length),    icon:AlertTriangle, color:'#F06060', sub:'hambatan aktif' },
          { label:'Total Jam',       value:`${today?.jamKerja||0}h`,  icon:Clock,         color:'#7C6FF7', sub:`target ${settings.targetJam}h` },
        ].map(({ label, value, icon:Icon, color, sub }) => (
          <div className="metric-card" key={label}>
            <div className="metric-icon" style={{ background:`${color}18`, color }}><Icon size={17} strokeWidth={1.7}/></div>
            <div className="metric-body">
              <div className="metric-value">{value}</div>
              <div className="metric-label">{label}</div>
              <div className="metric-sub">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dash-mid">
        <div className="card">
          <div className="card-header"><Folder size={13} style={{ color:'var(--accent)' }}/><span>Progress Proyek</span></div>
          {projects.filter(p=>p.status==='active').length===0
            ? <EmptyState icon={Folder} text="Belum ada proyek aktif. Tambah di halaman Projects."/>
            : <div className="proj-list">
                {projects.filter(p=>p.status==='active').map(p => (
                  <div className="proj-row" key={p.id}>
                    <div className="proj-name-row">
                      <span className="proj-dot" style={{ background:p.color }}/>
                      <span className="proj-name">{p.name}</span>
                      <span className="proj-pct" style={{ color:p.color }}>{p.progress}%</span>
                    </div>
                    <div className="proj-bar-track"><div className="proj-bar-fill" style={{ width:`${p.progress}%`, background:p.color }}/></div>
                  </div>
                ))}
              </div>
          }
        </div>

        <div className="card donut-card">
          <div className="card-header"><BarChart2 size={13} style={{ color:'var(--accent)' }}/><span>{isViewingToday?'Progress Hari Ini':`Progress ${format(parseISO(selectedDate),'d MMM',{locale:id})}`}</span></div>
          <DonutChart selesai={selesai} onProg={onProg} belum={belum}/>
          <div className="donut-legend">
            {[{ label:'Selesai',c:'#C2185B',v:selesai },{ label:'On Progress',c:'#F5A623',v:onProg },{ label:'Belum Mulai',c:'#E8ECF0',v:belum }].map(l=>(
              <div className="legend-item" key={l.label}>
                <span className="legend-dot" style={{ background:l.c, border:l.c==='#E8ECF0'?'1px solid #ccc':'none' }}/>
                <span className="legend-label">{l.label}</span>
                <span className="legend-val">{l.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><AlertTriangle size={13} style={{ color:'var(--accent)' }}/><span>Blocker Aktif</span></div>
          {activeB.length===0
            ? <EmptyState icon={AlertTriangle} text="Tidak ada blocker aktif."/>
            : <div className="blocker-list">
                {activeB.slice(0,3).map(b=>(
                  <div key={b.id} className="blocker-card" data-priority={b.priority}>
                    <span className="blocker-badge" data-priority={b.priority}>{b.priority==='high'?'High':b.priority==='medium'?'Medium':'Low'}</span>
                    <div className="blocker-title">{b.title}</div>
                    <div className="blocker-dampak">{b.dampak}</div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      <div className="dash-bottom">
        <div className="card">
          <div className="card-header">
            <SquareCheck size={13} style={{ color:'var(--accent)' }}/>
            <span>{isViewingToday?'Daily Plan':`Daily Plan · ${format(parseISO(selectedDate),'d MMM',{locale:id})}`}</span>
          </div>
          {tasks.length===0
            ? <EmptyState icon={SquareCheck} text={isViewingToday?"Belum ada tugas hari ini.":"Tidak ada tugas untuk tanggal ini."}/>
            : <div className="plan-list">
                {tasks.slice(0,6).map(t=>(
                  <div className="plan-item" key={t.id}>
                    <button className="task-check-btn"
                      onClick={()=>isViewingToday&&onToggleTask(t.id)}
                      style={!isViewingToday?{ opacity:0.5, cursor:'default' }:{}}
                    >
                      {t.done ? <CheckCircle2 size={15} style={{ color:'#C2185B' }}/> : <Circle size={15} style={{ color:'var(--text-muted)' }}/>}
                    </button>
                    <span className={`plan-text${t.done?' done':''}`}>{t.text}</span>
                    <span className="plan-badge" style={{ color:STAT[t.status].color, background:STAT[t.status].bg }}>{STAT[t.status].label}</span>
                  </div>
                ))}
              </div>
          }
          {tasks.length>0 && (
            <div className="plan-footer">
              <div className="plan-prog-track"><div className="plan-prog-fill" style={{ width:`${rate}%` }}/></div>
              <span className="plan-footer-txt">{done}/{tasks.length} · <b style={{ color:'var(--accent)' }}>{rate}%</b></span>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><Clock size={13} style={{ color:'var(--accent)' }}/><span>Timeline</span></div>
          {(today?.timeline||[]).length===0
            ? <EmptyState icon={Clock} text="Belum ada aktivitas."/>
            : <div className="tl-list">
                {(today?.timeline||[]).slice(0,5).map((item,idx,arr)=>{
                  const Icon=CAT_ICONS[item.category];
                  return (
                    <div className="tl-item" key={item.id}>
                      <div className="tl-time">{item.time}</div>
                      <div className="tl-line-col">
                        <div className={`tl-dot${idx===0?' tl-dot-active':''}`} style={{ background:CAT_COLORS[item.category] }}/>
                        {idx<arr.length-1&&<div className="tl-connector"/>}
                      </div>
                      <div className="tl-body"><Icon size={11} style={{ color:CAT_COLORS[item.category],flexShrink:0 }}/><span>{item.activity}</span></div>
                    </div>
                  );
                })}
              </div>
          }
        </div>

        <div className="card">
          <div className="card-header"><BarChart2 size={13} style={{ color:'var(--accent)' }}/><span>Ringkasan Minggu</span></div>
          <div className="week-mini-grid">
            {weekData.map(w=>(
              <div className="week-mini-day" key={format(w.day,'yyyy-MM-dd')}>
                <div className="week-mini-bar-wrap">
                  <div className="week-mini-bar" style={{ height:`${w.t?Math.max(4,w.d/w.t*52):4}px`, background:w.ent?'var(--accent)':'#E8ECF0' }}/>
                </div>
                <span className="week-mini-lbl">{w.label}</span>
                <span className="week-mini-cnt">{w.d}/{w.t}</span>
              </div>
            ))}
          </div>
          <div className="week-chart-wrap"><LineChart data={weekData.map(w=>({ label:w.label, value:w.value }))}/></div>
        </div>

        <div className="card qa-card">
          <div className="card-header"><Zap size={13} style={{ color:'var(--accent)' }}/><span>Aksi Cepat</span></div>
          <div className="qa-grid">
            {quickActions.map(({ icon:Ic, label, color, view })=>(
              <button className="qa-btn" key={label} onClick={()=>onSetView(view)}>
                <Ic size={16} strokeWidth={1.7} style={{ color }}/>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <QuickNote value={today?.notes||''} onSave={notes=>onUpdateEntry({ notes })} readonly={!isViewingToday}/>
        </div>
      </div>
    </div>
  );
}

/* ── DailyPlan ────────────────────────────────────────────────────────── */
function DailyPlan({ entries, onUpdateEntry }:{
  entries:Entry[]; onUpdateEntry:(p:Partial<Entry>)=>void;
}) {
  const today = entries.find(e=>e.date===todayStr());
  const tasks = today?.tasks||[];

  const [isAdding, setIsAdding] = useState(false);
  const [newT, setNewT] = useState<{ text:string; priority:Priority; status:TaskStatus }>({ text:'', priority:'sedang', status:'belum_mulai' });
  const [editId, setEditId] = useState<string|null>(null);
  const [editD, setEditD] = useState<{ text:string; priority:Priority; status:TaskStatus }>({ text:'', priority:'sedang', status:'belum_mulai' });
  const [filter, setFilter] = useState<'all'|TaskStatus>('all');

  const filtered = filter==='all' ? tasks : tasks.filter(t=>t.status===filter);
  const done = tasks.filter(t=>t.done).length;
  const rate = tasks.length ? Math.round(done/tasks.length*100) : 0;

  const addTask = () => {
    if (!newT.text.trim()) return;
    const t:Task = { id:uid(), text:newT.text.trim(), done:newT.status==='selesai', priority:newT.priority, status:newT.status };
    onUpdateEntry({ tasks:[...tasks, t] });
    setIsAdding(false);
    setNewT({ text:'', priority:'sedang', status:'belum_mulai' });
  };
  const startEdit = (t:Task) => { setEditId(t.id); setEditD({ text:t.text, priority:t.priority, status:t.status }); };
  const saveEdit = () => {
    if (!editId||!editD.text.trim()) return;
    onUpdateEntry({ tasks:tasks.map(t=>t.id===editId?{ ...t, ...editD, done:editD.status==='selesai' }:t) });
    setEditId(null);
  };
  const cancelEdit = () => setEditId(null);
  const delTask = (tid:string) => onUpdateEntry({ tasks:tasks.filter(t=>t.id!==tid) });
  const toggleTask = (tid:string) => onUpdateEntry({ tasks:tasks.map(t=>t.id===tid?{ ...t, done:!t.done, status:!t.done?'selesai':'belum_mulai' }:t) });

  return (
    <div className="view-wrap">
      <div className="view-header">
        <div><div className="view-sub">Hari ini · {fmtDate(todayStr())}</div><h1 className="view-title">Daily Plan</h1></div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div className="filter-tabs">
            {(['all','belum_mulai','on_progress','selesai'] as const).map(f=>(
              <button key={f} className={`ftab${filter===f?' active':''}`} onClick={()=>setFilter(f)}>
                {f==='all'?'Semua':STAT[f].label}
              </button>
            ))}
          </div>
          <button className="btn-accent-main" onClick={()=>{ setIsAdding(true); setEditId(null); }}><Plus size={13}/> Tambah Task</button>
        </div>
      </div>
      <div className="view-body">
        {isAdding && (
          <div className="add-inline-card fade-in">
            <input className="inline-input-full" placeholder="Nama task baru..." autoFocus
              value={newT.text} onChange={e=>setNewT({...newT,text:e.target.value})}
              onKeyDown={e=>{ if(e.key==='Enter') addTask(); if(e.key==='Escape') setIsAdding(false); }}/>
            <div className="add-inline-row">
              <select className="sel" value={newT.priority} onChange={e=>setNewT({...newT,priority:e.target.value as Priority})}>
                <option value="tinggi">Tinggi</option><option value="sedang">Sedang</option><option value="rendah">Rendah</option>
              </select>
              <select className="sel" value={newT.status} onChange={e=>setNewT({...newT,status:e.target.value as TaskStatus})}>
                <option value="belum_mulai">Belum Mulai</option><option value="on_progress">On Progress</option><option value="selesai">Selesai</option>
              </select>
              <button className="btn-save-inline" onClick={addTask}><Check size={13}/></button>
              <button className="btn-cancel-inline" onClick={()=>setIsAdding(false)}><X size={13}/></button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <SquareCheck size={13} style={{ color:'var(--accent)' }}/><span>Tugas Hari Ini</span>
            <span className="count-pill">{done}/{tasks.length}</span>
          </div>
          <div className="task-list">
            {filtered.length===0 && (
              isAdding ? null : <EmptyState icon={SquareCheck} text={filter==='all'?'Belum ada tugas. Klik + Tambah Task.':'Tidak ada tugas dengan status ini.'}/>
            )}
            {filtered.map(t => (
              editId===t.id ? (
                <div key={t.id} className="task-row editing fade-in">
                  <button className="task-check-btn" onClick={()=>toggleTask(t.id)}>
                    {t.done?<CheckCircle2 size={16} style={{ color:'#C2185B' }}/>:<Circle size={16} style={{ color:'var(--text-muted)' }}/>}
                  </button>
                  <input className="inline-input flex-1" autoFocus value={editD.text}
                    onChange={e=>setEditD({...editD,text:e.target.value})}
                    onKeyDown={e=>{ if(e.key==='Enter') saveEdit(); if(e.key==='Escape') cancelEdit(); }}/>
                  <select className="sel-sm" value={editD.priority} onChange={e=>setEditD({...editD,priority:e.target.value as Priority})}>
                    <option value="tinggi">Tinggi</option><option value="sedang">Sedang</option><option value="rendah">Rendah</option>
                  </select>
                  <select className="sel-sm" value={editD.status} onChange={e=>setEditD({...editD,status:e.target.value as TaskStatus})}>
                    <option value="belum_mulai">Belum Mulai</option><option value="on_progress">On Progress</option><option value="selesai">Selesai</option>
                  </select>
                  <button className="btn-save-inline" onClick={saveEdit}><Check size={12}/></button>
                  <button className="btn-cancel-inline" onClick={cancelEdit}><X size={12}/></button>
                </div>
              ) : (
                <div key={t.id} className={`task-row item-row${t.done?' done':''}`}>
                  <button className="task-check-btn" onClick={()=>toggleTask(t.id)}>
                    {t.done?<CheckCircle2 size={16} style={{ color:'#C2185B' }}/>:<Circle size={16} style={{ color:'var(--text-muted)' }}/>}
                  </button>
                  <span className={`task-text${t.done?' done':''}`}>{t.text}</span>
                  <span className="prio-badge" style={{ color:PRIO[t.priority].color, background:PRIO[t.priority].bg }}>{PRIO[t.priority].label}</span>
                  <span className="stat-badge-sm" style={{ color:STAT[t.status].color, background:STAT[t.status].bg }}>{STAT[t.status].label}</span>
                  <div className="item-actions">
                    <button className="action-btn" onClick={()=>startEdit(t)} title="Edit"><Pencil size={12}/></button>
                    <button className="action-btn del" onClick={()=>delTask(t.id)} title="Hapus"><X size={12}/></button>
                  </div>
                </div>
              )
            ))}
          </div>
          {tasks.length>0 && (
            <div className="plan-footer">
              <div className="plan-prog-track"><div className="plan-prog-fill" style={{ width:`${rate}%` }}/></div>
              <span className="plan-footer-txt">{done}/{tasks.length} selesai · <b style={{ color:'var(--accent)' }}>{rate}%</b></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Progress Update ──────────────────────────────────────────────────── */
function ProgressUpdate({ entries, projects, onUpdateEntry, onUpdateProject }:{
  entries:Entry[]; projects:Project[];
  onUpdateEntry:(p:Partial<Entry>)=>void;
  onUpdateProject:(id:string,progress:number)=>void;
}) {
  const today = entries.find(e=>e.date===todayStr());
  const tasks = today?.tasks||[];
  const setStatus = (tid:string, s:TaskStatus) => onUpdateEntry({ tasks:tasks.map(t=>t.id===tid?{ ...t, status:s, done:s==='selesai' }:t) });

  return (
    <div className="view-wrap">
      <div className="view-header"><div><div className="view-sub">Update status pekerjaan</div><h1 className="view-title">Progress Update</h1></div></div>
      <div className="view-body">
        <div className="card">
          <div className="card-header"><TrendingUp size={13} style={{ color:'var(--accent)' }}/><span>Status Tugas Hari Ini</span></div>
          {tasks.length===0
            ? <EmptyState icon={TrendingUp} text="Belum ada tugas. Tambah dulu di Daily Plan."/>
            : <div className="task-list">
                {tasks.map(t=>(
                  <div key={t.id} className="task-row">
                    <span className="task-text" style={{ flex:1 }}>{t.text}</span>
                    <span className="prio-badge" style={{ color:PRIO[t.priority].color, background:PRIO[t.priority].bg }}>{PRIO[t.priority].label}</span>
                    <div className="stat-btn-grp">
                      {(['belum_mulai','on_progress','selesai'] as TaskStatus[]).map(s=>(
                        <button key={s} className={`stat-btn${t.status===s?' active':''}`}
                          style={t.status===s?{ borderColor:STAT[s].color, color:STAT[s].color, background:STAT[s].bg }:{}}
                          onClick={()=>setStatus(t.id,s)}>{STAT[s].label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>

        <div className="card">
          <div className="card-header"><Folder size={13} style={{ color:'var(--accent)' }}/><span>Progress Proyek</span></div>
          {projects.length===0
            ? <EmptyState icon={Folder} text="Belum ada proyek. Tambah di halaman Projects."/>
            : <div className="proj-update-list">
                {projects.map(p=>(
                  <div key={p.id} className="proj-update-row">
                    <div className="proj-name-row">
                      <span className="proj-dot" style={{ background:p.color }}/>
                      <span className="proj-name">{p.name}</span>
                      <span className="proj-pct" style={{ color:p.color, fontWeight:600 }}>{p.progress}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={p.progress} className="proj-slider" style={{ accentColor:p.color }}
                      onChange={e=>onUpdateProject(p.id,Number(e.target.value))}/>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  );
}

/* ── Timeline View ────────────────────────────────────────────────────── */
function TimelineView({ entries, onUpdateEntry }:{
  entries:Entry[]; onUpdateEntry:(p:Partial<Entry>)=>void;
}) {
  const today = entries.find(e=>e.date===todayStr());
  const items = today?.timeline||[];

  const [isAdding, setIsAdding] = useState(false);
  const [newI, setNewI] = useState<{ time:string; activity:string; category:TLItem['category'] }>({ time:'', activity:'', category:'other' });
  const [editId, setEditId] = useState<string|null>(null);
  const [editD, setEditD] = useState<{ time:string; activity:string; category:TLItem['category'] }>({ time:'', activity:'', category:'other' });

  const addItem = () => {
    if (!newI.time||!newI.activity.trim()) return;
    const item:TLItem = { id:uid(), time:newI.time, activity:newI.activity.trim(), category:newI.category };
    const sorted = [...items, item].sort((a,b)=>a.time.localeCompare(b.time));
    onUpdateEntry({ timeline:sorted });
    setIsAdding(false);
    setNewI({ time:'', activity:'', category:'other' });
  };
  const startEdit = (i:TLItem) => { setEditId(i.id); setEditD({ time:i.time, activity:i.activity, category:i.category }); };
  const saveEdit = () => {
    if (!editId||!editD.activity.trim()) return;
    const updated = items.map(i=>i.id===editId?{ ...i, ...editD }:i).sort((a,b)=>a.time.localeCompare(b.time));
    onUpdateEntry({ timeline:updated });
    setEditId(null);
  };
  const delItem = (id:string) => onUpdateEntry({ timeline:items.filter(i=>i.id!==id) });

  return (
    <div className="view-wrap">
      <div className="view-header">
        <div><div className="view-sub">Aktivitas harian</div><h1 className="view-title">Timeline</h1></div>
        <button className="btn-accent-main" onClick={()=>{ setIsAdding(true); setEditId(null); }}><Plus size={13}/> Tambah Kegiatan</button>
      </div>
      <div className="view-body">
        {isAdding && (
          <div className="add-inline-card fade-in">
            <div className="add-inline-row">
              <input type="time" className="time-input" value={newI.time} onChange={e=>setNewI({...newI,time:e.target.value})}/>
              <input className="inline-input-full" placeholder="Nama kegiatan..." autoFocus value={newI.activity}
                onChange={e=>setNewI({...newI,activity:e.target.value})}
                onKeyDown={e=>{ if(e.key==='Enter') addItem(); if(e.key==='Escape') setIsAdding(false); }}/>
              <select className="sel" value={newI.category} onChange={e=>setNewI({...newI,category:e.target.value as TLItem['category']})}>
                <option value="meeting">Meeting</option><option value="coding">Coding</option>
                <option value="review">Review</option><option value="other">Lainnya</option>
              </select>
              <button className="btn-save-inline" onClick={addItem}><Check size={13}/></button>
              <button className="btn-cancel-inline" onClick={()=>setIsAdding(false)}><X size={13}/></button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header"><Clock size={13} style={{ color:'var(--accent)' }}/><span>Aktivitas Hari Ini</span></div>
          {items.length===0
            ? <EmptyState icon={Clock} text="Belum ada aktivitas. Klik + Tambah Kegiatan."/>
            : <div className="tl-full-list">
                {items.map((item,idx,arr)=>{
                  const Icon=CAT_ICONS[item.category];
                  const c=CAT_COLORS[item.category];
                  return editId===item.id ? (
                    <div key={item.id} className="tl-full-item fade-in">
                      <input type="time" className="time-input" value={editD.time} onChange={e=>setEditD({...editD,time:e.target.value})} style={{ width:90 }}/>
                      <div className="tl-full-line"><div className="tl-full-dot" style={{ background:c }}/>{idx<arr.length-1&&<div className="tl-full-conn"/>}</div>
                      <div className="tl-full-body" style={{ flex:1 }}>
                        <input className="inline-input flex-1" autoFocus value={editD.activity}
                          onChange={e=>setEditD({...editD,activity:e.target.value})}
                          onKeyDown={e=>{ if(e.key==='Enter') saveEdit(); if(e.key==='Escape') setEditId(null); }}/>
                        <select className="sel-sm" value={editD.category} onChange={e=>setEditD({...editD,category:e.target.value as TLItem['category']})}>
                          <option value="meeting">Meeting</option><option value="coding">Coding</option>
                          <option value="review">Review</option><option value="other">Lainnya</option>
                        </select>
                        <button className="btn-save-inline" onClick={saveEdit}><Check size={12}/></button>
                        <button className="btn-cancel-inline" onClick={()=>setEditId(null)}><X size={12}/></button>
                      </div>
                    </div>
                  ) : (
                    <div key={item.id} className="tl-full-item item-row">
                      <div className="tl-full-time">{item.time}</div>
                      <div className="tl-full-line"><div className="tl-full-dot" style={{ background:c }}/>{idx<arr.length-1&&<div className="tl-full-conn"/>}</div>
                      <div className="tl-full-body">
                        <Icon size={13} style={{ color:c, flexShrink:0 }}/>
                        <span className="tl-full-activity">{item.activity}</span>
                        <span className="tl-cat-badge" style={{ color:c, background:`${c}18` }}>{item.category}</span>
                        <div className="item-actions">
                          <button className="action-btn" onClick={()=>startEdit(item)} title="Edit"><Pencil size={12}/></button>
                          <button className="action-btn del" onClick={()=>delItem(item.id)} title="Hapus"><X size={12}/></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>
      </div>
    </div>
  );
}

/* ── Projects View ────────────────────────────────────────────────────── */
function ProjectsView({ projects, onAdd, onDelete, onUpdate }:{
  projects:Project[];
  onAdd:(p:Project)=>void; onDelete:(id:string)=>void; onUpdate:(p:Project)=>void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newP, setNewP] = useState<{ name:string; color:string }>({ name:'', color:'#C2185B' });
  const [editId, setEditId] = useState<string|null>(null);
  const [editD, setEditD] = useState<{ name:string; progress:number; color:string; status:Project['status'] }>({ name:'', progress:0, color:'#C2185B', status:'active' });

  const addProject = () => {
    if (!newP.name.trim()) return;
    onAdd({ id:uid(), name:newP.name.trim(), progress:0, status:'active', color:newP.color });
    setIsAdding(false);
    setNewP({ name:'', color:'#C2185B' });
  };
  const startEdit = (p:Project) => { setEditId(p.id); setEditD({ name:p.name, progress:p.progress, color:p.color, status:p.status }); };
  const saveEdit = () => {
    if (!editId||!editD.name.trim()) return;
    const p = projects.find(x=>x.id===editId);
    if (p) onUpdate({ ...p, ...editD });
    setEditId(null);
  };

  return (
    <div className="view-wrap">
      <div className="view-header">
        <div><div className="view-sub">Manajemen proyek</div><h1 className="view-title">Projects</h1></div>
        <button className="btn-accent-main" onClick={()=>{ setIsAdding(true); setEditId(null); }}><Plus size={13}/> Tambah Project</button>
      </div>
      <div className="view-body">
        {isAdding && (
          <div className="add-inline-card fade-in">
            <div className="add-inline-row">
              <input className="inline-input-full" placeholder="Nama project..." autoFocus value={newP.name}
                onChange={e=>setNewP({...newP,name:e.target.value})}
                onKeyDown={e=>{ if(e.key==='Enter') addProject(); if(e.key==='Escape') setIsAdding(false); }}/>
              <label className="color-picker-wrap"><span>Warna:</span>
                <input type="color" value={newP.color} onChange={e=>setNewP({...newP,color:e.target.value})} className="color-input"/>
              </label>
              <button className="btn-save-inline" onClick={addProject}><Check size={13}/></button>
              <button className="btn-cancel-inline" onClick={()=>setIsAdding(false)}><X size={13}/></button>
            </div>
          </div>
        )}

        {projects.length===0 && !isAdding
          ? <EmptyState icon={Folder} text="Belum ada proyek. Klik + Tambah Project untuk memulai."/>
          : <div className="projects-grid">
              {projects.map(p=>(
                editId===p.id ? (
                  <div key={p.id} className="project-card editing fade-in">
                    <div className="project-card-top">
                      <div className="proj-icon-wrap" style={{ background:`${editD.color}18`, color:editD.color }}><Folder size={18} strokeWidth={1.6}/></div>
                      <input type="color" value={editD.color} onChange={e=>setEditD({...editD,color:e.target.value})} className="color-input"/>
                    </div>
                    <input className="inline-input-full" value={editD.name} autoFocus onChange={e=>setEditD({...editD,name:e.target.value})}
                      onKeyDown={e=>{ if(e.key==='Enter') saveEdit(); if(e.key==='Escape') setEditId(null); }}/>
                    <select className="stat-sel" value={editD.status} style={{ width:'100%' }} onChange={e=>setEditD({...editD,status:e.target.value as Project['status']})}>
                      <option value="active">Aktif</option><option value="on_hold">On Hold</option><option value="completed">Selesai</option>
                    </select>
                    <div className="proj-pct-row2">
                      <span className="proj-pct-lbl">Progress</span>
                      <input type="number" min="0" max="100" className="inline-input" style={{ width:50, textAlign:'right' }}
                        value={editD.progress} onChange={e=>setEditD({...editD,progress:Math.min(100,Math.max(0,Number(e.target.value)))})}/>
                      <span style={{ fontSize:12 }}>%</span>
                    </div>
                    <div className="proj-bar-track"><div className="proj-bar-fill" style={{ width:`${editD.progress}%`, background:editD.color }}/></div>
                    <input type="range" min="0" max="100" value={editD.progress} className="proj-slider" style={{ accentColor:editD.color, marginTop:6, width:'100%' }}
                      onChange={e=>setEditD({...editD,progress:Number(e.target.value)})}/>
                    <div className="edit-actions-row">
                      <button className="btn-save-inline" onClick={saveEdit}><Check size={12}/> Simpan</button>
                      <button className="btn-cancel-inline" onClick={()=>setEditId(null)}><X size={12}/> Batal</button>
                    </div>
                  </div>
                ) : (
                  <div key={p.id} className="project-card item-row">
                    <div className="project-card-top">
                      <div className="proj-icon-wrap" style={{ background:`${p.color}18`, color:p.color }}><Folder size={18} strokeWidth={1.6}/></div>
                      <div className="item-actions" style={{ opacity:1 }}>
                        <button className="action-btn" onClick={()=>startEdit(p)} title="Edit"><Pencil size={12}/></button>
                        <button className="action-btn del" onClick={()=>onDelete(p.id)} title="Hapus"><X size={13}/></button>
                      </div>
                    </div>
                    <div className="project-card-name">{p.name}</div>
                    <span className="proj-status-badge" style={{
                      color:p.status==='active'?'#4ECBA4':p.status==='completed'?'#C2185B':'#9898A6',
                      background:p.status==='active'?'rgba(78,203,164,0.12)':p.status==='completed'?'rgba(194,24,91,0.12)':'rgba(152,152,166,0.12)',
                    }}>{p.status==='active'?'Aktif':p.status==='completed'?'Selesai':'On Hold'}</span>
                    <div className="proj-pct-row2" style={{ marginTop:8 }}>
                      <span className="proj-pct-lbl">Progress</span>
                      <span style={{ color:p.color, fontWeight:700 }}>{p.progress}%</span>
                    </div>
                    <div className="proj-bar-track"><div className="proj-bar-fill" style={{ width:`${p.progress}%`, background:p.color }}/></div>
                  </div>
                )
              ))}
            </div>
        }
      </div>
    </div>
  );
}

/* ── Weekly Summary ───────────────────────────────────────────────────── */
function WeeklySummaryView({ entries }:{ entries:Entry[] }) {
  const weekDays = eachDayOfInterval({ start:startOfWeek(new Date(),{ weekStartsOn:1 }), end:endOfWeek(new Date(),{ weekStartsOn:1 }) });
  const weekData = weekDays.map(day=>{
    const ds=format(day,'yyyy-MM-dd');
    const ent=entries.find(e=>e.date===ds);
    const t=ent?.tasks.length||0;
    const d=ent?.tasks.filter(x=>x.done).length||0;
    const jam=ent?.jamKerja||0;
    return { day, label:format(day,'EEE d',{ locale:id }), t, d, jam, pct:t?Math.round(d/t*100):0 };
  });
  const totalTask=weekData.reduce((a,d)=>a+d.t,0);
  const totalDone=weekData.reduce((a,d)=>a+d.d,0);
  const totalJam =weekData.reduce((a,d)=>a+d.jam,0);
  const avgPct   =totalTask?Math.round(totalDone/totalTask*100):0;
  const chartData=weekData.map(d=>({ label:format(d.day,'EEE',{ locale:id }), value:d.pct }));

  return (
    <div className="view-wrap">
      <div className="view-header"><div><div className="view-sub">Minggu ini (otomatis terhitung)</div><h1 className="view-title">Weekly Summary</h1></div></div>
      <div className="view-body">
        <div className="stat4-grid">
          {[
            { label:'Total Tugas',  value:String(totalTask),  icon:Target,       color:'#C2185B' },
            { label:'Selesai',      value:String(totalDone),  icon:CheckCircle2, color:'#4ECBA4' },
            { label:'Completion',   value:`${avgPct}%`,       icon:TrendingUp,   color:'#7C6FF7' },
            { label:'Total Jam',    value:`${totalJam}h`,     icon:Clock,        color:'#F5A623' },
          ].map(({ label, value, icon:Icon, color })=>(
            <div className="stat4-card" key={label} style={{ borderTop:`3px solid ${color}` }}>
              <Icon size={20} strokeWidth={1.6} style={{ color }}/>
              <div className="stat4-val">{value}</div>
              <div className="stat4-lbl">{label}</div>
            </div>
          ))}
        </div>

        <div className="weekly-charts-grid">
          <div className="card">
            <div className="card-header"><BarChart2 size={13} style={{ color:'var(--accent)' }}/><span>Trend Penyelesaian Tugas (%)</span></div>
            <div className="chart-wrap-tall"><LineChart data={chartData}/></div>
          </div>
          <div className="card">
            <div className="card-header"><Calendar size={13} style={{ color:'var(--accent)' }}/><span>Detail Per Hari</span></div>
            <div className="weekly-day-list">
              {weekData.map(d=>(
                <div className="weekly-day-row" key={format(d.day,'yyyy-MM-dd')}>
                  <span className="weekly-day-lbl">{d.label}</span>
                  <div className="weekly-day-track"><div className="weekly-day-fill" style={{ width:`${d.pct}%` }}/></div>
                  <span className="weekly-day-pct">{d.d}/{d.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Reports ──────────────────────────────────────────────────────────── */
function ReportsView({ entries, blockers }:{ entries:Entry[]; blockers:Blocker[] }) {
  const allTasks  = entries.flatMap(e=>e.tasks);
  const totalTask = allTasks.length;
  const totalDone = allTasks.filter(t=>t.done).length;
  const rate      = totalTask?Math.round(totalDone/totalTask*100):0;
  const activeB   = blockers.filter(b=>!b.resolved).length;
  const resolvedB = blockers.filter(b=>b.resolved).length;

  return (
    <div className="view-wrap">
      <div className="view-header"><div><div className="view-sub">Ringkasan keseluruhan (otomatis)</div><h1 className="view-title">Reports</h1></div></div>
      <div className="view-body">
        <div className="stat4-grid">
          {[
            { label:'Total Entri',   value:String(entries.length), icon:FileText,      color:'#C2185B' },
            { label:'Total Tugas',   value:String(totalTask),      icon:Target,        color:'#4ECBA4' },
            { label:'Completion',    value:`${rate}%`,             icon:TrendingUp,    color:'#7C6FF7' },
            { label:'Blocker Aktif', value:String(activeB),        icon:AlertTriangle, color:'#F06060' },
          ].map(({ label, value, icon:Icon, color })=>(
            <div className="stat4-card" key={label} style={{ borderTop:`3px solid ${color}` }}>
              <Icon size={20} strokeWidth={1.6} style={{ color }}/>
              <div className="stat4-val">{value}</div>
              <div className="stat4-lbl">{label}</div>
            </div>
          ))}
        </div>

        <div className="reports-2col">
          <div className="card">
            <div className="card-header"><Smile size={13} style={{ color:'var(--accent)' }}/><span>Distribusi Mood</span></div>
            <div className="mood-dist-list">
              {MOODS.map(m=>{
                const Icon=m.icon;
                const cnt=entries.filter(e=>e.mood===m.value).length;
                const pct=entries.length?Math.round(cnt/entries.length*100):0;
                return (
                  <div key={m.value} className="mood-dist-row">
                    <Icon size={14} style={{ color:m.color, flexShrink:0 }}/>
                    <span className="mood-dist-lbl">{m.label}</span>
                    <div className="mood-dist-track"><div className="mood-dist-fill" style={{ width:`${pct}%`, background:m.color }}/></div>
                    <span className="mood-dist-cnt">{cnt}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><AlertTriangle size={13} style={{ color:'var(--accent)' }}/><span>Status Blocker</span></div>
            <div className="report-stat-list">
              {[{ label:'Blocker Aktif',val:activeB,color:'#F06060' },{ label:'Blocker Resolved',val:resolvedB,color:'#4ECBA4' },{ label:'Total',val:blockers.length,color:'#7C6FF7' }].map(({ label,val,color })=>(
                <div key={label} className="report-stat-row">
                  <span className="report-stat-lbl">{label}</span>
                  <div className="report-stat-track"><div className="report-stat-fill" style={{ width:`${blockers.length?val/blockers.length*100:0}%`, background:color }}/></div>
                  <span className="report-stat-val" style={{ color }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Calendar View ────────────────────────────────────────────────────── */
function CalendarView({ entries }:{ entries:Entry[] }) {
  const [cur, setCur] = useState(new Date());
  const first=startOfMonth(cur);
  const last=endOfMonth(cur);
  const days=eachDayOfInterval({ start:first, end:last });
  const startPad=getDay(first)===0?6:getDay(first)-1;

  return (
    <div className="view-wrap">
      <div className="view-header">
        <div><div className="view-sub">Kalender entri</div><h1 className="view-title">Calendar</h1></div>
        <div className="cal-nav">
          <button className="icon-btn" onClick={()=>setCur(subMonths(cur,1))}><ChevronLeft size={15}/></button>
          <span className="cal-month-lbl">{format(cur,'MMMM yyyy',{ locale:id })}</span>
          <button className="icon-btn" onClick={()=>setCur(addMonths(cur,1))}><ChevronRight size={15}/></button>
        </div>
      </div>
      <div className="view-body">
        <div className="card">
          <div className="cal-grid">
            {['Sen','Sel','Rab','Kam','Jum','Sab','Min'].map(d=><div key={d} className="cal-hdr-day">{d}</div>)}
            {Array(startPad).fill(null).map((_,i)=><div key={`pad${i}`}/>)}
            {days.map(day=>{
              const ds=format(day,'yyyy-MM-dd');
              const ent=entries.find(e=>e.date===ds);
              const t=ent?.tasks.length||0;
              const d=ent?.tasks.filter(x=>x.done).length||0;
              const mood=MOODS.find(m=>m.value===ent?.mood);
              return (
                <div key={ds} className={`cal-day${isToday(day)?' cal-today':''}${ent?' cal-has-entry':''}`}>
                  <span className="cal-day-num">{format(day,'d')}</span>
                  {ent&&<><span className="cal-dot"/>{t>0&&<span className="cal-day-mini">{d}/{t}</span>}</>}
                  {mood&&<span className="cal-mood-dot" style={{ background:mood.color }} title={mood.label}/>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Blockers View ────────────────────────────────────────────────────── */
function BlockersView({ blockers, onAdd, onResolve, onDelete, onUpdate }:{
  blockers:Blocker[];
  onAdd:(b:Blocker)=>void; onResolve:(id:string)=>void;
  onDelete:(id:string)=>void; onUpdate:(b:Blocker)=>void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newB, setNewB] = useState<{ title:string; dampak:string; priority:Blocker['priority'] }>({ title:'', dampak:'', priority:'medium' });
  const [editId, setEditId] = useState<string|null>(null);
  const [editD, setEditD] = useState<{ title:string; dampak:string; priority:Blocker['priority'] }>({ title:'', dampak:'', priority:'medium' });

  const addBlocker = () => {
    if (!newB.title.trim()) return;
    onAdd({ id:uid(), title:newB.title.trim(), dampak:newB.dampak.trim(), priority:newB.priority, resolved:false, date:todayStr() });
    setIsAdding(false);
    setNewB({ title:'', dampak:'', priority:'medium' });
  };
  const startEdit = (b:Blocker) => { setEditId(b.id); setEditD({ title:b.title, dampak:b.dampak, priority:b.priority }); };
  const saveEdit = () => {
    if (!editId||!editD.title.trim()) return;
    const b=blockers.find(x=>x.id===editId);
    if (b) onUpdate({ ...b, ...editD });
    setEditId(null);
  };

  const active   = blockers.filter(b=>!b.resolved);
  const resolved = blockers.filter(b=>b.resolved);

  return (
    <div className="view-wrap">
      <div className="view-header">
        <div><div className="view-sub">Hambatan proyek</div><h1 className="view-title">Blockers</h1></div>
        <button className="btn-accent-main" onClick={()=>{ setIsAdding(true); setEditId(null); }}><Plus size={13}/> Tambah Blocker</button>
      </div>
      <div className="view-body">
        {isAdding && (
          <div className="add-inline-card fade-in">
            <input className="inline-input-full" placeholder="Judul blocker..." autoFocus value={newB.title}
              onChange={e=>setNewB({...newB,title:e.target.value})}
              onKeyDown={e=>{ if(e.key==='Enter') addBlocker(); if(e.key==='Escape') setIsAdding(false); }}/>
            <div className="add-inline-row">
              <input className="inline-input-full" placeholder="Dampak terhadap proyek..." value={newB.dampak}
                onChange={e=>setNewB({...newB,dampak:e.target.value})}/>
              <select className="sel" value={newB.priority} onChange={e=>setNewB({...newB,priority:e.target.value as Blocker['priority']})}>
                <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
              <button className="btn-save-inline" onClick={addBlocker}><Check size={13}/></button>
              <button className="btn-cancel-inline" onClick={()=>setIsAdding(false)}><X size={13}/></button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <AlertTriangle size={13} style={{ color:'#F06060' }}/><span>Blocker Aktif</span>
            <span className="count-badge">{active.length}</span>
          </div>
          {active.length===0
            ? <EmptyState icon={AlertTriangle} text="Tidak ada blocker aktif. Bagus!"/>
            : <div className="blocker-full-list">
                {active.map(b=>(
                  editId===b.id ? (
                    <div key={b.id} className="blocker-full-card fade-in">
                      <input className="inline-input-full" autoFocus value={editD.title} onChange={e=>setEditD({...editD,title:e.target.value})}
                        onKeyDown={e=>{ if(e.key==='Enter') saveEdit(); if(e.key==='Escape') setEditId(null); }}
                        placeholder="Judul blocker..."/>
                      <input className="inline-input-full" style={{ marginTop:6 }} value={editD.dampak} onChange={e=>setEditD({...editD,dampak:e.target.value})}
                        placeholder="Dampak..."/>
                      <div className="add-inline-row" style={{ padding:'6px 0 0' }}>
                        <select className="sel" value={editD.priority} onChange={e=>setEditD({...editD,priority:e.target.value as Blocker['priority']})}>
                          <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                        </select>
                        <button className="btn-save-inline" onClick={saveEdit}><Check size={12}/> Simpan</button>
                        <button className="btn-cancel-inline" onClick={()=>setEditId(null)}><X size={12}/> Batal</button>
                      </div>
                    </div>
                  ) : (
                    <div key={b.id} className="blocker-full-card item-row" data-priority={b.priority}>
                      <div className="bfc-top">
                        <span className="blocker-badge" data-priority={b.priority}>{b.priority==='high'?'High':b.priority==='medium'?'Medium':'Low'}</span>
                        <span className="bfc-date">{fmtDate(b.date)}</span>
                        <div className="bfc-actions">
                          <button className="btn-success-sm" onClick={()=>onResolve(b.id)}><CheckCircle2 size={11}/> Resolved</button>
                          <div className="item-actions" style={{ opacity:1 }}>
                            <button className="action-btn" onClick={()=>startEdit(b)} title="Edit"><Pencil size={12}/></button>
                            <button className="action-btn del" onClick={()=>onDelete(b.id)} title="Hapus"><X size={12}/></button>
                          </div>
                        </div>
                      </div>
                      <div className="bfc-title">{b.title}</div>
                      {b.dampak&&<div className="bfc-dampak">Dampak: {b.dampak}</div>}
                    </div>
                  )
                ))}
              </div>
          }
        </div>

        {resolved.length>0&&(
          <div className="card">
            <div className="card-header">
              <CheckCircle2 size={13} style={{ color:'#4ECBA4' }}/><span>Resolved</span>
              <span className="count-badge" style={{ background:'rgba(78,203,164,0.15)', color:'#4ECBA4' }}>{resolved.length}</span>
            </div>
            <div className="blocker-full-list">
              {resolved.map(b=>(
                <div key={b.id} className="blocker-full-card resolved">
                  <div className="bfc-top">
                    <CheckCircle2 size={13} style={{ color:'#4ECBA4' }}/>
                    <span style={{ textDecoration:'line-through', color:'var(--text-muted)', flex:1, fontSize:13 }}>{b.title}</span>
                    <button className="action-btn del" onClick={()=>onDelete(b.id)}><X size={12}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Settings View (auto-save) ────────────────────────────────────────── */
function SettingsView({ settings, onSave }:{ settings:AppSettings; onSave:(s:AppSettings)=>void }) {
  const [form, setForm] = useState(settings);
  const [savedMsg, setSavedMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => { setForm(settings); }, [settings]);

  const handleChange = (field:keyof AppSettings, value:string|number) => {
    const next = { ...form, [field]:value };
    setForm(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSave(next);
      setSavedMsg('Tersimpan otomatis');
      setTimeout(() => setSavedMsg(''), 2000);
    }, 800);
  };

  return (
    <div className="view-wrap">
      <div className="view-header"><div><div className="view-sub">Perubahan tersimpan otomatis</div><h1 className="view-title">Settings</h1></div></div>
      <div className="view-body">
        <div className="card settings-card">
          <div className="card-header">
            <Settings size={13} style={{ color:'var(--accent)' }}/><span>Profil Pengguna</span>
            {savedMsg&&<span className="auto-saved-pill" style={{ marginLeft:'auto' }}>{savedMsg}</span>}
          </div>
          <div className="settings-form">
            <div className="settings-avatar">{initials(form.nama)}</div>
            <label className="sf-label">Nama Lengkap</label>
            <input className="sf-input" value={form.nama} placeholder="Nama lengkap..." onChange={e=>handleChange('nama',e.target.value)}/>
            <label className="sf-label">Jabatan / Posisi</label>
            <input className="sf-input" value={form.jabatan} placeholder="Jabatan..." onChange={e=>handleChange('jabatan',e.target.value)}/>
            <div className="sf-row2">
              <div>
                <label className="sf-label">Target Tugas Harian</label>
                <input className="sf-input" type="number" min="1" max="30" value={form.targetTask} onChange={e=>handleChange('targetTask',Number(e.target.value))}/>
              </div>
              <div>
                <label className="sf-label">Target Jam Kerja</label>
                <input className="sf-input" type="number" min="1" max="24" value={form.targetJam} onChange={e=>handleChange('targetJam',Number(e.target.value))}/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar ──────────────────────────────────────────────────────────── */
function Sidebar({ view, setView, settings, activeBlockers }:{
  view:View; setView:(v:View)=>void; settings:AppSettings; activeBlockers:number;
}) {
  const NAV = [
    { section:'MAIN', items:[
      { key:'dashboard' as View, icon:LayoutDashboard, label:'Dashboard',       badge:'Live'                                          },
      { key:'dailyplan' as View, icon:CalendarCheck,   label:'Daily Plan',      badge:undefined                                       },
      { key:'progress'  as View, icon:TrendingUp,      label:'Progress Update', badge:undefined                                       },
      { key:'timeline'  as View, icon:Clock,           label:'Timeline',        badge:undefined                                       },
    ]},
    { section:'ANALYTICS', items:[
      { key:'projects'  as View, icon:Folder,    label:'Projects',       badge:undefined },
      { key:'weekly'    as View, icon:BarChart2,  label:'Weekly Summary', badge:undefined },
      { key:'reports'   as View, icon:FileText,   label:'Reports',        badge:undefined },
      { key:'calendar'  as View, icon:Calendar,   label:'Calendar',       badge:undefined },
    ]},
    { section:'SYSTEM', items:[
      { key:'blockers'  as View, icon:AlertTriangle, label:'Blockers', badge:activeBlockers>0?String(activeBlockers):undefined },
      { key:'settings'  as View, icon:Settings,      label:'Settings', badge:undefined },
    ]},
  ];

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-logo"><Briefcase size={15} strokeWidth={2}/></div>
        <span className="sb-brand-txt">SCM Journal</span>
      </div>
      <nav className="sb-nav">
        {NAV.map(({ section, items })=>(
          <div key={section} className="sb-section">
            <div className="sb-section-lbl">{section}</div>
            {items.map(({ key, icon:Icon, label, badge })=>(
              <button key={key} className={`sb-item${view===key?' active':''}`} onClick={()=>setView(key)}>
                <Icon size={14} strokeWidth={1.8} className="sb-icon"/>
                <span className="sb-lbl">{label}</span>
                {badge&&<span className="sb-badge">{badge}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sb-user">
        <div className="sb-avatar">{initials(settings.nama)}</div>
        <div className="sb-user-info">
          <div className="sb-user-name">{settings.nama||'Pengguna'}</div>
          <div className="sb-user-role">{settings.jabatan||'—'}</div>
        </div>
        <ChevronDown size={13} className="sb-chevron"/>
      </div>
    </aside>
  );
}

/* ── App (root) ───────────────────────────────────────────────────────── */
export default function App() {
  const [view, setView] = useState<View>('dashboard');

  const [entries, setEntries] = useState<Entry[]>(()=>{
    const loaded = load<Entry[]>('scm_entries',[]);
    const hasToday = loaded.some(e=>e.date===todayStr());
    return hasToday ? loaded : [emptyEntry(), ...loaded];
  });
  const [projects, setProjects] = useState<Project[]>(()=>load<Project[]>('scm_projects',[]));
  const [blockers, setBlockers] = useState<Blocker[]>(()=>load<Blocker[]>('scm_blockers',[]));
  const [settings, setSettings] = useState<AppSettings>(()=>load<AppSettings>('scm_settings',DEFAULT_SETTINGS));

  useEffect(()=>{ persist('scm_entries',  entries);  },[entries]);
  useEffect(()=>{ persist('scm_projects', projects); },[projects]);
  useEffect(()=>{ persist('scm_blockers', blockers); },[blockers]);
  useEffect(()=>{ persist('scm_settings', settings); },[settings]);

  const updateToday = (patch:Partial<Entry>) =>
    setEntries(prev=>prev.map(e=>e.date===todayStr()?{ ...e, ...patch }:e));

  const toggleTodayTask = (taskId:string) => {
    const today = entries.find(e=>e.date===todayStr());
    if (!today) return;
    updateToday({ tasks:today.tasks.map(t=>t.id===taskId?{ ...t, done:!t.done, status:!t.done?'selesai':'belum_mulai' }:t) });
  };

  const activeBlockerCount = blockers.filter(b=>!b.resolved).length;

  return (
    <div className="layout">
      <Sidebar view={view} setView={setView} settings={settings} activeBlockers={activeBlockerCount}/>
      <main className="main">
        {view==='dashboard'&&<Dashboard entries={entries} projects={projects} blockers={blockers} settings={settings} onToggleTask={toggleTodayTask} onUpdateEntry={updateToday} onSetView={setView}/>}
        {view==='dailyplan'&&<DailyPlan entries={entries} onUpdateEntry={updateToday}/>}
        {view==='progress' &&<ProgressUpdate entries={entries} projects={projects} onUpdateEntry={updateToday} onUpdateProject={(id,p)=>setProjects(prev=>prev.map(x=>x.id===id?{ ...x,progress:p }:x))}/>}
        {view==='timeline' &&<TimelineView entries={entries} onUpdateEntry={updateToday}/>}
        {view==='projects' &&<ProjectsView projects={projects} onAdd={p=>setProjects(prev=>[...prev,p])} onDelete={id=>setProjects(prev=>prev.filter(p=>p.id!==id))} onUpdate={p=>setProjects(prev=>prev.map(x=>x.id===p.id?p:x))}/>}
        {view==='weekly'   &&<WeeklySummaryView entries={entries}/>}
        {view==='reports'  &&<ReportsView entries={entries} blockers={blockers}/>}
        {view==='calendar' &&<CalendarView entries={entries}/>}
        {view==='blockers' &&<BlockersView blockers={blockers} onAdd={b=>setBlockers(prev=>[...prev,b])} onResolve={id=>setBlockers(prev=>prev.map(b=>b.id===id?{ ...b,resolved:true }:b))} onDelete={id=>setBlockers(prev=>prev.filter(b=>b.id!==id))} onUpdate={b=>setBlockers(prev=>prev.map(x=>x.id===b.id?b:x))}/>}
        {view==='settings' &&<SettingsView settings={settings} onSave={setSettings}/>}
      </main>
    </div>
  );
}
