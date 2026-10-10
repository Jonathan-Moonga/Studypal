import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportPanelV2 } from "@/components/ImportPanelV2";
import { QuizCreator } from "@/components/QuizCreator";

export default async function SubjectPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: subject }, { data: sections }, { data: sources }, { count: questionCount }] = await Promise.all([
    supabase.from("subjects").select("id, name, color").eq("id", subjectId).eq("user_id", user.id).single(),
    supabase.from("curriculum_sections").select("id, title, description, topics, position").eq("subject_id", subjectId).eq("user_id", user.id).order("position"),
    supabase.from("content_sources").select("id, title, source_type, status, metadata, created_at").eq("subject_id", subjectId).eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", subjectId).eq("user_id", user.id),
  ]);
  if (!subject) notFound();
  const readySources = (sources || []).filter((source) => source.status === "ready");
  return <main className="min-h-screen bg-[#f7f7f5] px-5 py-8 text-[#111] sm:px-8 lg:px-12"><div className="mx-auto max-w-6xl"><Link href="/" className="text-sm font-bold text-[#d94b45]">← Dashboard</Link><header className="mt-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-black/40">Subject workspace</p><h1 className="mt-3 text-4xl font-bold tracking-tight">{subject.name}</h1><p className="mt-3 text-sm text-black/50">{sections?.length || 0} sections · {questionCount || 0} questions ready</p></div><div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm"><p className="text-xs text-black/40">Imported sources</p><p className="mt-1 text-2xl font-bold">{readySources.length}</p></div></header><div className="mt-10 space-y-6"><ImportPanelV2 subjectId={subjectId} /><QuizCreator subjectId={subjectId} sections={sections || []} sources={readySources || []} /><section className="grid gap-6 lg:grid-cols-[1fr_.7fr]"><div className="rounded-3xl border border-black/10 bg-white p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">Curriculum map</p><h2 className="mt-2 text-2xl font-bold">Sections</h2>{sections?.length ? <div className="mt-5 divide-y divide-black/10">{sections.map((section) => <div key={section.id} className="flex items-center justify-between py-4"><div><p className="font-semibold">{section.position + 1}. {section.title}</p><p className="mt-1 text-sm text-black/45">{section.description || `${section.topics?.length || 0} tagged topics`}</p></div><span className="text-black/25">→</span></div>)}</div> : <div className="mt-5 rounded-2xl bg-[#f5f5f3] p-5 text-sm leading-6 text-black/50">Your sections will appear here after you import a syllabus or textbook.</div>}</div><div className="rounded-3xl bg-[#111] p-6 text-white"><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">How StudyPal uses this</p><h2 className="mt-4 text-2xl font-bold">Your practice gets smarter over time.</h2><p className="mt-3 text-sm leading-6 text-white/55">Every answer is tagged by topic, difficulty, year, and source order. That lets topic refreshers revisit weak spots while papers stay faithful to the original assessment.</p></div></section></div></div></main>;
}
