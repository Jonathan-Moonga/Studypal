"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Section = { id: string; title: string };
type Source = { id: string; title: string; source_type: string; status: string };

export function QuizCreator({ subjectId, sections, sources }: { subjectId: string; sections: Section[]; sources: Source[] }) {
  const router = useRouter();
  const [sectionId, setSectionId] = useState(sections[0]?.id || "");
  const [sourceId, setSourceId] = useState(sources.find((source) => source.source_type === "past_paper")?.id || "");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  async function startQuiz(quizType: "topic" | "section" | "full_paper") {
    setLoading(quizType); setError("");
    if (quizType === "section" && !sectionId) { setError("Import a syllabus first so StudyPal can find a section."); setLoading(""); return; }
    if (quizType === "full_paper" && !sourceId) { setError("Import a past paper first to start a full paper practice."); setLoading(""); return; }
    const response = await fetch("/api/quizzes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, quizType, sectionId: quizType === "section" || quizType === "topic" ? sectionId : null, sourceId: quizType === "full_paper" ? sourceId : null }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "We could not start that quiz.");
    else router.push(`/quiz/${result.quiz.id}`);
    setLoading("");
  }

  return <div className="rounded-3xl border border-black/10 bg-white p-6 sm:p-7"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d94b45]">Practice modes</p><h2 className="mt-2 text-2xl font-bold">Choose the right kind of practice</h2><p className="mt-2 text-sm leading-6 text-black/50">Start small when you are learning. Use timed practice when you are ready to perform.</p></div><div className="mt-6 grid gap-3 md:grid-cols-3"><article className="rounded-2xl bg-[#fff7f6] p-4"><span className="text-xs font-bold text-[#a8322d]">01</span><h3 className="mt-5 font-bold">Topic refresher</h3><p className="mt-2 min-h-14 text-sm leading-5 text-black/50">Short multiple-choice and fill-in-the-blank practice, balanced toward weaker topics.</p><select value={sectionId} onChange={(event) => setSectionId(event.target.value)} className="auth-input mt-4 text-xs"><option value="">All sections</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select><button onClick={() => startQuiz("topic")} disabled={loading !== ""} className="mt-3 w-full rounded-xl bg-[#d94b45] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50">{loading === "topic" ? "Starting…" : "Start refresher"}</button></article><article className="rounded-2xl bg-[#f5f5f3] p-4"><span className="text-xs font-bold text-black/45">02</span><h3 className="mt-5 font-bold">Section practice</h3><p className="mt-2 min-h-14 text-sm leading-5 text-black/50">A timed, complete pass through one section in curriculum order.</p><div className="mt-4 h-[42px]" /><button onClick={() => startQuiz("section")} disabled={loading !== ""} className="mt-3 w-full rounded-xl bg-[#111] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50">{loading === "section" ? "Starting…" : "Start section"}</button></article><article className="rounded-2xl bg-[#f5f5f3] p-4"><span className="text-xs font-bold text-black/45">03</span><h3 className="mt-5 font-bold">Full paper</h3><p className="mt-2 min-h-14 text-sm leading-5 text-black/50">A timed mock using the original question order from a past paper.</p><select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="auth-input mt-4 text-xs"><option value="">Choose a paper</option>{sources.filter((source) => source.source_type === "past_paper").map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select><button onClick={() => startQuiz("full_paper")} disabled={loading !== ""} className="mt-3 w-full rounded-xl bg-[#111] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50">{loading === "full_paper" ? "Starting…" : "Start full paper"}</button></article></div>{error && <p role="alert" className="mt-4 rounded-xl bg-[#fff0ef] px-3 py-2.5 text-sm text-[#a8322d]">{error}</p>}</div>;
}
