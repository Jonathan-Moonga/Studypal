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
const subjectId = "b6bdcdde-58b3-439e-b68a-e5de383dd016";
const { data: sections, error: sectionError } = await supabase.from("curriculum_sections").select("id,title").eq("subject_id", subjectId);
if (sectionError) throw sectionError;
const { data: questions, error: questionError } = await supabase.from("questions").select("id,prompt,topic,metadata").eq("subject_id", subjectId).contains("metadata", { biology_seed_version: "biology-seed-v1" });
if (questionError) throw questionError;
const aliases = [
  [["microscope", "cell", "diffusion", "osmosis", "membrane", "classification"], ["cell structure", "cell organisation", "cell organization", "living organisms"]], [["enzyme"], ["enzyme"]], [["nutrient", "food test", "vitamin", "mineral"], ["nutrient"]], [["photosynthesis", "chloroplast", "leaf"], ["nutrition in plants"]], [["sapro", "fungus", "rhizopus"], ["sapro"]], [["digestion", "alimentary", "tooth", "nutrition in animals"], ["nutrition in animals"]], [["respiration", "gas exchange", "breathing", "lung"], ["respiratory"]], [["disease", "health", "hiv", "aids", "immunity"], ["health"]], [["xylem", "phloem", "transpiration", "root hair", "transport in plants"], ["transport and storage in plants"]], [["blood", "heart", "artery", "vein", "circulation", "lymph"], ["transport in man"]], [["kidney", "excretion", "urea"], ["excretion"]], [["homeostasis", "osmoregulation", "temperature"], ["homeostasis"]], [["endocrine", "hormone", "insulin"], ["endocrine"]], [["nervous", "neuron", "eye", "ear", "sense organ"], ["nervous system"]], [["skeleton", "bone", "joint", "muscle", "locomotion"], ["skeleton"]], [["tropic", "taxic", "response"], ["tropic"]], [["growth", "germination", "seed"], ["growth"]], [["asexual", "vegetative propagation"], ["asexual"]], [["flower", "pollination", "fertilisation", "fertilization", "seed dispersal"], ["sexual reproduction in flowering plants"]], [["reproduction", "menstrual", "birth control", "pregnancy", "sexually transmitted"], ["reproduction in animals"]], [["genetic", "inheritance", "mitosis", "meiosis", "mutation", "variation", "blood group"], ["genetics"]], [["classification", "dichotomous", "phyla"], ["classification"]], [["soil"], ["soil"]], [["ecology", "ecosystem", "food chain", "food web", "population", "conservation", "pollution"], ["ecology"]],
];
let updated = 0;
for (const question of questions || []) {
  const value = `${question.prompt} ${question.topic || ""}`.toLowerCase();
  const wanted = aliases.find(([terms]) => terms.some((term) => value.includes(term)))?.[1] || [];
  const section = (sections || []).find((row) => wanted.some((term) => row.title.toLowerCase().includes(term)));
  if (!section) continue;
  const update = await supabase.from("questions").update({ section_id: section.id }).eq("id", question.id).eq("subject_id", subjectId);
  if (update.error) throw update.error;
  updated += 1;
}
console.log(JSON.stringify({ examined: questions?.length || 0, updated }));
