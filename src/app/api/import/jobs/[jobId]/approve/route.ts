import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GEMINI_MODEL, normalizeDraft, questionFingerprint, type ImportDraft, type ImportQuestion } from "@/lib/import-utils";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { data: job } = await supabase.from("import_jobs").select("id, source_id, subject_id, exam_key, status, draft").eq("id", jobId).eq("user_id", user.id).single();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  if (job.status !== "review") return NextResponse.json({ error: "This import is not ready for review yet." }, { status: 409 });
  const draft = normalizeDraft((body.draft || job.draft) as ImportDraft);
  if (!draft.questions.length && !draft.sections.length) return NextResponse.json({ error: "There is nothing to save in this import." }, { status: 400 });
  const { data: existingSections } = await supabase.from("curriculum_sections").select("id, title").eq("subject_id", job.subject_id).eq("user_id", user.id);
  const existingTitles = new Set((existingSections || []).map((section) => section.title.toLowerCase()));
  const sectionRows = (draft.sections || []).filter((section) => !existingTitles.has(String(section.title).toLowerCase())).map((section, index) => ({ user_id: user.id, subject_id: job.subject_id, title: String(section.title).slice(0, 180), description: section.description || null, topics: section.topics || [], position: (existingSections?.length || 0) + index }));
  const { data: savedSections, error: sectionError } = sectionRows.length ? await supabase.from("curriculum_sections").insert(sectionRows).select("id, title") : { data: [], error: null };
  if (sectionError) return NextResponse.json({ error: "We could not save the reviewed sections." }, { status: 500 });
  const sectionIds = new Map([...(existingSections || []), ...(savedSections || [])].map((section) => [section.title.toLowerCase(), section.id]));
  const sourceLabel = String((draft.title || "Imported source")).slice(0, 180);
  let saved = 0;
  let repeated = 0;
  for (const question of (draft.questions || []) as ImportQuestion[]) {
    const fingerprint = questionFingerprint(question);
    const { data: existing } = await supabase.from("questions").select("id, appearance_count, relevance_score").eq("user_id", user.id).eq("subject_id", job.subject_id).eq("question_fingerprint", fingerprint).maybeSingle();
    const sectionId = sectionIds.get(String(question.section_title || "").toLowerCase()) || null;
    if (existing) {
      const appearanceCount = Number(existing.appearance_count || 1) + 1;
      await supabase.from("questions").update({ appearance_count: appearanceCount, relevance_score: Math.round((1 + Math.log2(appearanceCount + 1)) * 1000) / 1000, last_seen_at: new Date().toISOString() }).eq("id", existing.id).eq("user_id", user.id);
      await supabase.from("question_occurrences").insert({ user_id: user.id, question_id: existing.id, source_id: job.source_id, sequence_order: question.sequence_order, year: question.year, points: question.points, source_label: sourceLabel });
      repeated += 1;
    } else {
      const { data: created, error } = await supabase.from("questions").insert({ user_id: user.id, subject_id: job.subject_id, source_id: job.source_id, section_id: sectionId, question_type: question.question_type, prompt: question.prompt, choices: question.choices || [], answer: question.question_type === "fill_blank" && question.accepted_answers?.length ? question.accepted_answers : question.answer, explanation: question.explanation || null, points: Math.max(1, Number(question.points || 1)), year: question.year || null, topic: question.topic || null, difficulty: question.difficulty || "standard", sequence_order: question.sequence_order ?? null, question_fingerprint: fingerprint, appearance_count: 1, relevance_score: 1, rubric: question.rubric || null, metadata: { needs_review: Boolean(question.needs_review), confidence: question.confidence } }).select("id").single();
      if (error || !created) return NextResponse.json({ error: "We could not save one of the reviewed questions." }, { status: 500 });
      await supabase.from("question_occurrences").insert({ user_id: user.id, question_id: created.id, source_id: job.source_id, sequence_order: question.sequence_order, year: question.year, points: question.points, source_label: sourceLabel });
      saved += 1;
    }
  }
  await supabase.from("import_jobs").update({ status: "approved", draft, updated_at: new Date().toISOString() }).eq("id", jobId).eq("user_id", user.id);
  await supabase.from("content_sources").update({ status: "ready", metadata: { sections: sectionRows.length, questions: saved, repeated, model: GEMINI_MODEL }, updated_at: new Date().toISOString() }).eq("id", job.source_id).eq("user_id", user.id);
  return NextResponse.json({ saved, repeated, sections: sectionRows.length });
}
