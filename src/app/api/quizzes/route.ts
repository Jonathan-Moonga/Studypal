import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { durationForQuiz, selectAssessmentVariant, selectFullPaper, selectSectionPractice, selectTopicQuiz } from "@/lib/quiz-engine";
import { dedupeBiologyQuestions } from "@/lib/biology-dedupe";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to start a quiz." }, { status: 401 });

  const body = await request.json();
  const quizType = body.quizType as "topic" | "section" | "full_paper";
  const subjectId = String(body.subjectId || "");
  const sectionId = body.sectionId ? String(body.sectionId) : null;
  const sourceId = body.sourceId ? String(body.sourceId) : null;
  const assessmentType = body.assessmentType === "unit_test" ? "unit_test" : body.assessmentType === "quiz" ? "quiz" : quizType;
  const variant = ["A", "B", "C", "D"].includes(String(body.variant)) ? String(body.variant) : "A";

  if (!subjectId || !["topic", "section", "full_paper"].includes(quizType)) return NextResponse.json({ error: "Choose a valid subject and quiz type." }, { status: 400 });

  // A question repeated across years is stored once, so a paper's questions come from its occurrences.
  const { data: occurrences } = quizType === "full_paper" && sourceId
    ? await supabase.from("question_occurrences").select("question_id, sequence_order").eq("user_id", user.id).eq("source_id", sourceId).order("sequence_order", { ascending: true, nullsFirst: false })
    : { data: null };
  let questionQuery = supabase.from("questions").select("id, topic, sequence_order, source_id, section_id, question_type, prompt, choices, metadata, created_at").eq("user_id", user.id).eq("subject_id", subjectId);
  if (quizType === "full_paper" && sourceId) questionQuery = occurrences?.length ? questionQuery.in("id", [...new Set(occurrences.map((row) => row.question_id))]) : questionQuery.eq("source_id", sourceId);
  if (quizType !== "full_paper" && sectionId) questionQuery = questionQuery.eq("section_id", sectionId);
  const { data: questions, error: questionError } = await questionQuery;
  if (questionError) return NextResponse.json({ error: "We could not load questions for this quiz." }, { status: 500 });
  const usableQuestions = quizType === "full_paper" ? (questions || []) : dedupeBiologyQuestions(questions || []);
  if (!usableQuestions.length) return NextResponse.json({ error: "Add a syllabus or past paper first so StudyPal has questions to use." }, { status: 400 });

  const questionIds = usableQuestions.map((question) => question.id);
  const { data: attempts } = await supabase.from("quiz_answers").select("question_id, is_correct").eq("user_id", user.id).in("question_id", questionIds);
  let selected = quizType === "topic"
    ? selectTopicQuiz(usableQuestions, attempts || [], 12, variant)
    : assessmentType === "unit_test"
      ? selectAssessmentVariant(usableQuestions, variant, Math.min(30, Math.max(12, usableQuestions.length)))
      : quizType === "section"
        ? selectSectionPractice(usableQuestions)
      : selectFullPaper(usableQuestions, sourceId || usableQuestions[0].source_id || "");

  if (quizType === "full_paper" && sourceId && occurrences?.length) {
    const byId = new Map(usableQuestions.map((question) => [question.id, question]));
    selected = occurrences.map((occurrence) => byId.get(occurrence.question_id) ? { ...byId.get(occurrence.question_id)!, sequence_order: occurrence.sequence_order } : null).filter(Boolean) as typeof selected;
  }

  if (!selected.length) return NextResponse.json({ error: "There are no questions available for this quiz yet." }, { status: 400 });

  // Full papers use the time printed on the original cover when the importer recorded it.
  const { data: paper } = quizType === "full_paper" && sourceId
    ? await supabase.from("content_sources").select("title, metadata").eq("id", sourceId).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const printedMinutes = Number((paper?.metadata as { duration_minutes?: number } | null)?.duration_minutes) || 0;
  const durationSeconds = printedMinutes > 0 ? printedMinutes * 60 : durationForQuiz(assessmentType === "unit_test" ? "unit_test" : quizType, selected.length);
  const title = quizType === "topic" ? `Biology quiz ${variant}` : assessmentType === "unit_test" ? `Biology unit test ${variant}` : quizType === "section" ? "Section practice" : paper?.title || "Full paper practice";
  const { data: quiz, error: quizError } = await supabase.from("quiz_sessions").insert({
    user_id: user.id,
    subject_id: subjectId,
    section_id: sectionId,
    source_id: sourceId,
    quiz_type: quizType,
    title,
    question_ids: selected.map((question) => question.id),
    duration_seconds: durationSeconds,
    metadata: { selection_algorithm: quizType === "topic" ? "weakness_balanced_topic_rotation" : assessmentType === "unit_test" ? "assessment_variant_rotation" : quizType === "section" ? "curriculum_order" : "source_order", assessment_type: assessmentType, variant },
  }).select("id, title, quiz_type, duration_seconds").single();

  if (quizError) return NextResponse.json({ error: "We could not start this quiz." }, { status: 500 });
  return NextResponse.json({ quiz });
}
