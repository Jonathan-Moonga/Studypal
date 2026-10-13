import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { questionFingerprint } from "@/lib/import-utils";
import { matchSectionId, parseQuestionCsv, type ParsedQuestion, type RowError } from "@/lib/question-csv";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ROWS = 600;

type Paper = { id: string; title: string; storage_path: string | null; year: number | null };

// Imports ready-made questions from a CSV. Diagram images are uploaded by the browser
// to the user's storage folder first; `figures` maps each CSV file name to its storage path.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in before importing questions." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const subjectId = String(body.subjectId || "");
  const csv = String(body.csv || "");
  const figures = (body.figures && typeof body.figures === "object" ? body.figures : {}) as Record<string, string>;
  const defaultSourceId = body.defaultSourceId ? String(body.defaultSourceId) : null;
  if (!subjectId || !csv.trim()) return NextResponse.json({ error: "Choose a subject and a CSV file." }, { status: 400 });
  for (const path of Object.values(figures)) {
    if (!String(path).startsWith(`${user.id}/`)) return NextResponse.json({ error: "A diagram file did not belong to this account." }, { status: 403 });
  }
  const { data: subject } = await supabase.from("subjects").select("id").eq("id", subjectId).eq("user_id", user.id).maybeSingle();
  if (!subject) return NextResponse.json({ error: "That subject could not be found." }, { status: 404 });

  const { questions, errors } = parseQuestionCsv(csv);
  if (questions.length > MAX_ROWS) return NextResponse.json({ error: `Import at most ${MAX_ROWS} questions at a time.` }, { status: 413 });
  if (!questions.length) return NextResponse.json({ error: errors[0]?.message || "No questions were found in the file.", rowErrors: errors }, { status: 400 });

  const [{ data: sections }, { data: sources }] = await Promise.all([
    supabase.from("curriculum_sections").select("id, title, topics").eq("subject_id", subjectId).eq("user_id", user.id),
    supabase.from("content_sources").select("id, title, storage_path, metadata").eq("subject_id", subjectId).eq("user_id", user.id).eq("source_type", "past_paper"),
  ]);
  const papers = new Map<string, Paper>();
  for (const source of sources || []) {
    papers.set(source.title.toLowerCase(), { id: source.id, title: source.title, storage_path: source.storage_path, year: Number((source.metadata as { year?: number } | null)?.year) || null });
  }
  const defaultPaper = defaultSourceId ? [...papers.values()].find((paper) => paper.id === defaultSourceId) || null : null;

  // Rows without a paper go to the chosen paper, or to one shared "Imported questions" paper.
  async function paperFor(question: ParsedQuestion): Promise<Paper> {
    if (!question.paper && defaultPaper) return defaultPaper;
    const title = (question.paper || "Imported questions").slice(0, 180);
    const existing = papers.get(title.toLowerCase());
    if (existing) return existing;
    const { data, error } = await supabase.from("content_sources").insert({
      user_id: user!.id, subject_id: subjectId, source_type: "past_paper", title, raw_text: "", status: "ready",
      metadata: { imported_via: "question_csv", year: question.year },
    }).select("id, title, storage_path").single();
    if (error || !data) throw new Error(`Could not create the paper "${title}".`);
    const paper = { ...data, year: question.year };
    papers.set(title.toLowerCase(), paper);
    return paper;
  }

  const rowErrors: RowError[] = [...errors];
  let saved = 0; let repeated = 0; let tagged = 0; let withDiagrams = 0;
  const touchedPapers = new Set<string>();
  for (const question of questions) {
    try {
      const paper = await paperFor(question);
      let figure: Record<string, unknown> = {};
      if (question.diagram?.kind === "image") {
        const path = figures[question.diagram.file] || figures[question.diagram.file.toLowerCase()];
        if (!path) { rowErrors.push({ row: question.row, message: `Diagram "${question.diagram.file}" was not uploaded with the CSV.` }); continue; }
        figure = { figure_image_path: path };
      } else if (question.diagram?.kind === "page") {
        if (!paper.storage_path) { rowErrors.push({ row: question.row, message: `"page:${question.diagram.page}" needs the paper "${paper.title}" to have its PDF in StudyPal.` }); continue; }
        figure = { source_storage_path: paper.storage_path, source_page: question.diagram.page };
      }
      const questionType = question.type === "multiple_choice" ? "multiple_choice" : question.type === "short_answer" ? "fill_blank" : question.type === "essay" ? "essay" : "free_response";
      // Structured and essay answers are model answers shown after the quiz, not auto-marked.
      const answer = questionType === "multiple_choice" ? question.answer : questionType === "fill_blank" ? question.acceptedAnswers : "";
      const sectionId = matchSectionId(question, sections || []);
      const year = question.year ?? paper.year;
      const fingerprint = questionFingerprint({ prompt: question.prompt, question_type: questionType, choices: question.choices });
      const { data: existing } = await supabase.from("questions").select("id, appearance_count").eq("user_id", user.id).eq("subject_id", subjectId).eq("question_fingerprint", fingerprint).maybeSingle();
      let questionId: string;
      if (existing) {
        const count = Number(existing.appearance_count || 1) + 1;
        await supabase.from("questions").update({ appearance_count: count, relevance_score: Math.round((1 + Math.log2(count + 1)) * 1000) / 1000, last_seen_at: new Date().toISOString() }).eq("id", existing.id).eq("user_id", user.id);
        questionId = existing.id; repeated += 1;
      } else {
        const { data: created, error } = await supabase.from("questions").insert({
          user_id: user.id, subject_id: subjectId, source_id: paper.id, section_id: sectionId, question_type: questionType,
          prompt: question.prompt, choices: question.choices, answer, explanation: question.explanation || null, points: question.marks,
          year, topic: question.topic || null, difficulty: question.difficulty, sequence_order: question.order, question_fingerprint: fingerprint,
          appearance_count: 1, relevance_score: 1,
          metadata: { imported_via: "question_csv", number: question.number || null, model_answer: questionType === "multiple_choice" ? null : question.answer || null,
            answer_source: question.answer ? "csv" : "none", requires_figure: Boolean(question.diagram), diagram_description: question.diagramDescription || null, ...figure },
        }).select("id").single();
        if (error || !created) { rowErrors.push({ row: question.row, message: `Could not save this question. ${error?.message || ""}`.trim() }); continue; }
        questionId = created.id; saved += 1;
        if (sectionId) tagged += 1;
        if (question.diagram) withDiagrams += 1;
      }
      await supabase.from("question_occurrences").upsert({ user_id: user.id, question_id: questionId, source_id: paper.id, sequence_order: question.order, year, points: question.marks, source_label: paper.title },
        { onConflict: "question_id,source_id,sequence_order", ignoreDuplicates: true });
      touchedPapers.add(paper.title);
    } catch (reason) {
      rowErrors.push({ row: question.row, message: reason instanceof Error ? reason.message : "Could not save this question." });
    }
  }

  return NextResponse.json({ saved, repeated, tagged, withDiagrams, papers: [...touchedPapers], rowErrors: rowErrors.sort((a, b) => a.row - b.row) });
}
