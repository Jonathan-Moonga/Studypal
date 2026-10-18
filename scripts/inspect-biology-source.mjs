import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env.corpus.local"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await supabase.from("content_sources")
  .select("id,title,storage_path,created_at,metadata")
  .eq("subject_id", "b6bdcdde-58b3-439e-b68a-e5de383dd016")
  .eq("title", "BIOLOGY_KNOW EXAMINERS_MIND.pdf")
  .order("created_at", { ascending: false });
if (error) throw error;
console.log(JSON.stringify(data, null, 2));
