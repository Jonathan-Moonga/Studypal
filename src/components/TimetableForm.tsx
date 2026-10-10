"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Subject = { id: string; name: string };

export function TimetableForm({ subjects }: { subjects: Subject[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch("/api/timetable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, subjectId: subjectId || null, startsAt, endsAt }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Could not save this study block.");
    else { setTitle(""); setStartsAt(""); setEndsAt(""); router.refresh(); }
    setSaving(false);
  }
  return <form onSubmit={submit} className="rounded-3xl border border-black/10 bg-white p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d94b45]">New block</p><h2 className="mt-2 text-2xl font-bold">Make time for the next step</h2><div className="mt-5 space-y-4"><label className="block"><span className="mb-2 block text-sm font-semibold">What are you doing?</span><input required value={title} onChange={(event) => setTitle(event.target.value)} className="auth-input" placeholder="Review cellular respiration" /></label><label className="block"><span className="mb-2 block text-sm font-semibold">Subject <span className="font-normal text-black/35">(optional)</span></span><select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="auth-input"><option value="">General study</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-sm font-semibold">Starts</span><input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="auth-input" /></label><label className="block"><span className="mb-2 block text-sm font-semibold">Ends</span><input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="auth-input" /></label></div>{error && <p role="alert" className="rounded-xl bg-[#fff0ef] px-3 py-2 text-sm text-[#a8322d]">{error}</p>}<button disabled={saving} className="w-full rounded-xl bg-[#111] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Add to timetable"}</button></div></form>;
}
