"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Figure = { kind: "pdf" | "image" | "text"; url: string | null; page: number | null; required: boolean; description: string | null };
type ReviewItem = { questionId: string; correct: boolean | null; response: unknown; answer: string | null; modelAnswer: string | null; explanation: string | null };
type Question = { id: string; question_type: string; prompt: string; choices: { key: string; text: string }[]; explanation: string | null; points: number; topic: string | null; number: string | null; figure: Figure | null };
type Quiz = { id: string; title: string; quiz_type: string; duration_seconds: number; completed_at: string | null; score: number | null };

export function QuizRunner({ quizId }: { quizId: string }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; earnedPoints: number; totalPoints: number; pendingEssayCount?: number; unmarkedCount?: number; aiKeyedCount?: number; review?: ReviewItem[] } | null>(null);
  const [openFigures, setOpenFigures] = useState<Record<string, boolean>>({});
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
  if (result) return <main className="min-h-screen bg-[#f7f7f5] px-5 py-10"><div className="mx-auto w-full max-w-md rounded-3xl border border-black/10 bg-white p-8 text-center"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d94b45]">Practice complete</p><h1 className="mt-4 text-4xl font-bold">{result.pendingEssayCount || !result.totalPoints ? "Submitted" : `${result.score}%`}</h1><p className="mt-3 text-sm leading-6 text-black/50">{result.pendingEssayCount ? `${result.pendingEssayCount} essay response${result.pendingEssayCount === 1 ? " is" : "s are"} awaiting AI grading.` : result.totalPoints ? `You earned ${result.earnedPoints} of ${result.totalPoints} points. Your next refresher will use this result to choose better questions.` : "Your answers are saved."}</p>{result.unmarkedCount ? <p className="mt-2 text-xs leading-5 text-black/45">{result.unmarkedCount} question{result.unmarkedCount === 1 ? " has" : "s have"} no answer key from the original paper, so {result.unmarkedCount === 1 ? "it was" : "they were"} saved without marking.</p> : null}{result.aiKeyedCount ? <p className="mt-2 text-xs leading-5 text-black/45">{result.aiKeyedCount} answer{result.aiKeyedCount === 1 ? " was" : "s were"} marked with an AI-worked key, because ECZ does not publish answers with its papers.</p> : null}<Link href="/" className="mt-7 inline-flex rounded-xl bg-[#111] px-5 py-3 text-sm font-bold text-white">Back to dashboard</Link></div>{result.review?.length ? <AnswerReview review={result.review} questions={questions} /> : null}</main>;
  return <main className="min-h-screen bg-[#f7f7f5] px-5 py-6 text-[#111] sm:px-8"><div className="mx-auto max-w-3xl"><header className="flex items-center justify-between"><Link href="/" className="text-sm font-bold text-[#d94b45]">← Leave quiz</Link><div className={`rounded-full px-4 py-2 text-sm font-bold ${secondsLeft < 60 ? "bg-[#fff0ef] text-[#a8322d]" : "bg-white text-black/65"}`}>⏱ {formattedTime}</div></header><div className="mt-12 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-black/40">{quiz?.quiz_type.replace("_", " ")}</p><h1 className="mt-3 text-3xl font-bold tracking-tight">{quiz?.title}</h1></div><p className="text-sm font-semibold text-black/45">{index + 1} of {questions.length}</p></div><div className="mt-5 h-1.5 rounded-full bg-black/10"><div className="h-1.5 rounded-full bg-[#d94b45] transition-all" style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>{current && <section className="mt-8 rounded-3xl border border-black/10 bg-white p-6 shadow-sm sm:p-9"><div className="flex items-start justify-between gap-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d94b45]">{current.number ? `Question ${current.number}` : current.topic || "Practice question"}</p><span className="text-xs text-black/35">{current.points} pt</span></div><h2 className="mt-6 whitespace-pre-line text-2xl font-bold leading-tight">{current.prompt}</h2>{current.figure && <FigurePanel figure={current.figure} open={openFigures[current.id] ?? current.figure.required} onToggle={() => setOpenFigures((old) => ({ ...old, [current.id]: !(old[current.id] ?? current.figure?.required) }))} />}{current.question_type === "multiple_choice" ? <div className="mt-8 space-y-3">{(current.choices || []).map((choice) => <button key={choice.key} onClick={() => setResponses((old) => ({ ...old, [current.id]: choice.key }))} className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${responses[current.id] === choice.key ? "border-[#d94b45] bg-[#fff0ef]" : "border-black/10 hover:border-black/25"}`}><span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${responses[current.id] === choice.key ? "bg-[#d94b45] text-white" : "bg-[#f1f1ef] text-black/55"}`}>{choice.key}</span><span className="text-sm font-semibold">{choice.text}</span></button>)}</div> : current.question_type === "essay" ? <div className="mt-8"><div className="mb-2 flex items-center justify-between text-xs text-black/40"><span>Write and revise your response</span><span>{(responses[current.id] || "").trim().split(/\s+/).filter(Boolean).length} words</span></div><textarea value={responses[current.id] || ""} onChange={(event) => setResponses((old) => ({ ...old, [current.id]: event.target.value }))} className="auth-input min-h-64 resize-y leading-7" placeholder="Plan, write, and revise your answer here…" /><div className="mt-3 flex items-center justify-between"><p className="text-xs text-black/40">You can ask for feedback before finishing.</p><button onClick={gradeEssay} disabled={gradingEssay || !responses[current.id]} className="rounded-xl border border-[#d94b45] px-3 py-2 text-xs font-bold text-[#a8322d] disabled:opacity-50">{gradingEssay ? "Grading…" : "Grade essay"}</button></div>{essayFeedback[current.id] && <div className="mt-5 space-y-2 rounded-2xl bg-[#fffaf0] p-4 text-sm"><p className="font-bold">AI grade: {essayFeedback[current.id].grade}/{essayFeedback[current.id].max_grade}</p><p><strong>Outline:</strong> {essayFeedback[current.id].outline.join(" · ")}</p><p><strong>Comments:</strong> {essayFeedback[current.id].comments.join(" ")}</p><p><strong>Improvements:</strong> {essayFeedback[current.id].improvements.join(" ")}</p>{essayFeedback[current.id].needs_human_review && <p className="text-xs font-semibold text-[#7a5b1b]">This feedback should be checked by a teacher because the marking policy was incomplete.</p>}</div>}</div> : <input value={responses[current.id] || ""} onChange={(event) => setResponses((old) => ({ ...old, [current.id]: event.target.value }))} className="auth-input mt-8" placeholder="Type your answer" />}</section>}<div className="mt-6 flex items-center justify-between gap-3">{index > 0 ? <button onClick={() => setIndex((value) => value - 1)} className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-bold">Previous</button> : <span />}{index < questions.length - 1 ? <button onClick={() => setIndex((value) => value + 1)} className="rounded-xl bg-[#111] px-5 py-3 text-sm font-bold text-white">Next</button> : <button onClick={submitQuiz} disabled={submitting} className="rounded-xl bg-[#d94b45] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{submitting ? "Saving…" : "Finish quiz"}</button>}</div>{error && <p className="mt-4 text-right text-sm text-[#a8322d]">{error}</p>}</div></main>;
}

// Shows the question's diagram: an uploaded image, a page of the original paper, or a written description.
function FigurePanel({ figure, open, onToggle }: { figure: Figure; open: boolean; onToggle: () => void }) {
  const src = figure.kind === "pdf" ? `${figure.url}#page=${figure.page}&view=FitH` : figure.url;
  const label = figure.kind === "image" ? "Diagram" : figure.kind === "pdf" ? `${figure.required ? "Diagram or passage from the original paper" : "Original paper"} · page ${figure.page}` : "Diagram description";
  return <div className="mt-6 overflow-hidden rounded-2xl border border-black/10 bg-[#fafaf8]"><div className="flex items-center justify-between gap-3 px-4 py-3"><p className="text-xs font-semibold text-black/55">{label}</p><div className="flex shrink-0 gap-3 text-xs font-bold">{src && <a href={src} target="_blank" rel="noreferrer" className="text-black/50 hover:text-black">Open</a>}<button onClick={onToggle} className="text-[#a8322d]">{open ? "Hide" : "Show"}</button></div></div>{open && <div className="border-t border-black/10 bg-white">{figure.kind === "image" && src ? <DiagramImage src={src} alt={figure.description || "Question diagram"} /> : figure.kind === "pdf" && src ? <iframe title={`Original paper page ${figure.page}`} src={src} className="h-[28rem] w-full" /> : null}{figure.description && <p className="px-4 py-3 text-sm leading-6 text-black/60">{figure.description}</p>}</div>}</div>;
}

function DiagramImage({ src, alt }: { src: string; alt: string }) {
  // A short-lived signed storage URL, which next/image cannot optimise.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="mx-auto max-h-[28rem] w-auto object-contain p-3" />;
}

// After finishing: every question with the learner's answer, the key and the explanation.
function AnswerReview({ review, questions }: { review: ReviewItem[]; questions: Question[] }) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  return <section className="mx-auto mt-6 w-full max-w-3xl space-y-3"><h2 className="px-1 text-lg font-bold">Answers and explanations</h2>{review.map((item, index) => {
    const question = byId.get(item.questionId);
    if (!question) return null;
    const response = item.response === null || item.response === "" ? "No answer" : String(item.response);
    const tone = item.correct === true ? "border-[#2f8f5b]/30 bg-[#f1faf4]" : item.correct === false ? "border-[#d94b45]/30 bg-[#fff6f5]" : "border-black/10 bg-white";
    return <article key={item.questionId} className={`rounded-2xl border p-5 text-sm leading-6 ${tone}`}><p className="text-xs font-bold uppercase tracking-[0.14em] text-black/40">{question.number ? `Question ${question.number}` : `Question ${index + 1}`} · {item.correct === true ? "Correct" : item.correct === false ? "Incorrect" : "Not auto-marked"}</p><p className="mt-2 whitespace-pre-line font-semibold">{question.prompt}</p><p className="mt-2 text-black/60"><strong>Your answer:</strong> {response}</p>{item.answer && <p className="text-black/60"><strong>Answer:</strong> {item.answer}</p>}{item.modelAnswer && <p className="whitespace-pre-line text-black/60"><strong>Model answer:</strong> {item.modelAnswer}</p>}{item.explanation && <p className="mt-1 whitespace-pre-line text-black/50">{item.explanation}</p>}</article>;
  })}</section>;
}
