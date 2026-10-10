import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { splitIntoChunks } from "@/lib/import-utils";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in before importing study material." }, { status: 401 });
  const body = await request.json();
  const sourceType = body.sourceType as "syllabus" | "past_paper" | "textbook";
  const subjectId = String(body.subjectId || "");
  const rawText = String(body.text || "").trim();
  if (!subjectId || !["syllabus", "past_paper", "textbook"].includes(sourceType) || rawText.length < 30) return NextResponse.json({ error: "Choose a source type and paste at least a short piece of study material." }, { status: 400 });
  if (rawText.length > 500000) return NextResponse.json({ error: "That material is too large for one import. Split it into smaller chapters or papers." }, { status: 413 });
  const { data: source, error: sourceError } = await supabase.from("content_sources").insert({ user_id: user.id, subject_id: subjectId, source_type: sourceType, title: String(body.title || `${sourceType.replace("_", " ")} import`), raw_text: rawText, status: "processing", exam_key: body.examKey || null, metadata: { input: "paste" } }).select("id").single();
  if (sourceError || !source) return NextResponse.json({ error: "We could not start this import." }, { status: 500 });
  const chunks = splitIntoChunks(rawText);
  const { data: job, error: jobError } = await supabase.from("import_jobs").insert({ user_id: user.id, subject_id: subjectId, source_id: source.id, exam_key: body.examKey || null, total_chunks: chunks.length }).select("id").single();
  if (jobError || !job) return NextResponse.json({ error: "We could not prepare the import for processing." }, { status: 500 });
  const { error: chunksError } = await supabase.from("import_chunks").insert(chunks.map((content, index) => ({ job_id: job.id, chunk_index: index, content, mime_type: "text/plain" })));
  if (chunksError) return NextResponse.json({ error: "We could not queue the material for processing." }, { status: 500 });
  return NextResponse.json({ jobId: job.id, totalChunks: chunks.length });
}
