import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callGemini, type ImportDraft } from "@/lib/import-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

function mergeDraft(previous: ImportDraft, next: ImportDraft) {
  const sections = [...(previous.sections || [])];
  for (const section of next.sections || []) {
    const existing = sections.find((item) => item.title.toLowerCase() === section.title.toLowerCase());
    if (existing) existing.topics = [...new Set([...existing.topics, ...section.topics])];
    else sections.push(section);
  }
  return { title: previous.title || next.title, sections, questions: [...(previous.questions || []), ...(next.questions || [])] };
}

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  let { data: job } = await supabase.from("import_jobs").select("id, source_id, subject_id, exam_key, batch_id, status, total_chunks, completed_chunks, draft, retry_count").eq("id", jobId).eq("user_id", user.id).single();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (job.status === "failed" && body.retry) {
    await supabase.from("import_chunks").update({ status: "queued" }).eq("job_id", jobId).eq("status", "failed");
    await supabase.from("import_jobs").update({ status: "queued", error: null, retry_count: Number(job.retry_count || 0) + 1, updated_at: new Date().toISOString() }).eq("id", jobId).eq("user_id", user.id);
    job = { ...job, status: "queued", retry_count: Number(job.retry_count || 0) + 1 };
  }
  if (job.status === "failed") return NextResponse.json({ error: "This import failed. Use Retry to process the failed part again." }, { status: 409 });
  if (["review", "approved"].includes(job.status)) return NextResponse.json({ job });
  const { data: chunk } = await supabase.from("import_chunks").select("id, chunk_index, content, mime_type").eq("job_id", jobId).eq("status", "queued").order("chunk_index").limit(1).maybeSingle();
  if (!chunk) return NextResponse.json({ job: { ...job, status: "review" } });
  await supabase.from("import_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", jobId).eq("user_id", user.id);
  await supabase.from("import_chunks").update({ status: "processing" }).eq("id", chunk.id);
  try {
    const [{ data: source }, { data: profile }, { data: subject }, { data: contextSources }] = await Promise.all([
      supabase.from("content_sources").select("source_type, title, storage_path, mime_type, processing_mode").eq("id", job.source_id).eq("user_id", user.id).single(),
      supabase.from("profiles").select("exam_name, exam_key, exam_board, grade_level").eq("id", user.id).single(),
      supabase.from("subjects").select("name").eq("id", job.subject_id).eq("user_id", user.id).single(),
      supabase.from("content_sources").select("title, source_type, raw_text").eq("subject_id", job.subject_id).eq("user_id", user.id).neq("id", job.source_id).in("source_type", ["syllabus", "textbook"]).order("created_at", { ascending: false }).limit(6),
    ]);
    const examContext = [profile?.exam_name || job.exam_key || "the student's selected exam", profile?.exam_board, profile?.grade_level, subject?.name].filter(Boolean).join(" · ");
    const sourceType = source?.source_type || "study material";
    const referenceContext = (contextSources || []).filter((item) => item.raw_text?.trim()).map((item) => `REFERENCE ${String(item.source_type).toUpperCase()}: ${item.title}\n${item.raw_text.slice(0, 5000)}`).join("\n\n").slice(0, 12000);
    const instruction = sourceType === "syllabus"
      ? "Map only the syllabus content into curriculum sections and topics. Extract questions only if the source visibly contains questions."
      : sourceType === "past_paper"
        ? "This uploaded paper is the ONLY source of question wording. Recreate every visible question exactly as written, preserving question numbers, subparts, answer choices, marks, year, and original order. Do not invent, paraphrase, complete, or fetch question wording from the web. If any text is unreadable, preserve the readable portion, set needs_review=true, and lower confidence. Leave answers empty when no answer key is visible."
        : "Extract sections and create practice questions only when they are directly supported by the supplied textbook or notes. Do not introduce outside facts.";
    const prompt = `You are StudyPal's evidence-first exam parser. EXAM AND SUBJECT CONTEXT: ${examContext}. ${instruction}
You may use Google Search only to understand the named examination board, command words, subject conventions, and topic taxonomy. Never use search results to add or replace past-paper questions. Return only JSON matching the schema. For an essay question, use question_type=essay. Create a rubric only when a supplied marking policy, syllabus, or reliable exam-board convention supports it; otherwise use null. Keep exact question wording for past papers. Use sequence_order relative to this material part, and confidence from 0 to 1. For answer keys not present in the source, leave answer empty and set needs_review=true. A syllabus or textbook reference can improve classification and explanations, but it cannot be treated as proof that a question appeared in the paper. When the source visibly labels a group as a quiz, unit test, practice set, paper, or version, preserve that label in assessment_type and assessment_version; do not invent a label when it is not visible.
SOURCE TITLE: ${source?.title || "Uploaded material"}
SOURCE TYPE: ${sourceType}
${referenceContext ? `OPTIONAL SUPPORTING CONTEXT (not a source of past-paper questions):\n${referenceContext}\n` : ""}
${source?.processing_mode === "document" ? "Read the attached document itself, including page images, diagrams, tables, and scanned text." : `MATERIAL CHUNK:\n${chunk.content}`}`;
    let next: ImportDraft;
    if (source?.storage_path && source.processing_mode === "document") {
      const download = await supabase.storage.from("study-materials").download(source.storage_path);
      if (download.error) throw download.error;
      const data = Buffer.from(await download.data.arrayBuffer()).toString("base64");
      next = await callGemini(prompt, { mimeType: source.mime_type || chunk.mime_type || "application/octet-stream", data }, sourceType === "past_paper");
    } else next = await callGemini(prompt, undefined, sourceType === "past_paper");
    next.questions = (next.questions || []).map((question, index) => ({ ...question, sequence_order: Number.isFinite(question.sequence_order) ? question.sequence_order + Number(chunk.chunk_index) * 1000 : Number(chunk.chunk_index) * 1000 + index }));
    const previous = (job.draft || { title: "", sections: [], questions: [] }) as ImportDraft;
    const draft = mergeDraft(previous, next);
    const completed = Number(job.completed_chunks || 0) + 1;
    const status = completed >= Number(job.total_chunks || 0) ? "review" : "queued";
    await supabase.from("import_chunks").update({ status: "done" }).eq("id", chunk.id);
    await supabase.from("import_jobs").update({ status, completed_chunks: completed, draft, updated_at: new Date().toISOString(), completed_at: status === "review" ? new Date().toISOString() : null }).eq("id", jobId).eq("user_id", user.id);
    return NextResponse.json({ status, completedChunks: completed, totalChunks: job.total_chunks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process this material.";
    await supabase.from("import_chunks").update({ status: "failed" }).eq("id", chunk.id);
    await supabase.from("import_jobs").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq("id", jobId).eq("user_id", user.id);
    await supabase.from("content_sources").update({ status: "failed", metadata: { error: message }, updated_at: new Date().toISOString() }).eq("id", job.source_id).eq("user_id", user.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
