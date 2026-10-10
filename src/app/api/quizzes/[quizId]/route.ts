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
  const { data: rows } = await supabase.from("questions").select("id, question_type, prompt, choices, explanation, points, topic, sequence_order").in("id", ids);
  const byId = new Map((rows || []).map((question) => [question.id, question]));
  const questions = ids.map((id) => byId.get(id)).filter(Boolean);
  return NextResponse.json({ quiz, questions });
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
  const { data: questions } = await supabase.from("questions").select("id, answer, points").in("id", ids);
  const answers = (questions || []).map((question) => {
    const response = responses?.[question.id] ?? null;
    const isCorrect = isAnswerCorrect(question.answer, response);
    return { user_id: user.id, quiz_id: quizId, question_id: question.id, response, is_correct: isCorrect, points_earned: isCorrect ? question.points : 0 };
  });
  if (answers.length) {
    const { error: answersError } = await supabase.from("quiz_answers").upsert(answers, { onConflict: "quiz_id,question_id" });
    if (answersError) return NextResponse.json({ error: "We could not save your answers." }, { status: 500 });
  }

  const totalPoints = (questions || []).reduce((total, question) => total + Number(question.points || 1), 0);
  const earnedPoints = answers.reduce((total, answer) => total + Number(answer.points_earned), 0);
  const score = totalPoints ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  await supabase.from("quiz_sessions").update({ completed_at: new Date().toISOString(), score }).eq("id", quizId).eq("user_id", user.id);
  return NextResponse.json({ score, earnedPoints, totalPoints });
}
