"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Choice = { key: string; text: string };
type Question = { section_title: string; question_type: string; prompt: string; choices: Choice[]; answer: string; explanation: string; points: number; year: number | null; topic: string; difficulty: string; sequence_order: number; needs_review: boolean; confidence: number };
type Draft = { title: string; sections: { title: string; description: string; topics: string[] }[]; questions: Question[] };
type Job = { id: string; fileName?: string; status: string; completed_chunks: number; total_chunks: number; draft?: Draft; error?: string };

export function ImportPanelV2({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState("syllabus");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function updateJob(id: string, next: Partial<Job>) { setJobs((old) => old.map((job) => job.id === id ? { ...job, ...next } : job)); }
  async function watchJob(id: string, fileName?: string) {
    let state: Job = { id, fileName, status: "queued", completed_chunks: 0, total_chunks: 1 };
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const process = await fetch(`/api/import/jobs/${id}/process`, { method: "POST" });
      if (!process.ok) { const result = await process.json().catch(() => ({})); throw new Error(result.error || "The AI processor could not continue."); }
      const response = await fetch(`/api/import/jobs/${id}`);
      const result = await response.json();
      state = { id, fileName, ...result.job };
      updateJob(id, state);
      if (state.status === "review") { setActiveJobId(id); setDraft(state.draft || null); return; }
      if (state.status === "failed") throw new Error(state.error || "This import failed.");
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
    throw new Error("This import is taking longer than expected. You can retry from the subject page.");
  }

  async function startJobs(nextJobs: { jobId: string; fileName?: string; totalChunks?: number }[]) {
    setJobs(nextJobs.map((job) => ({ id: job.jobId, fileName: job.fileName, status: "queued", completed_chunks: 0, total_chunks: job.totalChunks || 1 })));
    setMessage("Material queued. StudyPal is processing it in small chunks…");
    for (const job of nextJobs) {
      try { await watchJob(job.jobId, job.fileName); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "We could not process this material."); updateJob(job.jobId, { status: "failed" }); }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setMessage(""); setDraft(null);
    try {
      if (files.length) {
        const form = new FormData(); form.append("subjectId", subjectId); form.append("sourceType", sourceType); for (const file of files) form.append("files", file);
        const response = await fetch("/api/import/upload", { method: "POST", body: form }); const result = await response.json();
        if (!response.ok) throw new Error(result.error || "We could not upload those files.");
        await startJobs(result.jobs); setFiles([]);
      } else {
        const response = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, sourceType, title, text }) }); const result = await response.json();
        if (!response.ok) throw new Error(result.error || "We could not start this import.");
        await startJobs([{ jobId: result.jobId, totalChunks: result.totalChunks }]); setText(""); setTitle("");
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not start this import."); }
    finally { setSaving(false); }
  }

  function updateQuestion(index: number, key: keyof Question, value: string | number | boolean) { if (!draft) return; setDraft({ ...draft, questions: draft.questions.map((question, questionIndex) => questionIndex === index ? { ...question, [key]: value } : question) }); }
  async function approve() {
    if (!draft || !activeJobId) return; setSaving(true); setError("");
    const response = await fetch(`/api/import/jobs/${activeJobId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "We could not save the reviewed material.");
    else { setMessage(`Saved ${result.saved} new questions and linked ${result.repeated} repeated appearance${result.repeated === 1 ? "" : "s"}.`); setDraft(null); setActiveJobId(""); router.refresh(); }
    setSaving(false);
  }

  return <div className="rounded-3xl border border-black/10 bg-white p-6 sm:p-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d94b45]">Teach StudyPal</p><h2 className="mt-2 text-2xl font-bold">Bring your material</h2><p className="mt-2 max-w-xl text-sm leading-6 text-black/50">Upload a PDF, image, Word document, or paste text. AI drafts a reviewable import; nothing enters your question bank until you approve it.</p></div><span className="rounded-full bg-[#fff0ef] px-3 py-1 text-xs font-bold text-[#a8322d]">Evidence-first AI</span></div>
    <form onSubmit={handleSubmit} className="mt-6 space-y-4"><div className="grid gap-4 sm:grid-cols-[.7fr_1fr]"><label><span className="mb-2 block text-sm font-semibold">Material type</span><select value={sourceType} onChange={(event) => setSourceType(event.target.value)} className="auth-input"><option value="syllabus">Syllabus</option><option value="past_paper">Past paper</option><option value="textbook">Textbook / notes</option></select></label><label><span className="mb-2 block text-sm font-semibold">Title <span className="font-normal text-black/35">(optional for pasted text)</span></span><input value={title} onChange={(event) => setTitle(event.target.value)} className="auth-input" placeholder="e.g. Biology Paper 2 · 2025" /></label></div>
      <label className="block"><span className="mb-2 block text-sm font-semibold">Files <span className="font-normal text-black/35">(PDF, PNG, JPG, WEBP, DOCX, TXT · 25 MB each)</span></span><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.md" onChange={(event) => setFiles(Array.from(event.target.files || []))} className="block w-full rounded-xl border border-dashed border-black/20 bg-[#fafaf8] px-4 py-4 text-sm" />{files.length > 0 && <p className="mt-2 text-xs text-black/45">{files.length} file{files.length === 1 ? "" : "s"} ready: {files.map((file) => file.name).join(", ")}</p>}</label>
      <label className="block"><span className="mb-2 block text-sm font-semibold">Or paste the material</span><textarea minLength={files.length ? undefined : 30} required={!files.length} value={text} onChange={(event) => setText(event.target.value)} rows={7} className="auth-input resize-y" placeholder={sourceType === "past_paper" ? "Paste the full paper text here…" : "Paste your syllabus, chapter, or notes here…"} /></label>
      {error && <p role="alert" className="rounded-xl bg-[#fff0ef] px-3 py-2.5 text-sm leading-5 text-[#a8322d]">{error}</p>}{message && <p role="status" className="rounded-xl bg-[#f0f8f1] px-3 py-2.5 text-sm leading-5 text-[#26703c]">{message}</p>}
      {jobs.length > 0 && <div className="space-y-2 rounded-2xl bg-[#f7f7f5] p-4">{jobs.map((job) => <div key={job.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-semibold">{job.fileName || "Pasted material"}</span><span className="text-black/45">{job.status === "review" ? "Ready for review" : job.status === "failed" ? "Needs retry" : `${job.completed_chunks}/${job.total_chunks} chunks`}</span></div>)}</div>}
      <div className="flex items-center justify-between gap-4"><p className="text-xs leading-5 text-black/40">Long papers are processed in chunks so you can review before saving.</p><button disabled={saving} className="rounded-xl bg-[#111] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Processing…" : "Prepare import"}</button></div>
    </form>
    {draft && <section className="mt-8 border-t border-black/10 pt-7"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d94b45]">Review before saving</p><h3 className="mt-2 text-2xl font-bold">{draft.title}</h3></div><button onClick={approve} disabled={saving} className="rounded-xl bg-[#d94b45] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Approve import"}</button></div><p className="mt-2 text-sm text-black/50">Check wording, answers, and flagged items. Repeated questions are linked to their previous appearances.</p><div className="mt-5 space-y-3">{draft.questions.map((question, index) => <div key={`${index}-${question.prompt}`} className="rounded-2xl border border-black/10 p-4"><div className="flex items-start justify-between gap-3"><span className="text-xs font-bold uppercase tracking-[0.12em] text-black/40">{question.question_type.replace("_", " ")} · {question.confidence >= 0.8 ? "high confidence" : "check carefully"}</span>{question.needs_review && <span className="rounded-full bg-[#fff0ef] px-2 py-1 text-[11px] font-bold text-[#a8322d]">Needs review</span>}</div><textarea value={question.prompt} onChange={(event) => updateQuestion(index, "prompt", event.target.value)} className="auth-input mt-3 min-h-20 resize-y" /><div className="mt-3 grid gap-3 sm:grid-cols-3"><input value={question.topic} onChange={(event) => updateQuestion(index, "topic", event.target.value)} className="auth-input" placeholder="Topic" /><input type="number" min={1} value={question.points} onChange={(event) => updateQuestion(index, "points", Number(event.target.value))} className="auth-input" placeholder="Points" /><input type="number" value={question.year || ""} onChange={(event) => updateQuestion(index, "year", Number(event.target.value) || 0)} className="auth-input" placeholder="Year" /></div></div>)}</div>{!draft.questions.length && <p className="mt-5 rounded-2xl bg-[#fffaf0] p-4 text-sm text-[#7a5b1b]">No questions were found. You can still approve the curriculum sections.</p>}</section>}
  </div>;
}
