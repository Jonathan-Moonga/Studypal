"use client";

import { DragEvent, FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type SourceType = "past_paper" | "syllabus" | "textbook";
type QueuedFile = { id: string; file: File; sourceType: SourceType; status: "ready" | "uploading" | "queued" | "processing" | "review" | "failed"; error?: string };
type Choice = { key: string; text: string };
type Question = { section_title: string; question_type: string; prompt: string; choices: Choice[]; answer: string; accepted_answers?: string[]; explanation: string; points: number; year: number | null; topic: string; difficulty: string; sequence_order: number; needs_review: boolean; confidence: number; rubric?: Record<string, unknown> };
type Draft = { title: string; sections: { title: string; description: string; topics: string[] }[]; questions: Question[] };
type Job = { id: string; fileName: string; sourceType: SourceType; status: string; completed_chunks: number; total_chunks: number; draft?: Draft; error?: string };

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.tif,.tiff,.doc,.docx,.txt,.md,.rtf,.odt,.ppt,.pptx,.xls,.xlsx,.csv";
const TYPE_LABELS: Record<SourceType, string> = { past_paper: "Past paper", syllabus: "Syllabus", textbook: "Textbook / notes" };

function inferType(name: string): SourceType {
  const value = name.toLowerCase();
  if (/syllabus|curriculum|specification/.test(value)) return "syllabus";
  if (/textbook|coursebook|study.?guide|notes|chapter/.test(value)) return "textbook";
  return "past_paper";
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ImportWorkspace({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [activeJobId, setActiveJobId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteType, setPasteType] = useState<SourceType>("past_paper");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const draft = activeJobId ? drafts[activeJobId] : null;
  const papers = useMemo(() => queue.filter((item) => item.sourceType === "past_paper").length, [queue]);

  function addFiles(values: File[]) {
    setError("");
    setQueue((current) => {
      const seen = new Set(current.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
      const additions = values.filter((file) => !seen.has(`${file.name}:${file.size}:${file.lastModified}`)).map((file) => ({ id: crypto.randomUUID(), file, sourceType: inferType(file.name), status: "ready" as const }));
      return [...current, ...additions];
    });
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files));
  }

  function updateQueued(id: string, next: Partial<QueuedFile>) {
    setQueue((current) => current.map((item) => item.id === id ? { ...item, ...next } : item));
  }

  function updateJob(id: string, next: Partial<Job>) {
    setJobs((current) => current.map((job) => job.id === id ? { ...job, ...next } : job));
  }

  async function processJob(id: string, fileName: string, sourceType: SourceType, retry = false) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const response = await fetch(`/api/import/jobs/${id}/process`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retry: retry && attempt === 0 }),
      });
      const processResult = await response.json().catch(() => ({}));
      if (!response.ok) {
        const reason = processResult.error || "AI could not read this material.";
        updateJob(id, { status: "failed", error: reason });
        throw new Error(`${fileName}: ${reason}`);
      }
      const statusResponse = await fetch(`/api/import/jobs/${id}`);
      const result = await statusResponse.json();
      if (!statusResponse.ok) throw new Error(result.error || `Could not check ${fileName}.`);
      const job = { id, fileName, sourceType, ...result.job } as Job;
      updateJob(id, job);
      if (job.status === "review") {
        if (job.draft) setDrafts((current) => ({ ...current, [id]: job.draft! }));
        setActiveJobId((current) => current || id);
        return;
      }
      if (job.status === "failed") throw new Error(`${fileName}: ${job.error || "Import failed."}`);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    }
    throw new Error(`${fileName} is taking longer than expected. Retry it from this list.`);
  }

  async function runJobs(nextJobs: { jobId: string; fileName: string; sourceType: SourceType; totalChunks: number }[]) {
    setJobs(nextJobs.map((job) => ({ id: job.jobId, fileName: job.fileName, sourceType: job.sourceType, status: "queued", completed_chunks: 0, total_chunks: job.totalChunks })));
    const work = [...nextJobs];
    const worker = async () => {
      while (work.length) {
        const job = work.shift();
        if (!job) return;
        try { await processJob(job.jobId, job.fileName, job.sourceType); }
        catch (reason) { setError((current) => current || (reason instanceof Error ? reason.message : "One file could not be processed.")); }
      }
    };
    await Promise.all([worker(), worker()]);
  }

  async function uploadAll() {
    if (!queue.length) return;
    setBusy(true); setError(""); setMessage(""); setDrafts({}); setActiveJobId("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session expired. Sign in again, then retry.");
      const items = [];
      for (const item of queue) {
        if (item.file.size > 50 * 1024 * 1024) { updateQueued(item.id, { status: "failed", error: "File is over 50 MB" }); throw new Error(`${item.file.name} is over Gemini's 50 MB document limit.`); }
        updateQueued(item.id, { status: "uploading", error: undefined });
        const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
        const storagePath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("study-materials").upload(storagePath, item.file, { contentType: item.file.type || "application/octet-stream" });
        if (uploadError) { updateQueued(item.id, { status: "failed", error: uploadError.message }); throw new Error(`Could not upload ${item.file.name}: ${uploadError.message}`); }
        updateQueued(item.id, { status: "queued" });
        items.push({ storagePath, fileName: item.file.name, mimeType: item.file.type || "application/octet-stream", size: item.file.size, sourceType: item.sourceType });
      }
      const response = await fetch("/api/import/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, items }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The files uploaded, but StudyPal could not prepare them.");
      setMessage(`Uploaded ${items.length} item${items.length === 1 ? "" : "s"}. AI is reading them now; review each result before saving.`);
      await runJobs(result.jobs);
      setQueue([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not import these files."); }
    finally { setBusy(false); }
  }

  async function paste(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, sourceType: pasteType, title: pasteTitle, text: pasteText }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not prepare the pasted material.");
      await runJobs([{ jobId: result.jobId, fileName: pasteTitle || "Pasted material", sourceType: pasteType, totalChunks: result.totalChunks }]);
      setPasteText(""); setPasteTitle(""); setPasteOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not import pasted material."); }
    finally { setBusy(false); }
  }

  async function retry(job: Job) {
    setError(""); updateJob(job.id, { status: "queued", error: undefined });
    try { await processJob(job.id, job.fileName, job.sourceType, true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Retry failed."); }
  }

  function updateQuestion(index: number, key: keyof Question, value: string | number | boolean) {
    if (!draft) return;
    setDrafts((current) => ({ ...current, [activeJobId]: { ...draft, questions: draft.questions.map((question, questionIndex) => questionIndex === index ? { ...question, [key]: value } : question) } }));
  }

  function removeQuestion(index: number) {
    if (!draft) return;
    setDrafts((current) => ({ ...current, [activeJobId]: { ...draft, questions: draft.questions.filter((_, questionIndex) => questionIndex !== index) } }));
  }

  async function approve() {
    if (!draft || !activeJobId) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/import/jobs/${activeJobId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error || "Could not save this reviewed import.");
    else {
      setMessage(`Saved ${result.saved} new question${result.saved === 1 ? "" : "s"}; ${result.repeated} repeated appearance${result.repeated === 1 ? "" : "s"} increased relevance.`);
      setJobs((current) => current.map((job) => job.id === activeJobId ? { ...job, status: "approved" } : job));
      const next = jobs.find((job) => job.id !== activeJobId && job.status === "review");
      setActiveJobId(next?.id || ""); router.refresh();
    }
    setBusy(false);
  }

  return <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_18px_60px_rgba(17,17,17,0.05)]">
    <div className="grid gap-6 border-b border-black/8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-start">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d94b45]">Build the question bank</p><h2 className="mt-2 text-2xl font-bold sm:text-3xl">Add all your exam material at once</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-black/50">Past papers create the exact study questions. Syllabuses and textbooks are optional context for better topic tags, explanations, study guides, and marking support.</p></div>
      <div className="rounded-2xl bg-[#fff0ef] px-4 py-3 text-sm text-[#7a2824]"><strong>Only past papers are required.</strong><span className="mt-1 block text-xs opacity-70">You will review everything before it is saved.</span></div>
    </div>
    <div className="p-6 sm:p-8">
      <div onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop} className={`grid min-h-48 place-items-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${dragging ? "border-[#d94b45] bg-[#fff0ef]" : "border-black/15 bg-[#fafaf8] hover:border-black/30"}`}>
        <div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#111] text-xl text-white">↑</span><p className="mt-4 text-lg font-bold">Drop papers, syllabuses, and books here</p><p className="mt-2 text-sm text-black/45">PDF, images, Word, PowerPoint, spreadsheets, text and more · up to 50 MB each</p><button type="button" onClick={() => picker.current?.click()} className="mt-5 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-bold shadow-sm">Choose files</button><input ref={picker} type="file" multiple accept={ACCEPT} className="hidden" onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.currentTarget.value = ""; }} /></div>
      </div>

      {queue.length > 0 && <div className="mt-6"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-bold">Upload queue</h3><p className="mt-1 text-xs text-black/40">{queue.length} file{queue.length === 1 ? "" : "s"} · {papers} past paper{papers === 1 ? "" : "s"}</p></div><button type="button" onClick={() => setQueue([])} disabled={busy} className="text-xs font-bold text-black/45 hover:text-[#d94b45]">Clear all</button></div><div className="space-y-2">{queue.map((item) => <div key={item.id} className="grid gap-3 rounded-2xl border border-black/10 p-3 sm:grid-cols-[auto_1fr_170px_auto] sm:items-center"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f2f2ef] text-xs font-black uppercase">{item.file.name.split(".").pop()?.slice(0, 4)}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.file.name}</p><p className="mt-0.5 text-xs text-black/40">{formatSize(item.file.size)} · {item.status === "ready" ? "Ready" : item.status}</p>{item.error && <p className="mt-1 text-xs text-[#a8322d]">{item.error}</p>}</div><select aria-label={`Material type for ${item.file.name}`} value={item.sourceType} disabled={busy} onChange={(event) => updateQueued(item.id, { sourceType: event.target.value as SourceType })} className="auth-input py-2.5">{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" aria-label={`Remove ${item.file.name}`} disabled={busy} onClick={() => setQueue((current) => current.filter((value) => value.id !== item.id))} className="grid h-9 w-9 place-items-center rounded-full text-black/35 hover:bg-[#fff0ef] hover:text-[#d94b45]">×</button></div>)}</div></div>}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => setPasteOpen((value) => !value)} className="text-left text-sm font-bold text-[#a8322d]">{pasteOpen ? "Hide pasted text" : "Or paste text instead"}</button><button type="button" onClick={uploadAll} disabled={busy || !queue.length} className="rounded-xl bg-[#111] px-5 py-3 text-sm font-bold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Uploading and reading…" : `Upload ${queue.length || ""} ${queue.length === 1 ? "item" : "items"}`}</button></div>

      {pasteOpen && <form onSubmit={paste} className="mt-5 rounded-2xl bg-[#f7f7f5] p-4 sm:p-5"><div className="grid gap-3 sm:grid-cols-[180px_1fr]"><select value={pasteType} onChange={(event) => setPasteType(event.target.value as SourceType)} className="auth-input"><option value="past_paper">Past paper</option><option value="syllabus">Syllabus</option><option value="textbook">Textbook / notes</option></select><input value={pasteTitle} onChange={(event) => setPasteTitle(event.target.value)} className="auth-input" placeholder="Title (optional)" /></div><textarea required minLength={30} value={pasteText} onChange={(event) => setPasteText(event.target.value)} rows={7} className="auth-input mt-3 resize-y" placeholder="Paste the material here…" /><button disabled={busy} className="mt-3 rounded-xl bg-[#111] px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Prepare pasted material</button></form>}

      {error && <p role="alert" className="mt-5 rounded-2xl border border-[#d94b45]/20 bg-[#fff0ef] px-4 py-3 text-sm leading-5 text-[#8d2e29]">{error}</p>}
      {message && <p role="status" className="mt-5 rounded-2xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-800">{message}</p>}

      {jobs.length > 0 && <div className="mt-6 rounded-2xl border border-black/10 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">AI import progress</h3><span className="text-xs text-black/40">You can review files one by one</span></div><div className="space-y-2">{jobs.map((job) => <div key={job.id} className="flex flex-col justify-between gap-2 rounded-xl bg-[#f7f7f5] px-3 py-3 sm:flex-row sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-semibold">{job.fileName}</p><p className="mt-0.5 text-xs text-black/40">{TYPE_LABELS[job.sourceType]} · {job.status === "processing" || job.status === "queued" ? `${job.completed_chunks}/${job.total_chunks} parts read` : job.status}</p></div><div className="flex gap-2">{job.status === "failed" && <button type="button" onClick={() => retry(job)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#a8322d]">Retry</button>}{job.status === "review" && <button type="button" onClick={() => setActiveJobId(job.id)} className={`rounded-lg px-3 py-2 text-xs font-bold ${activeJobId === job.id ? "bg-[#d94b45] text-white" : "bg-white text-[#a8322d]"}`}>Review {job.draft?.questions?.length ?? drafts[job.id]?.questions?.length ?? ""} questions</button>}{job.status === "approved" && <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Saved</span>}</div></div>)}</div></div>}
    </div>

    {draft && <div className="border-t border-black/10 bg-[#fcfcfa] p-6 sm:p-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d94b45]">Review before saving</p><h3 className="mt-2 text-2xl font-bold">{draft.title}</h3><p className="mt-2 text-sm text-black/50">{draft.questions.length} extracted question{draft.questions.length === 1 ? "" : "s"}. Edit anything unclear or remove it.</p></div><button type="button" onClick={approve} disabled={busy} className="rounded-xl bg-[#d94b45] px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{busy ? "Saving…" : "Approve and add to bank"}</button></div><div className="mt-6 space-y-3">{draft.questions.map((question, index) => <article key={`${index}-${question.prompt.slice(0, 24)}`} className="rounded-2xl border border-black/10 bg-white p-4"><div className="flex items-start justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-black/40">Question {index + 1} · {question.question_type.replaceAll("_", " ")} · {Math.round(question.confidence * 100)}% confidence</p><div className="flex items-center gap-2">{question.needs_review && <span className="rounded-full bg-[#fff0ef] px-2 py-1 text-[11px] font-bold text-[#a8322d]">Check</span>}<button type="button" onClick={() => removeQuestion(index)} className="text-xs font-bold text-black/35 hover:text-[#d94b45]">Remove</button></div></div><textarea value={question.prompt} onChange={(event) => updateQuestion(index, "prompt", event.target.value)} className="auth-input mt-3 min-h-24 resize-y" /><div className="mt-3 grid gap-3 sm:grid-cols-3"><input value={question.topic} onChange={(event) => updateQuestion(index, "topic", event.target.value)} className="auth-input" placeholder="Topic" /><input type="number" min={1} value={question.points} onChange={(event) => updateQuestion(index, "points", Number(event.target.value))} className="auth-input" placeholder="Points" /><input type="number" value={question.year || ""} onChange={(event) => updateQuestion(index, "year", Number(event.target.value) || 0)} className="auth-input" placeholder="Year" /></div>{question.choices?.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{question.choices.map((choice) => <p key={choice.key} className="rounded-xl bg-[#f7f7f5] px-3 py-2 text-sm"><strong>{choice.key}.</strong> {choice.text}</p>)}</div>}</article>)}</div>{!draft.questions.length && <p className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">No questions were visible in this item. You can approve its curriculum sections, or go back and upload a clearer paper.</p>}</div>}
  </section>;
}
