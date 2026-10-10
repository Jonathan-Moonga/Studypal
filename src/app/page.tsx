/*
const subjects = [
  { name: "Biology", progress: 72, color: "bg-emerald-400", lessons: "8 of 11 lessons" },
  { name: "Algebra II", progress: 48, color: "bg-violet-400", lessons: "6 of 12 lessons" },
  { name: "World History", progress: 31, color: "bg-amber-400", lessons: "4 of 13 lessons" },
];

const upcoming = [
  { title: "Cellular respiration review", subject: "Biology", time: "Today · 4:00 PM", tone: "bg-emerald-50 text-emerald-700" },
  { title: "Practice quadratic equations", subject: "Algebra II", time: "Tomorrow · 5:30 PM", tone: "bg-violet-50 text-violet-700" },
  { title: "Flashcards: The Renaissance", subject: "World History", time: "Friday · 3:00 PM", tone: "bg-amber-50 text-amber-700" },
];

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-8 text-[#19213d] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#5b5ce2] text-xl text-white shadow-lg shadow-indigo-200">✦</div><div><p className="text-lg font-bold tracking-tight">StudyPal</p><p className="text-xs text-slate-500">Your learning, made lighter.</p></div></div><button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">My profile</button></header>
        <section className="mt-12 grid gap-8 lg:grid-cols-[1.25fr_.75fr] lg:items-end"><div><p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-[#5b5ce2]">Saturday, October 10</p><h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Small steps make big progress, Maya.</h1><p className="mt-4 max-w-lg text-base leading-7 text-slate-500">You’re building a great rhythm. Keep today simple and focus on one thing at a time.</p></div><div className="rounded-3xl bg-[#19213d] p-6 text-white shadow-xl shadow-slate-200"><div className="flex items-start justify-between"><div><p className="text-sm text-indigo-200">This week</p><p className="mt-2 text-4xl font-bold">4.5 hrs</p></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs text-indigo-100">+18%</span></div><div className="mt-6 h-2 rounded-full bg-white/15"><div className="h-2 w-[68%] rounded-full bg-[#a6e3c1]" /></div><p className="mt-3 text-sm text-indigo-100">You’re 2 sessions away from your weekly goal.</p></div></section>
        <section className="mt-12"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">Your subjects</h2><button className="text-sm font-bold text-[#5b5ce2]">View all →</button></div><div className="grid gap-4 md:grid-cols-3">{subjects.map((subject) => <article key={subject.name} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-bold">{subject.name}</h3><span className="text-sm font-bold text-slate-500">{subject.progress}%</span></div><div className="mt-5 h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${subject.color}`} style={{ width: `${subject.progress}%` }} /></div><p className="mt-3 text-sm text-slate-400">{subject.lessons}</p></article>)}</div></section>
        <section className="mt-12 grid gap-8 lg:grid-cols-[1fr_.8fr]"><div><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">Up next</h2><button className="text-sm font-bold text-[#5b5ce2]">See calendar →</button></div><div className="space-y-3">{upcoming.map((item) => <article key={item.title} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-center gap-4"><div className={`grid h-11 w-11 place-items-center rounded-2xl text-lg ${item.tone}`}>✓</div><div><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-sm text-slate-400">{item.subject} · {item.time}</p></div></div><span className="hidden text-slate-300 sm:block">•••</span></article>)}</div></div><div className="rounded-3xl bg-[#e7f7ee] p-7"><p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">A little encouragement</p><h2 className="mt-5 text-3xl font-bold leading-tight">Progress isn’t about perfect days.</h2><p className="mt-4 leading-7 text-emerald-900/70">It’s about returning to what matters, one kind choice at a time.</p><button className="mt-7 rounded-full bg-[#19213d] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200">Start a study session</button></div></section>
      </div>
    </main>
  );
}
*/

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubjectCreator } from "@/components/SubjectCreator";
import { MOTIVATION, STUDY_TIPS, dailyGuidanceIndex } from "@/lib/study-guidance";

