"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Section = { id: string; title: string };
type Source = { id: string; title: string; source_type: string; status: string; metadata?: Record<string, unknown> | null };

const VERSIONS = ["A", "B", "C", "D"];

export function BiologyAssessmentSelector({ subjectId, sections, sources }: { subjectId: string; sections: Section[]; sources: Source[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"quiz" | "unit_test" | "paper">("quiz");
  const [version, setVersion] = useState("A");
  const [sectionId, setSectionId] = useState(sections[0]?.id || "");
  const [sourceId, setSourceId] = useState(sources.find((source) => source.source_type === "past_paper")?.id || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const papers = sources.filter((source) => source.source_type === "past_paper" && source.status === "ready");

  async function openAssessment() {
    setLoading(true);
    setError("");
    const isPaper = mode === "paper";
    if (!isPaper && !sectionId) { setError("Choose a Biology unit first."); setLoading(false); return; }
    if (isPaper && !sourceId) { setError("Upload and approve a past paper first."); setLoading(false); return; }
    const response = await fetch("/api/quizzes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, quizType: isPaper ? "full_paper" : mode === "quiz" ? "topic" : "section", assessmentType: isPaper ? "paper" : mode, variant: isPaper ? null : version, sectionId: isPaper ? null : sectionId, sourceId: isPaper ? sourceId : null }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error || "We could not open this assessment.");
    else router.push(`/quiz/${result.quiz.id}`);
    setLoading(false);
  }

  return <section id="biology-assessments" className="rounded-3xl border border-[#cfe4f4] bg-[#f2f8fd] p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1f5f95]">Assessment desk</p><h2 className="mt-2 text-2xl font-bold text-[#14324b]">Choose the version before you start</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#315b79]">Short quizzes rotate through the question bank. Unit tests are timed and more comprehensive. Imported source papers remain available as their original paper.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#1f5f95]">A-D versions</span></div>
    <div className="mt-5 grid gap-3 md:grid-cols-3"><button type="button" onClick={() => setMode("quiz")} className={`rounded-2xl p-4 text-left ${mode === "quiz" ? "bg-[#1f73b7] text-white" : "bg-white text-[#14324b]"}`}><p className="text-xs font-bold uppercase tracking-[0.14em] opacity-65">Quick check</p><p className="mt-2 font-bold">Unit quiz</p><p className="mt-1 text-xs leading-5 opacity-70">Short practice with weakness-aware selection.</p></button><button type="button" onClick={() => setMode("unit_test")} className={`rounded-2xl p-4 text-left ${mode === "unit_test" ? "bg-[#1f73b7] text-white" : "bg-white text-[#14324b]"}`}><p className="text-xs font-bold uppercase tracking-[0.14em] opacity-65">Timed mastery</p><p className="mt-2 font-bold">Unit test</p><p className="mt-1 text-xs leading-5 opacity-70">A longer timed version for full-unit coverage.</p></button><button type="button" onClick={() => setMode("paper")} className={`rounded-2xl p-4 text-left ${mode === "paper" ? "bg-[#1f73b7] text-white" : "bg-white text-[#14324b]"}`}><p className="text-xs font-bold uppercase tracking-[0.14em] opacity-65">Original source</p><p className="mt-2 font-bold">Past paper</p><p className="mt-1 text-xs leading-5 opacity-70">Keep the original order and printed timing.</p></button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-black/45">{mode === "paper" ? "Paper" : "Unit"}</span>{mode === "paper" ? <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="auth-input"><option value="">Choose a paper</option>{papers.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select> : <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} className="auth-input"><option value="">Choose a unit</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select>}</label>{mode !== "paper" ? <div><span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-black/45">Version</span><div className="grid grid-cols-4 gap-2">{VERSIONS.map((item) => <button key={item} type="button" onClick={() => setVersion(item)} className={`rounded-xl border px-3 py-3 text-sm font-bold ${version === item ? "border-[#1f73b7] bg-[#1f73b7] text-white" : "border-black/10 bg-white text-[#14324b]"}`}>Quiz {item}</button>)}</div></div> : <div className="flex items-end"><p className="rounded-xl bg-white px-4 py-3 text-xs leading-5 text-black/50">Past papers use the time printed on the original source when available.</p></div>}</div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-5 text-black/45">Missed questions are tagged back to the Biology section they came from.</p><button type="button" onClick={openAssessment} disabled={loading} className="rounded-xl bg-[#111] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{loading ? "Opening..." : `Open ${mode === "paper" ? "paper" : `${mode === "unit_test" ? "unit test" : "quiz"} ${version}`}`}</button></div>{error && <p role="alert" className="mt-4 rounded-xl bg-[#fff0ef] px-3 py-2.5 text-sm text-[#a8322d]">{error}</p>}
  </section>;
}
