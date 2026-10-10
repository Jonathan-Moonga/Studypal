"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function SubjectExamDate({ subjectId, initialDate, initialTime, initialPaper, compact = false }: { subjectId: string; initialDate?: string | null; initialTime?: string | null; initialPaper?: string | null; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!initialDate && !compact);
  const [examDate, setExamDate] = useState(initialDate || "");
  const [examTime, setExamTime] = useState(initialTime?.slice(0, 5) || "");
  const [examPaper, setExamPaper] = useState(initialPaper || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch("/api/subjects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, examDate: examDate || null, examTime: examTime || null, examPaper: examPaper || null }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error || "Could not save the exam date.");
    else { setOpen(false); router.refresh(); }
    setSaving(false);
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-[#a8322d]">{initialDate ? "Edit exam date" : "Add exam date"}</button>;
  return <form onSubmit={save} className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_1fr_auto]"><input required type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} className="auth-input py-2.5" /><input type="time" value={examTime} onChange={(event) => setExamTime(event.target.value)} className="auth-input py-2.5" /><input value={examPaper} onChange={(event) => setExamPaper(event.target.value)} className="auth-input py-2.5" placeholder="Paper / session (optional)" /><div className="flex gap-2"><button disabled={saving} className="rounded-xl bg-[#111] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">{saving ? "Saving…" : "Save"}</button>{(initialDate || compact) && <button type="button" onClick={() => setOpen(false)} className="px-2 text-xs font-bold text-black/40">Cancel</button>}</div>{error && <p role="alert" className="text-xs text-[#a8322d] sm:col-span-4">{error}</p>}</form>;
}
