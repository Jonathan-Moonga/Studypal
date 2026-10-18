import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SUBJECT_ID = "b6bdcdde-58b3-439e-b68a-e5de383dd016";
const APPLY = process.argv.includes("--apply");
const ARCHIVE = process.argv.includes("--archive");

for (const file of [".env.local", ".env.corpus.local"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sources = [];
for (let start = 0; ; start += 1000) {
  const { data: page, error: sourceError } = await supabase.from("content_sources")
    .select("id,title,created_at,metadata")
    .eq("subject_id", SUBJECT_ID)
    .order("created_at", { ascending: true })
    .range(start, start + 999);
  if (sourceError) {
    console.error(JSON.stringify(sourceError, null, 2));
    throw sourceError;
  }
  sources.push(...(page || []));
  if (!page || page.length < 1000) break;
}
const seededSources = (sources || []).filter((row) => row.metadata?.biology_seed_version === "biology-seed-v1");
const originals = seededSources.filter((row) => row.metadata?.biology_source === true);
const latestOriginalByHash = new Map();
for (const row of originals) {
  const hash = row.metadata?.sha256 || row.id;
  const previous = latestOriginalByHash.get(hash);
  if (!previous || new Date(row.created_at) > new Date(previous.created_at)) latestOriginalByHash.set(hash, row);
}
const currentOriginalIds = new Set([...latestOriginalByHash.values()].map((row) => row.id));
const oldSources = seededSources.filter((row) => row.metadata?.biology_source === true
  ? !currentOriginalIds.has(row.id)
  : row.metadata?.biology_material === true && !currentOriginalIds.has(row.metadata?.source_id));

const sourceIds = oldSources.map((row) => row.id);
const { data: allQuestions, error: questionError } = sourceIds.length
  ? await supabase.from("questions").select("id,source_id,created_at,metadata").eq("subject_id", SUBJECT_ID)
  : { data: [], error: null };
if (questionError) throw questionError;
const sourceSet = new Set(sourceIds);
const questions = (allQuestions || []).filter((row) => sourceSet.has(row.source_id) && row.metadata?.biology_seed_version === "biology-seed-v1");

const summary = { apply: APPLY, archive: ARCHIVE, seededSources: seededSources.length, originalSources: currentOriginalIds.size, duplicateSourceRows: sourceIds.length, questionRows: questions?.length || 0, occurrenceRows: questions?.length || 0 };
console.log(JSON.stringify(summary, null, 2));
if ((!APPLY && !ARCHIVE) || !sourceIds.length) process.exit(0);

const batch = async (table, column, ids) => {
  for (let index = 0; index < ids.length; index += 100) {
    const { error } = await supabase.from(table).delete().in(column, ids.slice(index, index + 100));
    if (error) throw error;
  }
};

if (ARCHIVE) {
  const archivedAt = new Date().toISOString();
  for (let index = 0; index < oldSources.length; index += 25) {
    await Promise.all(oldSources.slice(index, index + 25).map(async (row) => {
      const { error } = await supabase.from("content_sources").update({ metadata: { ...(row.metadata || {}), biology_archived: true, archived_at: archivedAt, archive_reason: "superseded Biology seed generation" } }).eq("id", row.id);
      if (error) throw error;
    }));
  }
  for (let index = 0; index < questions.length; index += 25) {
    await Promise.all(questions.slice(index, index + 25).map(async (row) => {
      const { error } = await supabase.from("questions").update({ metadata: { ...(row.metadata || {}), biology_archived: true, archived_at: archivedAt, archive_reason: "superseded Biology seed generation" } }).eq("id", row.id);
      if (error) throw error;
    }));
  }
  console.log(JSON.stringify({ ...summary, archived: true }, null, 2));
  process.exit(0);
}

const questionIds = (questions || []).map((row) => row.id);
await batch("question_occurrences", "question_id", questionIds);
await batch("questions", "id", questionIds);
await batch("content_sources", "id", sourceIds);
console.log(JSON.stringify({ ...summary, deleted: true }, null, 2));
