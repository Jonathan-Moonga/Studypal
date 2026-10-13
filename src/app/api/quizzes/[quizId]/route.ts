import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isAnswerCorrect(expected: unknown, response: unknown) {
  const actual = normalize(response);
  if (!actual) return false;
  if (Array.isArray(expected)) return expected.some((answer) => normalize(answer) === actual);
  return normalize(expected) === actual;
}

export async function GET(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to view this quiz." }, { status: 401 });

  const { data: quiz, error: quizError } = await supabase.from("quiz_sessions").select("id, title, quiz_type, duration_seconds, question_ids, completed_at, score").eq("id", quizId).eq("user_id", user.id).single();
  if (quizError || !quiz) return NextResponse.json({ error: "Quiz not found." }, { status: 404 });

  const ids = Array.isArray(quiz.question_ids) ? quiz.question_ids as string[] : [];
  const { data: rows } = await supabase.from("questions").select("id, question_type, prompt, choices, explanation, points, topic, sequence_order, metadata").in("id", ids);
  // Diagrams are either an uploaded image or a page of the original paper's PDF.
  const paths = [...new Set((rows || []).map((question) => figurePath(question.metadata)).filter((value): value is string => Boolean(value)))];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await supabase.storage.from("study-materials").createSignedUrls(paths, 60 * 60 * 3);
    for (const row of urls || []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
  }
  const byId = new Map((rows || []).map(({ metadata, ...question }) => {
    const meta = (metadata || {}) as QuestionMeta;
    const path = figurePath(meta);
    const url = path ? signed.get(path) : undefined;
    const description = meta.diagram_description || null;
    const figure = url && meta.figure_image_path ? { kind: "image", url, page: null, required: true, description }
      : url ? { kind: "pdf", url, page: Number(meta.source_page) || 1, required: Boolean(meta.requires_figure), description }
        : description ? { kind: "text", url: null, page: null, required: true, description } : null;
    return [question.id, { ...question, number: meta.number || null, figure }];
  }));
  const questions = ids.map((id) => byId.get(id)).filter(Boolean);
  return NextResponse.json({ quiz, questions });
}

type QuestionMeta = { source_storage_path?: string; source_page?: number; figure_image_path?: string; requires_figure?: boolean; diagram_description?: string; number?: string; model_answer?: string; answer_source?: string };

function figurePath(metadata: unknown) {
  const meta = (metadata || {}) as QuestionMeta;
  if (meta.figure_image_path) return meta.figure_image_path;
  return meta.source_storage_path && meta.source_page ? meta.source_storage_path : null;
}

function hasAnswerKey(answer: unknown) {
  return Array.isArray(answer) ? answer.some((value) => normalize(value)) : Boolean(normalize(answer));
}

export async function POST(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to submit this quiz." }, { status: 401 });

  const body = await request.json();
  const responses = body.responses as Record<string, unknown>;
  const { data: quiz } = await supabase.from("quiz_sessions").select("id, question_ids").eq("id", quizId).eq("user_id", user.id).single();
  if (!quiz) return NextResponse.json({ error: "Quiz not found." }, { status: 404 });

  const ids = Array.isArray(quiz.question_ids) ? quiz.question_ids as string[] : [];
  const { data: questions } = await supabase.from("questions").select("id, answer, points, question_type, subject_id, choices, explanation, metadata").in("id", ids);
  const answers = (questions || []).map((question) => {
    const response = responses?.[question.id] ?? null;
    const isCorrect = isAnswerCorrect(question.answer, response);
    return { user_id: user.id, quiz_id: quizId, question_id: question.id, response, is_correct: isCorrect, points_earned: isCorrect ? question.points : 0 };
  });
  if (answers.length) {
    const { error: answersError } = await supabase.from("quiz_answers").upsert(answers, { onConflict: "quiz_id,question_id" });
    if (answersError) return NextResponse.json({ error: "We could not save your answers." }, { status: 500 });
  }

  const essayQuestions = (questions || []).filter((question) => question.question_type === "essay");
  if (essayQuestions.length) {
    await supabase.from("essay_submissions").insert(essayQuestions.filter((question) => responses?.[question.id]).map((question) => ({ user_id: user.id, subject_id: question.subject_id, question_id: question.id, quiz_id: quizId, response: String(responses[question.id]), status: "submitted" })));
  }
  // Past papers rarely print answers; questions without an answer key are not counted as wrong.
  const scoredQuestions = (questions || []).filter((question) => question.question_type !== "essay" && hasAnswerKey(question.answer));
  const scoredIds = new Set(scoredQuestions.map((question) => question.id));
  const aiKeyedCount = scoredQuestions.filter((question) => (question.metadata as { answer_source?: string } | null)?.answer_source === "ai_worked").length;
  const unmarkedCount = (questions || []).filter((question) => question.question_type !== "essay" && !scoredIds.has(question.id)).length;
  const totalPoints = scoredQuestions.reduce((total, question) => total + Number(question.points || 1), 0);
  const earnedPoints = answers.filter((answer) => scoredIds.has(answer.question_id)).reduce((total, answer) => total + Number(answer.points_earned), 0);
  const score = totalPoints ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  await supabase.from("quiz_sessions").update({ completed_at: new Date().toISOString(), score: totalPoints ? score : null }).eq("id", quizId).eq("user_id", user.id);
  // Per-question review shown after finishing: the key, the model answer and the explanation.
  const byId = new Map((questions || []).map((question) => [question.id, question]));
  const review = ids.map((id) => byId.get(id)).filter((question): question is NonNullable<typeof question> => Boolean(question)).map((question) => {
    const meta = (question.metadata || {}) as QuestionMeta;
    const choices = (question.choices || []) as { key: string; text: string }[];
    const key = Array.isArray(question.answer) ? question.answer.join(" / ") : String(question.answer || "");
    const choice = choices.find((item) => item.key === key);
    return { questionId: question.id, correct: scoredIds.has(question.id) ? answers.find((answer) => answer.question_id === question.id)?.is_correct ?? false : null,
      response: responses?.[question.id] ?? null, answer: choice ? `${choice.key}. ${choice.text}` : key || null, modelAnswer: meta.model_answer || null, explanation: question.explanation || null };
  });
  return NextResponse.json({ score, earnedPoints, totalPoints, pendingEssayCount: essayQuestions.length || undefined, unmarkedCount: unmarkedCount || undefined, aiKeyedCount: aiKeyedCount || undefined, review });
}
