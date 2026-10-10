import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TimetableForm } from "@/components/TimetableForm";

export default async function TimetablePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: events }, { data: subjects }, { data: profile }] = await Promise.all([
    supabase.from("timetable_events").select("id, title, starts_at, ends_at, event_type, subject_id").eq("user_id", user.id).order("starts_at", { ascending: true }).limit(30),
    supabase.from("subjects").select("id, name").eq("user_id", user.id).order("name"),
    supabase.from("profiles").select("exam_name, exam_date").eq("id", user.id).single(),
  ]);
  const subjectMap = new Map((subjects || []).map((subject) => [subject.id, subject.name]));
  return <main className="min-h-screen bg-[#f7f7f5] px-5 py-8 text-[#111] sm:px-8 lg:px-12"><div className="mx-auto max-w-6xl"><Link href="/" className="text-sm font-bold text-[#d94b45]">← Dashboard</Link><header className="mt-10"><p className="text-xs font-bold uppercase tracking-[0.18em] text-black/40">Study planning</p><h1 className="mt-3 text-4xl font-bold tracking-tight">A timetable you can actually keep.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-black/50">Plan focused blocks around your exam date without turning your week into a spreadsheet.</p></header><div className="mt-10 grid gap-8 lg:grid-cols-[.7fr_1.3fr]"><TimetableForm subjects={subjects || []} /><section className="rounded-3xl border border-black/10 bg-white p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">Your plan</p><h2 className="mt-2 text-2xl font-bold">{profile?.exam_name || "Upcoming study"}</h2></div><span className="rounded-full bg-[#fff0ef] px-3 py-1 text-xs font-bold text-[#a8322d]">{profile?.exam_date ? `Exam · ${profile.exam_date}` : "No exam date"}</span></div>{events?.length ? <div className="mt-6 space-y-3">{events.map((event) => <div key={event.id} className="flex gap-4 rounded-2xl bg-[#f7f7f5] p-4"><div className="w-20 shrink-0 text-xs font-bold text-[#d94b45]">{new Date(event.starts_at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}<span className="mt-1 block text-black/45">{new Date(event.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div><div><p className="font-semibold">{event.title}</p><p className="mt-1 text-sm text-black/45">{subjectMap.get(event.subject_id) || "General study"} · {Math.round((new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60000)} min</p></div></div>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-black/15 p-8 text-center text-sm leading-6 text-black/50">Your planned blocks will appear here. Start with 25–45 minutes.</div>}</section></div></div></main>;
}
