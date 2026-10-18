import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env.corpus.local"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
const { data, error } = await supabase.from("subjects").select("id,user_id,name,created_at").eq("name", "Biology").order("created_at");
if (error) throw error;
for (const subject of data || []) {
  const [{ count: sources }, { count: notes }, { count: questions }, { count: graded }, { count: tagged }, { count: unitOneNotes, error: notesFilterError }] = await Promise.all([
    supabase.from("content_sources").select("id", { count: "exact", head: true }).eq("subject_id", subject.id).contains("metadata", { biology_seed_version: "biology-seed-v1" }).or("metadata->>biology_archived.is.null,metadata->>biology_archived.eq.false"),
    supabase.from("content_sources").select("id", { count: "exact", head: true }).eq("subject_id", subject.id).contains("metadata", { biology_material: true }).or("metadata->>biology_archived.is.null,metadata->>biology_archived.eq.false"),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", subject.id).contains("metadata", { biology_seed_version: "biology-seed-v1" }).or("metadata->>biology_archived.is.null,metadata->>biology_archived.eq.false"),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", subject.id).contains("metadata", { biology_seed_version: "biology-seed-v1", answer_source: "worked" }).or("metadata->>biology_archived.is.null,metadata->>biology_archived.eq.false"),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", subject.id).contains("metadata", { biology_seed_version: "biology-seed-v1" }).or("metadata->>biology_archived.is.null,metadata->>biology_archived.eq.false").not("section_id", "is", null),
    supabase.from("content_sources").select("id", { count: "exact", head: true }).eq("subject_id", subject.id).eq("metadata->>biology_seed_version", "biology-seed-v1").eq("metadata->>biology_material", "true").or("metadata->>biology_archived.is.null,metadata->>biology_archived.eq.false").eq("metadata->>unit_key", "unit-1"),
  ]);
  console.log(JSON.stringify({ ...subject, seededSources: sources, notePages: notes, seededQuestions: questions, gradedQuestions: graded, taggedQuestions: tagged, unitOneNotes, notesFilterError }, null, 2));
}
