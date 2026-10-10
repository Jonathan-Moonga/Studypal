import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractFileText, splitIntoChunks } from "@/lib/import-utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in before uploading study material." }, { status: 401 });
  const form = await request.formData();
  const subjectId = String(form.get("subjectId") || "");
  const sourceType = String(form.get("sourceType") || "") as "syllabus" | "past_paper" | "textbook";
  const examKey = String(form.get("examKey") || "") || null;
  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (!subjectId || !["syllabus", "past_paper", "textbook"].includes(sourceType) || !files.length) return NextResponse.json({ error: "Choose a material type and at least one file." }, { status: 400 });
  if (files.some((file) => file.size > 25 * 1024 * 1024)) return NextResponse.json({ error: "Each file must be 25 MB or smaller." }, { status: 413 });
  const jobs: { jobId: string; fileName: string; totalChunks: number }[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
    const storagePath = `${user.id}/${randomUUID()}-${safeName}`;
    const { buffer, text } = await extractFileText(file);
    const upload = await supabase.storage.from("study-materials").upload(storagePath, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upload.error) return NextResponse.json({ error: `We could not store ${file.name}.` }, { status: 500 });
    const chunks = splitIntoChunks(text || "Image document: inspect the uploaded page exactly. Do not invent unreadable text.");
    const { data: source, error: sourceError } = await supabase.from("content_sources").insert({ user_id: user.id, subject_id: subjectId, source_type: sourceType, title: file.name.slice(0, 180), raw_text: text || "", status: "processing", file_name: file.name, mime_type: file.type || null, storage_path: storagePath, exam_key: examKey, metadata: { input: "file", size: file.size } }).select("id").single();
    if (sourceError || !source) return NextResponse.json({ error: `We could not register ${file.name}.` }, { status: 500 });
    const { data: job, error: jobError } = await supabase.from("import_jobs").insert({ user_id: user.id, subject_id: subjectId, source_id: source.id, exam_key: examKey, total_chunks: chunks.length }).select("id").single();
    if (jobError || !job) return NextResponse.json({ error: `We could not queue ${file.name}.` }, { status: 500 });
    const { error: chunksError } = await supabase.from("import_chunks").insert(chunks.map((content, index) => ({ job_id: job.id, chunk_index: index, content, mime_type: file.type || "application/octet-stream" })));
    if (chunksError) return NextResponse.json({ error: `We could not split ${file.name} into processing chunks.` }, { status: 500 });
    jobs.push({ jobId: job.id, fileName: file.name, totalChunks: chunks.length });
  }
  return NextResponse.json({ jobs });
}
