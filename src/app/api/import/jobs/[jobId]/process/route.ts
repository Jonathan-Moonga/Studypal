import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callGemini, type ImportDraft } from "@/lib/import-utils";

function mergeDraft(previous: ImportDraft, next: ImportDraft) {
  const sections = [...(previous.sections || [])];
  for (const section of next.sections || []) {
    const existing = sections.find((item) => item.title.toLowerCase() === section.title.toLowerCase());
    if (existing) existing.topics = [...new Set([...existing.topics, ...section.topics])];
    else sections.push(section);
  }
  return { title: previous.title || next.title, sections, questions: [...(previous.questions || []), ...(next.questions || [])] };
}

export async function POST(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const { data: job } = await supabase.from("import_jobs").select("id, source_id, subject_id, exam_key, status, total_chunks, completed_chunks, draft").eq("id", jobId).eq("user_id", user.id).single();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  if (["review", "approved"].includes(job.status)) return NextResponse.json({ job });
  const { data: chunk } = await supabase.from("import_chunks").select("id, chunk_index, content, mime_type").eq("job_id", jobId).eq("status", "queued").order("chunk_index").limit(1).maybeSingle();
  if (!chunk) return NextResponse.json({ job: { ...job, status: "review" } });
  await supabase.from("import_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", jobId).eq("user_id", user.id);
  await supabase.from("import_chunks").update({ status: "processing" }).eq("id", chunk.id);
  try {
    const [{ data: source }, { data: profile }] = await Promise.all([
      supabase.from("content_sources").select("source_type, title, storage_path, mime_type").eq("id", job.source_id).eq("user_id", user.id).single(),
      supabase.from("profiles").select("exam_name, exam_key").eq("id", user.id).single(),
    ]);
    const examContext = profile?.exam_name || job.exam_key || "the student's selected exam";
    const sourceType = source?.source_type || "study material";
    const instruction = sourceType === "syllabus"
      ? "Map only the syllabus content into curriculum sections and topics. Extract questions only if the source visibly contains questions."
      : sourceType === "past_paper"
        ? "Recreate every visible question exactly as written, preserving numbering and order. Do not invent, paraphrase, complete, or solve missing text. Mark any unclear or absent answer as needs_review=true and leave answer empty."
        : "Extract sections and create practice questions only when they are directly supported by the supplied textbook or notes. Do not introduce outside facts.";
    const prompt = `You are StudyPal's evidence-first exam parser. The student's exam context is ${examContext}. ${instruction}
Return only JSON matching the schema. For an essay question, use question_type=essay and include a rubric object with criteria only when the source or exam context supports it; never invent a marking scheme. Keep exact question wording for past papers. Use sequence_order relative to this chunk, and confidence from 0 to 1. For answer keys not present in the source, leave answer empty and set needs_review=true.
SOURCE TITLE: ${source?.title || "Uploaded material"}
SOURCE TYPE: ${sourceType}
MATERIAL CHUNK:
${chunk.content}`;
    let next: ImportDraft;
    if (source?.storage_path && chunk.mime_type && chunk.mime_type.startsWith("image/")) {
      const download = await supabase.storage.from("study-materials").download(source.storage_path);
      if (download.error) throw download.error;
      const data = Buffer.from(await download.data.arrayBuffer()).toString("base64");
      next = await callGemini(prompt, { mimeType: chunk.mime_type, data });
    } else next = await callGemini(prompt);
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
    return NextResponse.json({ error: "We could not understand this material. Check the file or try a smaller section." }, { status: 502 });
  }
}
