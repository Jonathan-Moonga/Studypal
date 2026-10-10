"use client";

import { DragEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Subject = { id: string; name: string; exam_date?: string | null };
type StudyEvent = { id: string; title: string; starts_at: string; ends_at: string; event_type: string; subject_id: string | null };

const SLOTS = [9, 13, 17, 19];
const TEMPLATES = [
  { key: "sprint_10", label: "10-day sprint", note: "Two short blocks most days" },
  { key: "sprint_15", label: "15-day sprint", note: "Frequent exam-focused practice" },
  { key: "focused_20", label: "20-day focus", note: "Six study days each week" },
  { key: "balanced_30", label: "30-day balance", note: "Five steady days each week" },
  { key: "steady_90", label: "3-month runway", note: "Four sustainable days each week" },
];

function mondayOf(value: Date) {
  const date = new Date(value); date.setHours(0, 0, 0, 0);
  const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); return date;
}
function dayKey(value: Date | string) { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function addDays(value: Date, days: number) { const date = new Date(value); date.setDate(date.getDate() + days); return date; }

export function StudyCalendar({ initialEvents, subjects, earliestExamDate }: { initialEvents: StudyEvent[]; subjects: Subject[]; earliestExamDate?: string | null }) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(week, index)), [week]);
  const daysToExam = earliestExamDate ? Math.max(0, Math.ceil((new Date(`${earliestExamDate}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)) : null;
  const recommended = daysToExam === null ? "balanced_30" : daysToExam <= 10 ? "sprint_10" : daysToExam <= 15 ? "sprint_15" : daysToExam <= 20 ? "focused_20" : daysToExam <= 45 ? "balanced_30" : "steady_90";

  function startDrag(event: DragEvent, payload: object) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/json", JSON.stringify(payload)); }

  async function drop(event: DragEvent<HTMLDivElement>, date: Date, hour: number) {
    event.preventDefault(); setError("");
    let payload: { kind?: string; id?: string; subjectId?: string; title?: string; startsAt?: string; endsAt?: string };
    try { payload = JSON.parse(event.dataTransfer.getData("application/json")); } catch { return; }
    const startsAt = new Date(date); startsAt.setHours(hour, 0, 0, 0);
    if (payload.kind === "event" && payload.id && payload.startsAt && payload.endsAt) {
      const duration = new Date(payload.endsAt).getTime() - new Date(payload.startsAt).getTime();
      const endsAt = new Date(startsAt.getTime() + duration);
      setEvents((current) => current.map((item) => item.id === payload.id ? { ...item, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() } : item));
      const response = await fetch(`/api/timetable/${payload.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startsAt, endsAt }) });
      if (!response.ok) { const result = await response.json().catch(() => ({})); setError(result.error || "Could not move that block."); router.refresh(); }
    } else if (payload.kind === "subject" && payload.subjectId) {
      const endsAt = new Date(startsAt.getTime() + 45 * 60000);
      const response = await fetch("/api/timetable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `${payload.title || "Subject"} focused practice`, subjectId: payload.subjectId, startsAt, endsAt }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) setError(result.error || "Could not add that study block."); else { setEvents((current) => [...current, result.event]); router.refresh(); }
    }
  }

  async function applyTemplate(key: string) {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/timetable/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateKey: key }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error || "Could not create this plan.");
    else { setEvents((current) => [...current, ...(result.events || [])]); setMessage(`Added ${result.created} editable study blocks through ${result.through}.`); router.refresh(); }
    setBusy(false);
  }

  async function remove(id: string) {
    setEvents((current) => current.filter((event) => event.id !== id));
    const response = await fetch(`/api/timetable/${id}`, { method: "DELETE" });
    if (!response.ok) { setError("Could not remove that block."); router.refresh(); }
  }

  return <div className="space-y-6">
    <section className="rounded-3xl border border-black/10 bg-white p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d94b45]">Smart templates</p><h2 className="mt-2 text-2xl font-bold">Start with a plan that fits the runway</h2><p className="mt-2 text-sm text-black/50">Apply a template, then drag any individual block without changing the other weeks.</p></div>{daysToExam !== null && <span className="rounded-full bg-[#fff0ef] px-3 py-1.5 text-xs font-bold text-[#a8322d]">{daysToExam} days to first exam</span>}</div><div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{TEMPLATES.map((template) => <button key={template.key} type="button" disabled={busy} onClick={() => applyTemplate(template.key)} className={`rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 disabled:opacity-40 ${template.key === recommended ? "border-[#d94b45] bg-[#fff0ef]" : "border-black/10 bg-[#fafaf8]"}`}><span className="text-sm font-bold">{template.label}</span><span className="mt-1 block text-xs leading-4 text-black/45">{template.note}</span>{template.key === recommended && <span className="mt-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#a8322d]">Recommended</span>}</button>)}</div></section>

    <section className="rounded-3xl border border-black/10 bg-white p-4 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">Drag-and-drop calendar</p><h2 className="mt-1 text-2xl font-bold">{week.toLocaleDateString([], { month: "long", day: "numeric" })} – {addDays(week, 6).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}</h2></div><div className="flex gap-2"><button type="button" onClick={() => setWeek(addDays(week, -7))} className="rounded-xl border border-black/10 px-3 py-2 text-sm font-bold">← Previous</button><button type="button" onClick={() => setWeek(mondayOf(new Date()))} className="rounded-xl border border-black/10 px-3 py-2 text-sm font-bold">Today</button><button type="button" onClick={() => setWeek(addDays(week, 7))} className="rounded-xl border border-black/10 px-3 py-2 text-sm font-bold">Next →</button></div></div>
      <div className="mt-5 flex flex-wrap gap-2 rounded-2xl bg-[#f7f7f5] p-3"><span className="mr-2 self-center text-xs font-bold text-black/40">Drag a subject:</span>{subjects.map((subject) => <button key={subject.id} type="button" draggable onDragStart={(event) => startDrag(event, { kind: "subject", subjectId: subject.id, title: subject.name })} className="cursor-grab rounded-full bg-white px-3 py-2 text-xs font-bold shadow-sm active:cursor-grabbing">{subject.name}</button>)}</div>
      <div className="mt-5 overflow-x-auto pb-2"><div className="grid min-w-[980px] grid-cols-7 gap-2">{days.map((date) => { const dateEvents = events.filter((event) => dayKey(event.starts_at) === dayKey(date)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)); return <div key={date.toISOString()} className={`rounded-2xl border p-2 ${dayKey(date) === dayKey(new Date()) ? "border-[#d94b45]/40 bg-[#fffafa]" : "border-black/10 bg-[#fcfcfa]"}`}><div className="px-1 py-2"><p className="text-xs font-bold uppercase text-black/40">{date.toLocaleDateString([], { weekday: "short" })}</p><p className="mt-1 text-lg font-bold">{date.getDate()}</p></div><div className="space-y-2">{SLOTS.map((hour) => { const slotEvents = dateEvents.filter((item) => new Date(item.starts_at).getHours() === hour); return <div key={hour} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => drop(event, date, hour)} className="min-h-20 rounded-xl border border-dashed border-black/10 bg-white/70 p-1.5"><p className="mb-1 text-[10px] font-bold text-black/30">{new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" })}</p>{slotEvents.map((item) => <div key={item.id} draggable onDragStart={(event) => startDrag(event, { kind: "event", id: item.id, startsAt: item.starts_at, endsAt: item.ends_at })} className="group cursor-grab rounded-lg bg-[#111] p-2 text-white shadow-sm active:cursor-grabbing"><p className="text-[11px] font-bold leading-4">{item.title}</p><div className="mt-1 flex items-center justify-between"><span className="text-[9px] text-white/50">{new Date(item.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><button type="button" onClick={() => remove(item.id)} className="text-[10px] text-white/45 opacity-0 group-hover:opacity-100">×</button></div></div>)}</div>})}</div></div>; })}</div></div>
      <p className="mt-3 text-xs leading-5 text-black/40">Drop a subject into a time slot to create a 45-minute block. Drag an existing block to another day or time. Template weeks repeat until the final exam, but every block remains independently editable.</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff0ef] px-3 py-2.5 text-sm text-[#a8322d]">{error}</p>}{message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{message}</p>}
    </section>
  </div>;
}
