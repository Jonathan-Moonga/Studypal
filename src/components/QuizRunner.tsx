"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Question = { id: string; question_type: string; prompt: string; choices: { key: string; text: string }[]; explanation: string | null; points: number; topic: string | null };
type Quiz = { id: string; title: string; quiz_type: string; duration_seconds: number; completed_at: string | null; score: number | null };

export function QuizRunner({ quizId }: { quizId: string }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; earnedPoints: number; totalPoints: number; pendingEssayCount?: number } | null>(null);
  const [essayFeedback, setEssayFeedback] = useState<Record<string, { grade: number; max_grade: number; outline: string[]; strengths: string[]; comments: string[]; improvements: string[]; needs_human_review: boolean }>>({});
  const [gradingEssay, setGradingEssay] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { fetch(`/api/quizzes/${quizId}`).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setQuiz(data.quiz); setQuestions(data.questions); setSecondsLeft(data.quiz.duration_seconds); }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)); }, [quizId]);
  useEffect(() => { if (!secondsLeft || result) return; const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [secondsLeft, result]);

  const current = questions[index];
  const formattedTime = useMemo(() => `${Math.floor(secondsLeft / 60).toString().padStart(2, "0")}:${(secondsLeft % 60).toString().padStart(2, "0")}`, [secondsLeft]);
  async function submitQuiz() {
    setSubmitting(true); setError("");
    const response = await fetch(`/api/quizzes/${quizId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responses }) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "We could not save your quiz."); else setResult(data);
    setSubmitting(false);
  }
  async function gradeEssay() {
    if (!current || !responses[current.id]) return;
    setGradingEssay(true); setError("");
    const response = await fetch("/api/essays/grade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: current.id, response: responses[current.id] }) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "We could not grade this essay."); else setEssayFeedback((old) => ({ ...old, [current.id]: data.feedback }));
    setGradingEssay(false);
  }

  if (loading) return <div className="grid min-h-[60vh] place-items-center text-sm text-black/50">Loading your quiz…</div>;
  if (error && !quiz) return <div className="mx-auto mt-20 max-w-md rounded-3xl bg-[#fff0ef] p-6 text-center text-sm text-[#a8322d]">{error}<Link href="/" className="mt-5 block font-bold underline">Back to dashboard</Link></div>;
  if (result) return <main className="grid min-h-screen place-items-center bg-[#f7f7f5] px-5"><div className="w-full max-w-md rounded-3xl border border-black/10 bg-white p-8 text-center"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d94b45]">Practice complete</p><h1 className="mt-4 text-4xl font-bold">{result.pendingEssayCount ? "Submitted" : `${result.score}%`}</h1><p className="mt-3 text-sm leading-6 text-black/50">{result.pendingEssayCount ? `${result.pendingEssayCount} essay response${result.pendingEssayCount === 1 ? " is" : "s are"} awaiting AI grading.` : `You earned ${result.earnedPoints} of ${result.totalPoints} points. Your next refresher will use this result to choose better questions.`}</p><Link href="/" className="mt-7 inline-flex rounded-xl bg-[#111] px-5 py-3 text-sm font-bold text-white">Back to dashboard</Link></div></main>;
  return <main className="min-h-screen bg-[#f7f7f5] px-5 py-6 text-[#111] sm:px-8"><div className="mx-auto max-w-3xl"><header className="flex items-center justify-between"><Link href="/" className="text-sm font-bold text-[#d94b45]">← Leave quiz</Link><div className={`rounded-full px-4 py-2 text-sm font-bold ${secondsLeft < 60 ? "bg-[#fff0ef] text-[#a8322d]" : "bg-white text-black/65"}`}>⏱ {formattedTime}</div></header><div className="mt-12 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-black/40">{quiz?.quiz_type.replace("_", " ")}</p><h1 className="mt-3 text-3xl font-bold tracking-tight">{quiz?.title}</h1></div><p className="text-sm font-semibold text-black/45">{index + 1} of {questions.length}</p></div><div className="mt-5 h-1.5 rounded-full bg-black/10"><div className="h-1.5 rounded-full bg-[#d94b45] transition-all" style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>{current && <section className="mt-8 rounded-3xl border border-black/10 bg-white p-6 shadow-sm sm:p-9"><div className="flex items-start justify-between gap-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d94b45]">{current.topic || "Practice question"}</p><span className="text-xs text-black/35">{current.points} pt</span></div><h2 className="mt-6 text-2xl font-bold leading-tight">{current.prompt}</h2>{current.question_type === "multiple_choice" ? <div className="mt-8 space-y-3">{(current.choices || []).map((choice) => <button key={choice.key} onClick={() => setResponses((old) => ({ ...old, [current.id]: choice.key }))} className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${responses[current.id] === choice.key ? "border-[#d94b45] bg-[#fff0ef]" : "border-black/10 hover:border-black/25"}`}><span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${responses[current.id] === choice.key ? "bg-[#d94b45] text-white" : "bg-[#f1f1ef] text-black/55"}`}>{choice.key}</span><span className="text-sm font-semibold">{choice.text}</span></button>)}</div> : current.question_type === "essay" ? <div className="mt-8"><div className="mb-2 flex items-center justify-between text-xs text-black/40"><span>Write and revise your response</span><span>{(responses[current.id] || "").trim().split(/\s+/).filter(Boolean).length} words</span></div><textarea value={responses[current.id] || ""} onChange={(event) => setResponses((old) => ({ ...old, [current.id]: event.target.value }))} className="auth-input min-h-64 resize-y leading-7" placeholder="Plan, write, and revise your answer here…" /><div className="mt-3 flex items-center justify-between"><p className="text-xs text-black/40">You can ask for feedback before finishing.</p><button onClick={gradeEssay} disabled={gradingEssay || !responses[current.id]} className="rounded-xl border border-[#d94b45] px-3 py-2 text-xs font-bold text-[#a8322d] disabled:opacity-50">{gradingEssay ? "Grading…" : "Grade essay"}</button></div>{essayFeedback[current.id] && <div className="mt-5 space-y-2 rounded-2xl bg-[#fffaf0] p-4 text-sm"><p className="font-bold">AI grade: {essayFeedback[current.id].grade}/{essayFeedback[current.id].max_grade}</p><p><strong>Outline:</strong> {essayFeedback[current.id].outline.join(" · ")}</p><p><strong>Comments:</strong> {essayFeedback[current.id].comments.join(" ")}</p><p><strong>Improvements:</strong> {essayFeedback[current.id].improvements.join(" ")}</p>{essayFeedback[current.id].needs_human_review && <p className="text-xs font-semibold text-[#7a5b1b]">This feedback should be checked by a teacher because the marking policy was incomplete.</p>}</div>}</div> : <input value={responses[current.id] || ""} onChange={(event) => setResponses((old) => ({ ...old, [current.id]: event.target.value }))} className="auth-input mt-8" placeholder="Type your answer" />}</section>}<div className="mt-6 flex items-center justify-between gap-3">{index > 0 ? <button onClick={() => setIndex((value) => value - 1)} className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-bold">Previous</button> : <span />}{index < questions.length - 1 ? <button onClick={() => setIndex((value) => value + 1)} className="rounded-xl bg-[#111] px-5 py-3 text-sm font-bold text-white">Next</button> : <button onClick={submitQuiz} disabled={submitting} className="rounded-xl bg-[#d94b45] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{submitting ? "Saving…" : "Finish quiz"}</button>}</div>{error && <p className="mt-4 text-right text-sm text-[#a8322d]">{error}</p>}</div></main>;
}
