import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractFileText, isSupportedUpload, shouldProcessAsDocument, splitIntoChunks } from "@/lib/import-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

type SourceType = "syllabus" | "past_paper" | "textbook";
type UploadedItem = { storagePath: string; fileName: string; mimeType: string; size: number; sourceType: SourceType; title?: string };

const SOURCE_TYPES = ["syllabus", "past_paper", "textbook"];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in before uploading study material." }, { status: 401 });
  const batchId = randomUUID();
  let subjectId = "";
  let examKey: string | null = null;
  const items: UploadedItem[] = [];
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    subjectId = String(body.subjectId || "");
    examKey = body.examKey ? String(body.examKey) : null;
    for (const value of Array.isArray(body.items) ? body.items : []) items.push({
      storagePath: String(value.storagePath || ""), fileName: String(value.fileName || ""),
      mimeType: String(value.mimeType || "application/octet-stream"), size: Number(value.size || 0),
      sourceType: String(value.sourceType || "") as SourceType, title: value.title ? String(value.title) : undefined,
    });
  } else {
    // Small-file fallback. The current UI uploads directly to Supabase to avoid hosting request limits.
    const form = await request.formData();
    subjectId = String(form.get("subjectId") || "");
    examKey = String(form.get("examKey") || "") || null;
    const sourceType = String(form.get("sourceType") || "") as SourceType;
    for (const entry of form.getAll("files")) {
      if (!(entry instanceof File)) continue;
      const safeName = entry.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
      const storagePath = `${user.id}/${randomUUID()}-${safeName}`;
      const buffer = Buffer.from(await entry.arrayBuffer());
      const upload = await supabase.storage.from("study-materials").upload(storagePath, buffer, { contentType: entry.type || "application/octet-stream" });
      if (upload.error) return NextResponse.json({ error: `We could not store ${entry.name}. ${upload.error.message}` }, { status: 500 });
      items.push({ storagePath, fileName: entry.name, mimeType: entry.type || "application/octet-stream", size: entry.size, sourceType });
    }
  }

  if (!subjectId || !items.length) return NextResponse.json({ error: "Choose at least one study file." }, { status: 400 });
  const { data: ownedSubject } = await supabase.from("subjects").select("id").eq("id", subjectId).eq("user_id", user.id).maybeSingle();
  if (!ownedSubject) return NextResponse.json({ error: "That subject could not be found." }, { status: 404 });

  const jobs: { jobId: string; fileName: string; sourceType: SourceType; totalChunks: number }[] = [];
  for (const item of items) {
    if (!SOURCE_TYPES.includes(item.sourceType)) return NextResponse.json({ error: `Choose a material type for ${item.fileName}.` }, { status: 400 });
    if (!item.storagePath.startsWith(`${user.id}/`)) return NextResponse.json({ error: "An uploaded file did not belong to this account." }, { status: 403 });
    if (!item.fileName || !isSupportedUpload(item.fileName, item.mimeType)) return NextResponse.json({ error: `${item.fileName || "One file"} is not a supported document or image.` }, { status: 415 });
    if (!Number.isFinite(item.size) || item.size <= 0 || item.size > MAX_FILE_SIZE) return NextResponse.json({ error: `${item.fileName} must be 50 MB or smaller.` }, { status: 413 });

    const download = await supabase.storage.from("study-materials").download(item.storagePath);
    if (download.error) return NextResponse.json({ error: `We uploaded ${item.fileName}, but could not read it back. Please retry.` }, { status: 500 });
    const file = new File([await download.data.arrayBuffer()], item.fileName, { type: item.mimeType });
    let text = "";
    try { text = (await extractFileText(file)).text; } catch { text = ""; }
    const processingMode = shouldProcessAsDocument(item.fileName, item.mimeType, text) ? "document" : "text";
    const chunks = processingMode === "document" ? [""] : splitIntoChunks(text);
    const { data: source, error: sourceError } = await supabase.from("content_sources").insert({
      user_id: user.id, subject_id: subjectId, source_type: item.sourceType, title: String(item.title || item.fileName).slice(0, 180),
      raw_text: text || "", status: "processing", file_name: item.fileName, mime_type: item.mimeType,
      storage_path: item.storagePath, exam_key: examKey, batch_id: batchId, processing_mode: processingMode,
      metadata: { input: "file", size: item.size, batch_id: batchId },
    }).select("id").single();
    if (sourceError || !source) return NextResponse.json({ error: `We could not register ${item.fileName}. ${sourceError?.message || ""}`.trim() }, { status: 500 });
    const { data: job, error: jobError } = await supabase.from("import_jobs").insert({ user_id: user.id, subject_id: subjectId, source_id: source.id, exam_key: examKey, batch_id: batchId, total_chunks: chunks.length }).select("id").single();
    if (jobError || !job) return NextResponse.json({ error: `We could not queue ${item.fileName}. ${jobError?.message || ""}`.trim() }, { status: 500 });
    const { error: chunksError } = await supabase.from("import_chunks").insert(chunks.map((content, index) => ({ job_id: job.id, chunk_index: index, content, mime_type: item.mimeType })));
    if (chunksError) return NextResponse.json({ error: `We could not prepare ${item.fileName} for processing.` }, { status: 500 });
    jobs.push({ jobId: job.id, fileName: item.fileName, sourceType: item.sourceType, totalChunks: chunks.length });
  }
  return NextResponse.json({ jobs, batchId });
}
