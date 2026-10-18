"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { GRADE12_BIOLOGY_UNITS } from "@/lib/biology-curriculum";

type Note = {
  id: string;
  title: string;
  body: string;
  lessonTitle: string;
  sourceName: string;
  sourcePage: number;
  pdfUrl: string | null;
  ocrDerived?: boolean;
  ocrEngine?: string | null;
};

export function BiologyNotesLibrary({ subjectId }: { subjectId: string }) {
  const [unitKey, setUnitKey] = useState(GRADE12_BIOLOGY_UNITS[0]?.id || "unit-1");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openNote, setOpenNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/biology/notes?subjectId=${encodeURIComponent(subjectId)}&unitKey=${encodeURIComponent(unitKey)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "We could not load these notes.");
        if (!cancelled) {
          setNotes(data.notes || []);
          setOpenNote(null);
        }
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "We could not load these notes."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [subjectId, unitKey]);

  const grouped = useMemo(() => notes.reduce<Record<string, Note[]>>((all, note) => {
    (all[note.lessonTitle] ||= []).push(note);
    return all;
  }, {}), [notes]);

  return <section className="rounded-3xl border border-[#d9e5f1] bg-white p-5 sm:p-6" aria-label="Verbatim Biology notes">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1f73b7]">Verbatim study notes</p><h2 className="mt-2 text-2xl font-bold text-[#14324b]">Read the supplied material by unit</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">These passages are kept as extracted from the uploaded sources. Each page keeps its source title and page number so the original can be opened alongside it.</p></div><label className="sm:w-80"><span className="sr-only">Choose Biology notes unit</span><select value={unitKey} onChange={(event) => setUnitKey(event.target.value)} className="auth-input">{GRADE12_BIOLOGY_UNITS.map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label></div>
    {loading && <p className="mt-5 rounded-2xl bg-[#f2f8fd] p-4 text-sm text-[#315b79]">Loading the source pages…</p>}
    {error && <p role="alert" className="mt-5 rounded-2xl bg-[#fff0ef] p-4 text-sm text-[#a8322d]">{error}</p>}
    {!loading && !error && !notes.length && <p className="mt-5 rounded-2xl bg-[#fffaf0] p-4 text-sm text-[#7a5b1b]">This unit has not been imported into this profile yet.</p>}
    {!loading && !error && notes.length > 0 && <div className="mt-5 space-y-4">{Object.entries(grouped).map(([lesson, lessonNotes]) => <div key={lesson} className="rounded-2xl border border-black/10 bg-[#fbfdff]"><div className="border-b border-black/10 px-4 py-3"><h3 className="font-bold text-[#14324b]">{lesson}</h3><p className="mt-1 text-xs text-black/45">{lessonNotes.length} source page{lessonNotes.length === 1 ? "" : "s"}</p></div><div className="divide-y divide-black/10">{lessonNotes.map((note) => <article key={note.id} className="px-4 py-3"><button type="button" onClick={() => setOpenNote(openNote === note.id ? null : note.id)} className="flex w-full items-start justify-between gap-4 text-left"><span><span className="block text-sm font-semibold text-[#14324b]">{note.sourceName}</span><span className="mt-1 block text-xs text-black/45">Page {note.sourcePage}</span></span><span className="rounded-lg bg-[#eaf5ff] px-2.5 py-1 text-xs font-bold text-[#1f5f95]">{openNote === note.id ? "Hide" : "Read"}</span></button>{openNote === note.id && <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">{note.ocrDerived && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">OCR-extracted from an image page. Check the linked original page for diagram labels or ambiguous characters{note.ocrEngine ? ` (${note.ocrEngine})` : ""}.</p>}<p className="whitespace-pre-wrap text-sm leading-7 text-[#1f3445]">{note.body}</p>{note.pdfUrl && note.sourcePage > 0 && <a className="mt-4 inline-flex text-xs font-bold text-[#1f73b7] underline" href={`${note.pdfUrl}#page=${note.sourcePage}`} target="_blank" rel="noreferrer">Open original PDF page {note.sourcePage} ↗</a>}</div>}</article>)}</div></div>)}</div>}
  </section>;
}
