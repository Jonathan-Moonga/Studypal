import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const input = "C:/Users/jonat/Downloads/BIOLOGY_KNOW EXAMINERS_MIND.pdf";
const subjectId = "b6bdcdde-58b3-439e-b68a-e5de383dd016";
for (const file of [".env.local", ".env.corpus.local"]) {
  try {
    for (const line of await fs.readFile(path.join(ROOT, file), "utf8").then((value) => value.split(/\r?\n/))) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: subject, error: subjectError } = await supabase.from("subjects").select("user_id").eq("id", subjectId).single();
if (subjectError) throw subjectError;
const pdf = await PDFDocument.load(await fs.readFile(input));
const hash = crypto.createHash("sha256").update(await fs.readFile(input)).digest("hex");
const paths = [];
const pageSize = 40;
for (let start = 0; start < pdf.getPageCount(); start += pageSize) {
  const end = Math.min(pdf.getPageCount(), start + pageSize);
  const part = await PDFDocument.create();
  const copied = await part.copyPages(pdf, Array.from({ length: end - start }, (_, index) => start + index));
  copied.forEach((page) => part.addPage(page));
  const bytes = await part.save({ useObjectStreams: true });
  const fileName = `${hash}_know-examiners-pages-${start + 1}-${end}.pdf`;
  const storagePath = `${subject.user_id}/biology/chunks/${fileName}`;
  const upload = await supabase.storage.from("study-materials").upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
  if (upload.error) throw upload.error;
  paths.push({ storagePath, firstPage: start + 1, lastPage: end, bytes: bytes.length });
}
const { data: source, error: sourceError } = await supabase.from("content_sources").select("id,metadata").eq("subject_id", subjectId).eq("title", "BIOLOGY_KNOW EXAMINERS_MIND.pdf").single();
if (sourceError) throw sourceError;
const { error: updateError } = await supabase.from("content_sources").update({ storage_path: paths[0]?.storagePath || null, metadata: { ...(source.metadata || {}), storage_chunks: paths, storage_error: null } }).eq("id", source.id);
if (updateError) throw updateError;
console.log(JSON.stringify({ source: source.id, chunks: paths }, null, 2));