function daysUntil(date: string | null) {
  if (!date) return null;
  const difference = new Date(`${date}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil(difference / 86400000));
}

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: subjects }, { data: events }] = await Promise.all([
    supabase.from("profiles").select("display_name, exam_name, exam_date, weekly_goal_minutes, onboarding_complete").eq("id", user.id).single(),
    supabase.from("subjects").select("id, name, color, created_at, exam_date").eq("user_id", user.id).order("created_at", { ascending: true }),
    supabase.from("timetable_events").select("id, title, starts_at, ends_at, event_type, subject_id").eq("user_id", user.id).gte("starts_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(4),
  ]);

  if (!profile?.onboarding_complete) redirect("/onboarding");
  const subjectExamDates = (subjects || []).map((subject) => subject.exam_date).filter((date): date is string => Boolean(date)).sort();
  const earliestExamDate = subjectExamDates[0] || profile.exam_date;
  const examCountdown = daysUntil(earliestExamDate);
  const firstName = profile.display_name?.split(" ")[0] || "there";
  const subjectMap = new Map((subjects || []).map((subject) => [subject.id, subject.name]));
  const motivation = MOTIVATION[dailyGuidanceIndex(MOTIVATION.length)];
  const tips = [STUDY_TIPS[dailyGuidanceIndex(STUDY_TIPS.length, 2)], STUDY_TIPS[dailyGuidanceIndex(STUDY_TIPS.length, 5)]];

  return <main className="min-h-screen bg-[#f7f7f5] px-5 py-8 text-[#111] sm:px-8 lg:px-12"><div className="mx-auto max-w-6xl">
    <header className="flex items-center justify-between"><Link href="/" className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#111] text-xl font-bold text-white">S</span><span><span className="block text-lg font-bold tracking-tight">StudyPal</span><span className="block text-xs text-black/45">Your learning, made lighter.</span></span></Link><div className="flex items-center gap-3"><Link href="/timetable" className="hidden text-sm font-semibold text-black/55 sm:block">Timetable</Link><Link href="/login" className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold">Account</Link></div></header>
    <section className="mt-14 grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d94b45]">Your study space</p><h1 className="mt-4 max-w-xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Ready when you are, {firstName}.</h1><p className="mt-4 max-w-lg text-base leading-7 text-black/55">Start with one small, clear step. StudyPal will keep the bigger picture organized for you.</p></div><div className="rounded-3xl bg-[#111] p-6 text-white shadow-xl shadow-black/10"><div className="flex items-center justify-between gap-4"><p className="text-sm text-white/55">Your next milestone</p><Link href="/exams" className="text-xs font-bold text-[#f2a09a]">View all dates →</Link></div><p className="mt-2 text-2xl font-bold">{profile.exam_name}</p>{examCountdown === null ? <p className="mt-5 text-sm text-white/60">Add subject exam dates to build a countdown.</p> : <div className="mt-5 flex items-end gap-2"><span className="text-5xl font-bold leading-none text-[#f2a09a]">{examCountdown}</span><span className="pb-1 text-sm text-white/60">days to first exam</span></div>}<div className="mt-6 flex flex-wrap gap-2"><Link href="/timetable" className="inline-flex rounded-xl bg-[#f2a09a] px-4 py-3 text-sm font-bold text-[#111]">Plan my study</Link><Link href="/exams" className="inline-flex rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white">Set dates</Link></div></div></section>
    <section className="mt-14"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">Your subjects</p><h2 className="mt-1 text-2xl font-bold">Build your practice space</h2></div><SubjectCreator /></div>{subjects?.length ? <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{subjects.map((subject) => <Link key={subject.id} href={`/subjects/${subject.id}`} className="group rounded-3xl border border-black/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#d94b45]/40 hover:shadow-lg hover:shadow-black/5"><div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#fff0ef] text-[#d94b45]">↗</span><span className="text-black/25 transition group-hover:text-[#d94b45]">→</span></div><h3 className="mt-7 text-xl font-bold">{subject.name}</h3><p className="mt-2 text-sm text-black/50">Open subject workspace</p></Link>)}</div> : <div className="rounded-3xl border border-dashed border-black/15 bg-white/60 p-10 text-center"><p className="text-lg font-bold">Your first subject starts here.</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-black/50">Add a subject, then paste a syllabus, past paper, or textbook chapter so StudyPal can build the practice space.</p><div className="mt-5"><SubjectCreator /></div></div>}</section>
    <section className="mt-14 grid gap-8 lg:grid-cols-[1fr_.8fr]"><div><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">Coming up</p><h2 className="mt-1 text-2xl font-bold">Your timetable</h2></div><Link href="/timetable" className="text-sm font-bold text-[#d94b45]">Open timetable →</Link></div>{events?.length ? <div className="space-y-3">{events.map((event) => <div key={event.id} className="flex items-center justify-between rounded-2xl border border-black/10 bg-white p-4"><div><p className="font-semibold">{event.title}</p><p className="mt-1 text-sm text-black/45">{subjectMap.get(event.subject_id) || "Study block"} · {new Date(event.starts_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div><span className="rounded-full bg-[#fff0ef] px-3 py-1 text-xs font-bold text-[#a8322d]">{event.event_type}</span></div>)}</div> : <div className="rounded-3xl border border-black/10 bg-white p-7"><p className="font-bold">Nothing planned yet.</p><p className="mt-2 text-sm leading-6 text-black/50">Give yourself a gentle starting point with a short study block.</p><Link href="/timetable" className="mt-5 inline-flex rounded-xl bg-[#111] px-4 py-3 text-sm font-bold text-white">Add a study block</Link></div>}</div><div className="rounded-3xl bg-[#f2a09a] p-7"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7a2824]">{motivation.label}</p><h2 className="mt-4 text-3xl font-bold leading-tight">“{motivation.text}”</h2><Link href="/timetable" className="mt-7 inline-flex rounded-xl bg-[#111] px-4 py-3 text-sm font-bold text-white">Turn it into a plan</Link></div></section>
    <section className="mt-14 pb-8"><div className="mb-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">Study smarter</p><h2 className="mt-1 text-2xl font-bold">Two useful ideas for today</h2></div><div className="grid gap-4 md:grid-cols-2">{tips.map((tip) => <article key={tip.title} className="rounded-3xl border border-black/10 bg-white p-6"><span className="rounded-full bg-[#fff0ef] px-3 py-1 text-xs font-bold text-[#a8322d]">{tip.tag}</span><h3 className="mt-5 text-xl font-bold">{tip.title}</h3><p className="mt-2 text-sm leading-6 text-black/50">{tip.detail}</p></article>)}</div></section>
  </div></main>;
}
