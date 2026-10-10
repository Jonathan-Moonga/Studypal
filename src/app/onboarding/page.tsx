"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [weeklyGoalMinutes, setWeeklyGoalMinutes] = useState("180");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, examName, examDate, weeklyGoalMinutes }) });
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
              <label className="block"><span className="mb-2 block text-sm font-semibold">What are you preparing for?</span><input required value={examName} onChange={(event) => setExamName(event.target.value)} className="auth-input" placeholder="SAT, A-level Biology, final exams…" /></label>
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
