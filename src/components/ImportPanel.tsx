"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ImportPanel({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState("syllabus");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    const response = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, sourceType, title, text }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "We could not import that material.");
    else { setMessage(`Added ${result.sections} sections and ${result.questions} questions.`); setText(""); setTitle(""); router.refresh(); }
    setSaving(false);
  }

  return <div className="rounded-3xl border border-black/10 bg-white p-6 sm:p-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d94b45]">Teach StudyPal</p><h2 className="mt-2 text-2xl font-bold">Bring your material</h2><p className="mt-2 max-w-xl text-sm leading-6 text-black/50">Paste a syllabus, past paper, or textbook passage. Gemini will turn it into sections, topics, and tagged questions.</p></div><span className="rounded-full bg-[#fff0ef] px-3 py-1 text-xs font-bold text-[#a8322d]">AI-assisted</span></div><form onSubmit={handleSubmit} className="mt-6 space-y-4"><div className="grid gap-4 sm:grid-cols-[.7fr_1fr]"><label><span className="mb-2 block text-sm font-semibold">Material type</span><select value={sourceType} onChange={(event) => setSourceType(event.target.value)} className="auth-input"><option value="syllabus">Syllabus</option><option value="past_paper">Past paper</option><option value="textbook">Textbook / notes</option></select></label><label><span className="mb-2 block text-sm font-semibold">Title <span className="font-normal text-black/35">(optional)</span></span><input value={title} onChange={(event) => setTitle(event.target.value)} className="auth-input" placeholder="e.g. Biology Paper 2 · 2025" /></label></div><label className="block"><span className="mb-2 block text-sm font-semibold">Paste the material</span><textarea required minLength={30} value={text} onChange={(event) => setText(event.target.value)} rows={8} className="auth-input resize-y" placeholder={sourceType === "past_paper" ? "Paste the full paper text here…" : "Paste your syllabus, chapter, or notes here…"} /></label>{error && <p role="alert" className="rounded-xl bg-[#fff0ef] px-3 py-2.5 text-sm leading-5 text-[#a8322d]">{error}</p>}{message && <p role="status" className="rounded-xl bg-[#f0f8f1] px-3 py-2.5 text-sm leading-5 text-[#26703c]">{message}</p>}<div className="flex items-center justify-between gap-4"><p className="text-xs leading-5 text-black/40">Large papers work best when split by section.</p><button disabled={saving} className="rounded-xl bg-[#111] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Understanding material…" : "Import material"}</button></div></form></div>;
}
