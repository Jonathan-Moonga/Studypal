"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { BIOLOGY_SOURCE_LIBRARY, GRADE12_BIOLOGY_UNITS, type BiologyUnit } from "@/lib/biology-curriculum";

type Source = { id: string; title: string; source_type: string; status: string; metadata?: Record<string, unknown> | null };

export function BiologyStudyHub({ sources = [] }: { sources?: Source[] }) {
  const [query, setQuery] = useState("");
  const [openUnit, setOpenUnit] = useState("unit-1");
  const [message, setMessage] = useState("");
  const sourceLibrary = sources.filter((source) => Boolean(source.metadata && (source.metadata as Record<string, unknown>).biology_source));
  const visibleSources = sourceLibrary.length ? sourceLibrary : BIOLOGY_SOURCE_LIBRARY.map((source, index) => ({ id: `static-${index}`, title: source.name, source_type: "textbook", status: "ready", metadata: { summary: source.summary, pages: source.pages } }));

  const filteredUnits = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return GRADE12_BIOLOGY_UNITS;
    return GRADE12_BIOLOGY_UNITS.filter((unit) => {
      const searchable = `${unit.title} ${unit.description} ${unit.lessons.map((lesson) => lesson.title).join(" ")}`;
      return searchable.toLowerCase().includes(normalized);
    });
  }, [query]);

  function startUnitQuiz(unit: BiologyUnit) {
    setOpenUnit(unit.id);
    document.getElementById("biology-assessments")?.scrollIntoView({ behavior: "smooth" });
    setMessage("Choose the unit and version in the Assessment desk before opening it.");
  }

  return (
    <section className="mt-8 space-y-6" aria-label="Grade 12 Biology study course">
      <div className="overflow-hidden rounded-[2rem] border border-[#d9e5f1] bg-[#eaf5ff]">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#1f5f95]">
              <span>Grade 12 Biology</span><span className="rounded-full bg-white/80 px-2.5 py-1 tracking-normal text-[#2673ad]">12 units</span><span className="rounded-full bg-white/80 px-2.5 py-1 tracking-normal text-[#2673ad]">Source-linked</span>
            </div>
            <h2 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-[#14324b] sm:text-4xl">Learn in a clear path, then prove what you know.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#315b79]">A Khan-style course map for the supplied Grade 12 Biology materials: units, short lessons, source pages, and a quiz checkpoint after each unit.</p>
            <div className="mt-6 flex flex-wrap gap-3"><a href="#biology-units" className="rounded-xl bg-[#1f73b7] px-4 py-3 text-sm font-bold text-white shadow-sm">Start Unit 1</a><a href="#biology-materials" className="rounded-xl bg-white/75 px-4 py-3 text-sm font-bold text-[#1f5f95]">View source library</a></div>
          </div>
          <div className="rounded-3xl bg-white/75 p-5 shadow-sm">
            <div className="flex items-center justify-between text-sm"><span className="font-bold text-[#14324b]">Course progress</span><span className="font-bold text-[#1f73b7]">0%</span></div>
            <div className="mt-4 h-2.5 rounded-full bg-[#cfe4f4]"><div className="h-2.5 w-0 rounded-full bg-[#1f73b7]" /></div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center"><div><p className="text-xl font-bold text-[#14324b]">0</p><p className="mt-1 text-[11px] text-[#55748b]">mastered</p></div><div><p className="text-xl font-bold text-[#14324b]">12</p><p className="mt-1 text-[11px] text-[#55748b]">unit quizzes</p></div><div><p className="text-xl font-bold text-[#14324b]">{visibleSources.length}</p><p className="mt-1 text-[11px] text-[#55748b]">sources</p></div></div>
          </div>
        </div>
      </div>

      <div id="biology-units" className="rounded-3xl border border-black/10 bg-white p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1f73b7]">Course outline</p><h3 className="mt-2 text-2xl font-bold text-[#14324b]">Units and lessons</h3><p className="mt-2 text-sm text-black/50">Each lesson keeps the original source page ranges attached.</p></div><label className="sm:w-64"><span className="sr-only">Search Biology units</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="auth-input" placeholder="Search units or lessons" /></label></div>
        <div className="mt-5 space-y-3">
          {filteredUnits.map((unit, index) => <UnitCard key={unit.id} unit={unit} index={index} open={openUnit === unit.id} starting={false} onToggle={() => setOpenUnit(openUnit === unit.id ? "" : unit.id)} onStartQuiz={() => startUnitQuiz(unit)} />)}
        </div>
        {!filteredUnits.length && <p className="py-8 text-center text-sm text-black/45">No Biology unit matches that search.</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-[#fff7e9] px-3 py-2.5 text-sm text-[#7a5b1b]">{message}</p>}
      </div>

      <div id="biology-materials" className="grid gap-6 lg:grid-cols-[1fr_.75fr]">
        <section className="rounded-3xl border border-black/10 bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">Source library</p><h3 className="mt-2 text-2xl font-bold text-[#14324b]">Original notes stay original</h3></div><span className="rounded-full bg-[#eaf5ff] px-3 py-1 text-xs font-bold text-[#1f5f95]">{visibleSources.length} indexed sources</span></div><p className="mt-3 text-sm leading-6 text-black/50">Every indexed source keeps its original title, page count and extracted wording. Open a unit in the verbatim notes reader to study the pages in context.</p><div className="mt-5 grid gap-2 sm:grid-cols-2">{visibleSources.map((source) => { const metadata = (source.metadata || {}) as Record<string, unknown>; return <div key={source.id} className="rounded-xl border border-black/10 bg-[#fbfdff] p-3"><p className="text-sm font-bold text-[#14324b]">{source.title}</p><p className="mt-1 text-xs leading-5 text-black/45">{String(metadata.page_count || metadata.pages || "Source material")}</p>{Boolean(metadata.storage_error) && <p className="mt-2 text-xs leading-5 text-[#a8322d]">Original PDF is indexed, but its file is too large for direct storage; extracted notes remain available.</p>}</div>; })}</div></section>
        <section className="rounded-3xl border border-[#d9e5f1] bg-[#f2f7fb] p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1f5f95]">Source figures</p><h3 className="mt-2 text-2xl font-bold text-[#14324b]">Learn from the diagrams too</h3><p className="mt-3 text-sm leading-6 text-[#315b79]">Two embedded figures from the supplied O-Level notes are already attached to Unit 1 as visual references.</p><div className="mt-4 space-y-4"><figure className="overflow-hidden rounded-2xl border border-black/10 bg-white"><Image src="/biology-figures/o-level-cell-page-1-2.png" alt="Animal cell and plant cell comparison from Biology-notes-for-O-level, page 1" width={910} height={511} className="w-full object-cover" /><figcaption className="px-3 py-2 text-[11px] text-black/45">Animal cell and plant cell comparison - Biology-notes-for-O-level - p. 1</figcaption></figure><figure className="overflow-hidden rounded-2xl border border-black/10 bg-white"><Image src="/biology-figures/o-level-cell-page-2-3.png" alt="Root hair cell figure from Biology-notes-for-O-level, page 2" width={358} height={326} className="mx-auto max-h-44 w-full object-contain p-3" /><figcaption className="px-3 py-2 text-[11px] text-black/45">Root hair cell figure - Biology-notes-for-O-level - p. 2</figcaption></figure></div></section>
      </div>
    </section>
  );
}

function UnitCard({ unit, index, open, starting, onToggle, onStartQuiz }: { unit: BiologyUnit; index: number; open: boolean; starting: boolean; onToggle: () => void; onStartQuiz: () => void }) {
  return <article className={`overflow-hidden rounded-2xl border transition ${open ? "border-[#8fc5ea] shadow-sm" : "border-black/10"}`}>
    <button type="button" onClick={onToggle} className="flex w-full items-start gap-4 p-4 text-left sm:p-5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eaf5ff] text-sm font-bold text-[#1f73b7]">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-3"><span className="font-bold text-[#14324b]">{unit.title}</span><span className="text-xs font-semibold text-black/35">0% mastery</span></span><span className="mt-2 block text-sm leading-5 text-black/50">{unit.description}</span><span className="mt-3 block h-1.5 rounded-full bg-black/10"><span className="block h-1.5 w-0 rounded-full bg-[#1f73b7]" /></span></span><span className="mt-1 text-lg text-black/30">{open ? "-" : "+"}</span></button>
    {open && <div className="border-t border-black/10 bg-[#fbfdff] px-4 pb-5 pt-4 sm:px-5"><div className="grid gap-5 lg:grid-cols-[1fr_.65fr]"><div className="space-y-2">{unit.lessons.map((lesson, lessonIndex) => <div key={lesson.title} className="flex items-center gap-3 rounded-xl border border-black/10 bg-white p-3"><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${lesson.kind === "practice" ? "bg-[#fff0ef] text-[#a8322d]" : "bg-[#eaf5ff] text-[#1f73b7]"}`}>{lesson.kind === "practice" ? "✓" : lessonIndex + 1}</span><span className="flex-1 text-sm font-semibold text-[#14324b]">{lesson.title}</span>{lesson.kind === "practice" && <button type="button" onClick={onStartQuiz} disabled={starting} className="rounded-lg bg-[#1f73b7] px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">{starting ? "Starting..." : "Quiz"}</button>}</div>)}</div><div className="rounded-2xl bg-[#f2f7fb] p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#55748b]">Source pages</p><div className="mt-3 space-y-2">{unit.sources.slice(0, 4).map((ref) => <div key={`${ref.name}-${ref.pages}`} className="flex items-start justify-between gap-3 text-xs"><span className="font-semibold text-[#315b79]">{ref.name}</span><span className="shrink-0 text-right text-[#55748b]">{ref.pages}</span></div>)}</div><p className="mt-4 text-xs leading-5 text-black/45">{unit.questionBank}</p></div></div></div>}
  </article>;
}
