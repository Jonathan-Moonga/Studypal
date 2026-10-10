"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function SubjectCreator() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function createSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/subjects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Could not create subject.");
    else { setName(""); setOpen(false); router.refresh(); }
    setSaving(false);
  }

  return <>
    <button onClick={() => setOpen(true)} className="rounded-xl bg-[#111] px-4 py-3 text-sm font-bold text-white transition hover:bg-black/80">+ Add subject</button>
    {open && <div className="fixed inset-0 z-20 grid place-items-center bg-black/30 p-5" role="dialog" aria-modal="true" aria-label="Create a subject"><form onSubmit={createSubject} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d94b45]">New subject</p><h2 className="mt-2 text-2xl font-bold">What are you learning?</h2></div><button type="button" onClick={() => setOpen(false)} className="text-2xl leading-none text-black/35" aria-label="Close">×</button></div><label className="mt-6 block"><span className="mb-2 block text-sm font-semibold">Subject name</span><input required autoFocus value={name} onChange={(event) => setName(event.target.value)} className="auth-input" placeholder="Biology, SAT Math…" /></label>{error && <p className="mt-3 rounded-xl bg-[#fff0ef] px-3 py-2 text-sm text-[#a8322d]">{error}</p>}<button disabled={saving} className="mt-5 w-full rounded-xl bg-[#d94b45] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Creating…" : "Create subject"}</button></form></div>}
  </>;
}
