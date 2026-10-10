"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { EXAM_PRESETS } from "@/lib/exams";

export default function OnboardingPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [examKey, setExamKey] = useState("ecz_grade_12");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(EXAM_PRESETS.find((exam) => exam.key === "ecz_grade_12")?.subjects || []);
  const [examName, setExamName] = useState("ECZ Grade 12 School Certificate / GCE");
  const [examDate, setExamDate] = useState("");
  const [weeklyGoalMinutes, setWeeklyGoalMinutes] = useState("180");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedPreset = EXAM_PRESETS.find((exam) => exam.key === examKey) || EXAM_PRESETS[0];

  function chooseExam(nextKey: string) {
    setExamKey(nextKey);
    setSelectedSubjects(EXAM_PRESETS.find((exam) => exam.key === nextKey)?.subjects || []);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, examKey, examName, examDate, weeklyGoalMinutes, subjects: selectedSubjects }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "We could not save that yet.");
    else router.push("/");
    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-5 py-8 text-[#111] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-bold text-[#d94b45]">← StudyPal</Link>
        <div className="mt-12 grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-start">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d94b45]">First, a little context</p><h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight">Let’s make your plan fit your real life.</h1><p className="mt-4 text-sm leading-6 text-black/55">Just the essentials for now. You can add subjects, goals, and study blocks later.</p></div>
          <form onSubmit={handleSubmit} className="rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_18px_50px_rgba(17,17,17,0.06)] sm:p-8">
            <div className="space-y-5">
              <label className="block"><span className="mb-2 block text-sm font-semibold">What should we call you?</span><input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="auth-input" placeholder="Your first name" /></label>
              <label className="block"><span className="mb-2 block text-sm font-semibold">What are you preparing for?</span><select value={examKey} onChange={(event) => { chooseExam(event.target.value); setExamName(EXAM_PRESETS.find((exam) => exam.key === event.target.value)?.name || ""); }} className="auth-input">{EXAM_PRESETS.map((exam) => <option key={exam.key} value={exam.key}>{exam.name}</option>)}</select><p className="mt-2 text-xs leading-5 text-black/45">{selectedPreset.description} {selectedPreset.note}</p><input required value={examName} onChange={(event) => setExamName(event.target.value)} className="auth-input mt-3" placeholder="Exam name" /></label>
              <fieldset><legend className="mb-2 block text-sm font-semibold">Subjects <span className="font-normal text-black/35">(add or remove later)</span></legend><div className="grid gap-2 sm:grid-cols-2">{selectedSubjects.map((subject) => <label key={subject} className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 bg-[#f7f7f5] px-3 py-2.5 text-sm"><input type="checkbox" checked onChange={() => setSelectedSubjects((current) => current.filter((item) => item !== subject))} className="accent-[#d94b45]" /><span>{subject}</span></label>)}{!selectedSubjects.length && <p className="text-sm text-black/45">No preset subjects. Add one from the dashboard after onboarding.</p>}</div></fieldset>
              <label className="block"><span className="mb-2 block text-sm font-semibold">When is it?</span><input required type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} className="auth-input" /></label>
              <label className="block"><span className="mb-2 block text-sm font-semibold">Weekly study goal</span><select value={weeklyGoalMinutes} onChange={(event) => setWeeklyGoalMinutes(event.target.value)} className="auth-input"><option value="120">2 hours</option><option value="180">3 hours</option><option value="300">5 hours</option><option value="450">7.5 hours</option><option value="600">10 hours</option></select></label>
              {error && <p role="alert" className="rounded-xl bg-[#fff0ef] px-3 py-2.5 text-sm text-[#a8322d]">{error}</p>}
              <button disabled={saving} className="w-full rounded-xl bg-[#111] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-black/80 disabled:opacity-50">{saving ? "Saving your plan…" : "Build my study space"}</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
