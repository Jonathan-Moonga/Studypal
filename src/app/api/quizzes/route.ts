import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { durationForQuiz, selectFullPaper, selectSectionPractice, selectTopicQuiz } from "@/lib/quiz-engine";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to start a quiz." }, { status: 401 });

  const body = await request.json();
  const quizType = body.quizType as "topic" | "section" | "full_paper";
  const subjectId = String(body.subjectId || "");
  const sectionId = body.sectionId ? String(body.sectionId) : null;
  const sourceId = body.sourceId ? String(body.sourceId) : null;

  if (!subjectId || !["topic", "section", "full_paper"].includes(quizType)) return NextResponse.json({ error: "Choose a valid subject and quiz type." }, { status: 400 });

  let questionQuery = supabase.from("questions").select("id, topic, sequence_order, source_id, section_id, question_type").eq("user_id", user.id).eq("subject_id", subjectId);
  if (quizType === "full_paper" && sourceId) questionQuery = questionQuery.eq("source_id", sourceId);
  if (quizType !== "full_paper" && sectionId) questionQuery = questionQuery.eq("section_id", sectionId);
  const { data: questions, error: questionError } = await questionQuery;
  if (questionError) return NextResponse.json({ error: "We could not load questions for this quiz." }, { status: 500 });
  if (!questions?.length) return NextResponse.json({ error: "Add a syllabus or past paper first so StudyPal has questions to use." }, { status: 400 });

  const questionIds = questions.map((question) => question.id);
  const { data: attempts } = await supabase.from("quiz_answers").select("question_id, is_correct").eq("user_id", user.id).in("question_id", questionIds);
  const selected = quizType === "topic"
    ? selectTopicQuiz(questions, attempts || [], 10)
    : quizType === "section"
      ? selectSectionPractice(questions)
      : selectFullPaper(questions, sourceId || questions[0].source_id || "");

  if (!selected.length) return NextResponse.json({ error: "There are no questions available for this quiz yet." }, { status: 400 });

  const durationSeconds = durationForQuiz(quizType, selected.length);
  const title = quizType === "topic" ? "Topic refresher" : quizType === "section" ? "Section practice" : "Full paper practice";
  const { data: quiz, error: quizError } = await supabase.from("quiz_sessions").insert({
    user_id: user.id,
    subject_id: subjectId,
    section_id: sectionId,
    source_id: sourceId,
    quiz_type: quizType,
    title,
    question_ids: selected.map((question) => question.id),
    duration_seconds: durationSeconds,
    metadata: { selection_algorithm: quizType === "topic" ? "weakness_balanced_topic_rotation" : quizType === "section" ? "curriculum_order" : "source_order" },
  }).select("id, title, quiz_type, duration_seconds").single();

  if (quizError) return NextResponse.json({ error: "We could not start this quiz." }, { status: 500 });
  return NextResponse.json({ quiz });
}
