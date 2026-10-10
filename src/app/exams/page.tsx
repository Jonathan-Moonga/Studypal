import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubjectExamDate } from "@/components/SubjectExamDate";

function countdown(date?: string | null) {
  if (!date) return null;
  return Math.max(0, Math.ceil((new Date(`${date}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000));
}

export default async function ExamsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: profile }, { data: subjects }] = await Promise.all([
    supabase.from("profiles").select("exam_name, exam_date").eq("id", user.id).single(),
    supabase.from("subjects").select("id, name, exam_date, exam_time, exam_paper").eq("user_id", user.id).order("exam_date", { ascending: true, nullsFirst: false }).order("name"),
  ]);
  const dated = (subjects || []).filter((subject) => subject.exam_date);
  const earliest = dated[0]?.exam_date || profile?.exam_date || null;
  return <main className="min-h-screen bg-[#f7f7f5] px-5 py-8 text-[#111] sm:px-8 lg:px-12"><div className="mx-auto max-w-5xl"><Link href="/" className="text-sm font-bold text-[#d94b45]">← Dashboard</Link><header className="mt-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d94b45]">Exam calendar</p><h1 className="mt-3 text-4xl font-bold tracking-tight">Every paper, on the right day.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-black/50">Set each subject separately. StudyPal uses the earliest date to shape your countdown and timetable templates.</p></div><div className="rounded-3xl bg-[#111] p-5 text-white"><p className="text-xs text-white/45">First exam</p><p className="mt-2 text-3xl font-bold text-[#f2a09a]">{earliest ? `${countdown(earliest)} days` : "Not set"}</p><p className="mt-1 text-xs text-white/45">{profile?.exam_name || "Your exam series"}</p></div></header><section className="mt-10 space-y-3">{(subjects || []).map((subject) => <article key={subject.id} className="rounded-2xl border border-black/10 bg-white p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><Link href={`/subjects/${subject.id}`} className="text-lg font-bold hover:text-[#d94b45]">{subject.name}</Link><p className="mt-1 text-sm text-black/45">{subject.exam_date ? `${new Date(`${subject.exam_date}T00:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${subject.exam_time ? ` at ${subject.exam_time.slice(0, 5)}` : ""}` : "No subject date yet"}{subject.exam_paper ? ` · ${subject.exam_paper}` : ""}</p></div>{subject.exam_date && <span className="rounded-full bg-[#fff0ef] px-3 py-1.5 text-xs font-bold text-[#a8322d]">{countdown(subject.exam_date)} days left</span>}</div><SubjectExamDate subjectId={subject.id} initialDate={subject.exam_date} initialTime={subject.exam_time} initialPaper={subject.exam_paper} compact /></article>)}{!subjects?.length && <div className="rounded-3xl border border-dashed border-black/15 p-10 text-center text-sm text-black/50">Add a subject from the dashboard first.</div>}</section><Link href="/timetable" className="mt-8 inline-flex rounded-xl bg-[#111] px-5 py-3 text-sm font-bold text-white">Build a plan around these dates →</Link></div></main>;
}
