"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { csvTemplate } from "@/lib/question-csv";

type Paper = { id: string; title: string };
type Result = { saved: number; repeated: number; tagged: number; withDiagrams: number; papers: string[]; rowErrors: { row: number; message: string }[] };

// Adds ready-made questions (with answers and diagrams) from a CSV made outside StudyPal.
export function QuestionCsvImport({ subjectId, sections, papers }: { subjectId: string; sections: { title: string }[]; papers: Paper[] }) {
  const router = useRouter();
  const csvInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [defaultSourceId, setDefaultSourceId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([csvTemplate()], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url; link.download = "studypal-questions-template.csv"; link.click();
    URL.revokeObjectURL(url);
  }

  async function copySections() {
    await navigator.clipboard.writeText(sections.map((section) => section.title).join("\n"));
    setCopied(true); window.setTimeout(() => setCopied(false), 2000);
  }

  async function importQuestions() {
    if (!csvFile) { setError("Choose the CSV file first."); return; }
    setError(""); setResult(null);
    try {
      const figures: Record<string, string> = {};
      if (images.length) {
        setBusy(`Uploading ${images.length} diagram${images.length === 1 ? "" : "s"}…`);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Please log in again.");
        for (const image of images) {
          const safeName = image.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
          const storagePath = `${user.id}/figures/${crypto.randomUUID()}-${safeName}`;
          const { error: uploadError } = await supabase.storage.from("study-materials").upload(storagePath, image, { contentType: image.type || "image/png" });
          if (uploadError) throw new Error(`Could not upload ${image.name}: ${uploadError.message}`);
          figures[image.name] = storagePath; figures[image.name.toLowerCase()] = storagePath;
        }
      }
      setBusy("Saving questions…");
      const response = await fetch("/api/import/questions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, csv: await csvFile.text(), figures, defaultSourceId: defaultSourceId || null }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "We could not import this file."); if (data.rowErrors) setResult({ saved: 0, repeated: 0, tagged: 0, withDiagrams: 0, papers: [], rowErrors: data.rowErrors }); return; }
      setResult(data);
      setCsvFile(null); setImages([]);
      if (csvInput.current) csvInput.current.value = "";
      if (imageInput.current) imageInput.current.value = "";
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not import this file."); }
    finally { setBusy(""); }
  }

  return <div className="rounded-3xl border border-black/10 bg-white p-6 sm:p-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d94b45]">Ready-made questions</p>
        <h2 className="mt-2 text-2xl font-bold">Import a question file</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-black/50">Upload a CSV with questions, answers and explanations. Add diagram images too; name each one in the CSV&apos;s <code className="rounded bg-[#f1f1ef] px-1">diagram</code> column, or write <code className="rounded bg-[#f1f1ef] px-1">page:4</code> to show a page of the paper&apos;s PDF.</p>
      </div>
      <div className="flex shrink-0 gap-2 text-xs font-bold">
        <button onClick={downloadTemplate} className="rounded-xl border border-black/10 px-3 py-2 hover:border-black/25">Template</button>
        {sections.length > 0 && <button onClick={copySections} className="rounded-xl border border-black/10 px-3 py-2 hover:border-black/25">{copied ? "Copied" : "Copy section names"}</button>}
      </div>
    </div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="block rounded-2xl border border-dashed border-black/15 p-4 text-sm"><span className="font-semibold">Question CSV</span><input ref={csvInput} type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] || null)} className="mt-2 block w-full text-xs text-black/60" /></label>
      <label className="block rounded-2xl border border-dashed border-black/15 p-4 text-sm"><span className="font-semibold">Diagram images <span className="font-normal text-black/40">(optional)</span></span><input ref={imageInput} type="file" accept="image/*" multiple onChange={(event) => setImages([...(event.target.files || [])])} className="mt-2 block w-full text-xs text-black/60" /></label>
    </div>
    {papers.length > 0 && <label className="mt-4 block text-sm"><span className="font-semibold">Paper for rows without a <code className="rounded bg-[#f1f1ef] px-1">paper</code> value</span>
      <select value={defaultSourceId} onChange={(event) => setDefaultSourceId(event.target.value)} className="auth-input mt-2"><option value="">Create &quot;Imported questions&quot;</option>{papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title}</option>)}</select></label>}
    <div className="mt-5 flex items-center justify-between gap-3">
      <p className="text-xs text-black/40">{csvFile ? `${csvFile.name}${images.length ? ` + ${images.length} diagram${images.length === 1 ? "" : "s"}` : ""}` : "No file chosen"}</p>
      <button onClick={importQuestions} disabled={Boolean(busy) || !csvFile} className="rounded-xl bg-[#111] px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{busy || "Import questions"}</button>
    </div>
    {error && <p className="mt-4 rounded-2xl bg-[#fff0ef] p-4 text-sm text-[#a8322d]">{error}</p>}
    {result && <div className="mt-4 rounded-2xl bg-[#f5f5f3] p-4 text-sm leading-6">
      {result.saved + result.repeated > 0 && <p className="font-semibold">Added {result.saved} question{result.saved === 1 ? "" : "s"}{result.repeated ? `, plus ${result.repeated} already in this subject (linked, not duplicated)` : ""}. {result.tagged} matched a section, {result.withDiagrams} with diagrams.</p>}
      {result.papers.length > 0 && <p className="text-black/55">Papers: {result.papers.join(" · ")}</p>}
      {result.rowErrors.length > 0 && <div className="mt-2"><p className="font-semibold text-[#a8322d]">{result.rowErrors.length} row{result.rowErrors.length === 1 ? " was" : "s were"} skipped</p><ul className="mt-1 max-h-48 list-disc overflow-auto pl-5 text-xs text-black/60">{result.rowErrors.map((item) => <li key={`${item.row}-${item.message}`}>Row {item.row}: {item.message}</li>)}</ul></div>}
    </div>}
  </div>;
}
