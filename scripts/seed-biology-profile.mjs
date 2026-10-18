import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const INPUT_DIR = "C:/Users/jonat/Downloads";
const EXTRACTED_DIR = path.join(ROOT, "tmp/pdfs/biology-extracted");
const VERSION = "biology-seed-v1";
const DRY_RUN = process.argv.includes("--dry-run");
const UPLOAD_PDFS = !process.argv.includes("--no-pdfs");
const subjectArg = process.argv.find((value) => value.startsWith("--subject-id="))?.slice(13);

for (const file of [".env.local", ".env.corpus.local"]) {
  try {
    for (const line of await fs.readFile(path.join(ROOT, file), "utf8").then((value) => value.split(/\r?\n/))) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY_RUN && !serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for profile seeding.");
const supabase = DRY_RUN ? null : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { persistSession: false } });

const UNIT_META = {
  "unit-1": { title: "Life, Cells & Movement of Substances", terms: ["cell", "microscope", "classification", "diffusion", "osmosis", "active transport", "movement of substances"] },
  "unit-2": { title: "Enzymes, Nutrients & Animal Nutrition", terms: ["enzyme", "nutrient", "food test", "digestion", "alimentary", "absorption", "nutrition in animals"] },
  "unit-3": { title: "Plant and Fungal Nutrition", terms: ["photosynthesis", "plant nutrition", "fungal", "sapro", "leaf", "chlorophyll"] },
  "unit-4": { title: "Gas Exchange, Respiration & Health", terms: ["respiration", "gas exchange", "breathing", "lung", "health", "disease"] },
  "unit-5": { title: "Transport and Storage in Plants", terms: ["xylem", "phloem", "transpiration", "transport in plants", "storage in plants", "root hair"] },
  "unit-6": { title: "Blood, Circulation & Transport in Humans", terms: ["blood", "heart", "circulation", "artery", "vein", "lymph"] },
  "unit-7": { title: "Excretion, Homeostasis & Hormonal Control", terms: ["excretion", "kidney", "homeostasis", "osmoregulation", "endocrine", "hormone", "drug"] },
  "unit-8": { title: "Nervous Coordination and Responses", terms: ["nervous", "neuron", "sense organ", "eye", "ear", "tropic", "taxic", "response"] },
  "unit-9": { title: "Skeleton, Locomotion, Growth & Germination", terms: ["skeleton", "bone", "joint", "muscle", "growth", "germination", "locomotion"] },
  "unit-10": { title: "Reproduction", terms: ["reproduction", "flower", "pollination", "fertilisation", "menstrual", "birth control", "sexually transmitted", "asexual"] },
  "unit-11": { title: "Genetics and Classification", terms: ["genetic", "inheritance", "mitosis", "meiosis", "mutation", "variation", "classification", "biotechnology"] },
  "unit-12": { title: "Soil, Ecology and Conservation", terms: ["ecology", "ecosystem", "food chain", "food web", "soil", "population", "conservation", "pollution", "nutrient cycle"] },
};

const lessonFor = (text, unitKey) => {
  const value = text.toLowerCase();
  const candidates = {
    "unit-1": [["microscope", "Microscopy and specimen size"], ["classification", "Classification and dichotomous keys"], ["diffusion", "Movement across membranes"], ["osmosis", "Osmosis"], ["active transport", "Active transport"], ["cell", "Cell structure and organisation"]],
    "unit-2": [["food test", "Food tests"], ["enzyme", "Enzymes"], ["digestion", "Digestion and absorption"], ["alimentary", "The alimentary canal"], ["nutrient", "Classes of nutrients"]],
    "unit-3": [["photosynthesis", "Photosynthesis"], ["sapro", "Saprophytic nutrition"], ["leaf", "Leaf structure and plant nutrition"]],
    "unit-4": [["gas exchange", "Gas exchange"], ["respiration", "Respiration"], ["breathing", "Breathing and health"], ["disease", "Health and disease"]],
    "unit-5": [["xylem", "Xylem and water transport"], ["phloem", "Phloem and translocation"], ["transpiration", "Transpiration"], ["root hair", "Root hair cells"]],
    "unit-6": [["heart", "The heart and circulation"], ["blood", "Blood and blood vessels"], ["lymph", "The lymphatic system"]],
    "unit-7": [["kidney", "The kidneys and osmoregulation"], ["homeostasis", "Homeostasis"], ["endocrine", "The endocrine system"], ["hormone", "Hormonal control"], ["drug", "Drugs and their effects"], ["excretion", "Excretion"]],
    "unit-8": [["eye", "The eye and vision"], ["ear", "The ear and hearing"], ["nervous", "The nervous system"], ["tropic", "Tropic responses"], ["response", "Coordination and responses"]],
    "unit-9": [["skeleton", "The skeleton"], ["joint", "Joints and movement"], ["muscle", "Muscles and locomotion"], ["germination", "Germination"], ["growth", "Growth and development"]],
    "unit-10": [["pollination", "Pollination and fertilisation"], ["flower", "Sexual reproduction in flowering plants"], ["menstrual", "Human reproduction"], ["birth control", "Birth control"], ["sexually transmitted", "Sexually transmitted infections"], ["asexual", "Asexual reproduction"]],
    "unit-11": [["mitosis", "Mitosis and meiosis"], ["meiosis", "Mitosis and meiosis"], ["inheritance", "Inheritance"], ["mutation", "Mutation and variation"], ["classification", "Classification"], ["biotechnology", "Biotechnology and genetic engineering"]],
    "unit-12": [["food chain", "Food chains and food webs"], ["ecosystem", "Ecosystems"], ["soil", "The soil"], ["population", "Populations"], ["conservation", "Conservation"], ["pollution", "Human influences on ecosystems"], ["ecology", "Ecology"]],
  };
  return (candidates[unitKey] || []).find(([term]) => value.includes(term))?.[1] || UNIT_META[unitKey].title;
};

function classifyUnit(text) {
  const value = text.toLowerCase();
  const scores = Object.entries(UNIT_META).map(([key, unit]) => [key, unit.terms.reduce((score, term) => score + (value.includes(term) ? 1 : 0), 0)]);
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] ? scores[0][0] : "unit-1";
}

function matchSection(text, sections) {
  const value = text.toLowerCase();
  const aliases = [
    [["microscope", "cell", "diffusion", "osmosis", "membrane", "classification"], ["cell structure", "cell organisation", "cell organization", "living organisms"]],
    [["enzyme"], ["enzyme"]],
    [["nutrient", "food test", "vitamin", "mineral"], ["nutrient"]],
    [["photosynthesis", "chloroplast", "leaf"], ["nutrition in plants"]],
    [["sapro", "fungus", "rhizopus"], ["sapro"]],
    [["digestion", "alimentary", "tooth", "nutrition in animals"], ["nutrition in animals"]],
    [["respiration", "gas exchange", "breathing", "lung"], ["respiratory"]],
    [["disease", "health", "hiv", "aids", "immunity"], ["health"]],
    [["xylem", "phloem", "transpiration", "root hair", "transport in plants"], ["transport and storage in plants"]],
    [["blood", "heart", "artery", "vein", "circulation", "lymph"], ["transport in man"]],
    [["kidney", "excretion", "urea"], ["excretion"]],
    [["homeostasis", "osmoregulation", "temperature"], ["homeostasis"]],
    [["endocrine", "hormone", "insulin"], ["endocrine"]],
    [["nervous", "neuron", "eye", "ear", "sense organ"], ["nervous system"]],
    [["skeleton", "bone", "joint", "muscle", "locomotion"], ["skeleton"]],
    [["tropic", "taxic", "response"], ["tropic"]],
    [["growth", "germination", "seed"], ["growth"]],
    [["asexual", "vegetative propagation"], ["asexual"]],
    [["flower", "pollination", "fertilisation", "fertilization", "seed dispersal"], ["sexual reproduction in flowering plants"]],
    [["reproduction", "menstrual", "birth control", "pregnancy", "sexually transmitted"], ["reproduction in animals"]],
    [["genetic", "inheritance", "mitosis", "meiosis", "mutation", "variation", "blood group"], ["genetics"]],
    [["classification", "dichotomous", "phyla"], ["classification"]],
    [["soil"], ["soil"]],
    [["ecology", "ecosystem", "food chain", "food web", "population", "conservation", "pollution"], ["ecology"]],
  ];
  const wanted = aliases.find(([terms]) => terms.some((term) => value.includes(term)))?.[1] || [];
  return (sections || []).find((section) => wanted.some((term) => section.title.toLowerCase().includes(term))) || null;
}

function cleanQuestionText(value) {
  return String(value).replace(/^A\+\s+DISTINTICTION\s+IN\s+BIOLOGY\s*\[\d+\]\s*/i, "").replace(/^\[\d+\s*\]\s*A\+\s+DISTINTICTION\s+IN\s+BIOLOGY\s*/i, "").trim();
}

function parseAPlusQuestions(source) {
  const full = source.pages.map((page) => page.text).join("\n");
  const starts = [...full.matchAll(/(?:^|\n)(\d{1,3})\s+(?=[A-Z])/g)].map((match) => ({ number: Number(match[1]), index: (match.index || 0) + (match[0].startsWith("\n") ? 1 : 0) }));
  const questions = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const rawBlock = full.slice(start.index, starts[i + 1]?.index || full.length);
    const answerMatch = rawBlock.match(/(?:Correct\s+Answer\s+is|Correct\s+answer\s+(?:is|id)|The\s+correct\s+answer\s+is)\s*([A-D])\b/i);
    if (!answerMatch) continue;
    const beforeAnswer = rawBlock.slice(0, answerMatch.index);
    const optionMatches = [...beforeAnswer.matchAll(/(?:^|\n)([A-D])\s+(.+)$/gm)];
    const choices = [];
    for (const option of optionMatches) {
      const key = option[1];
      const startIndex = (option.index || 0) + (option[0].startsWith("\n") ? 1 : 0) + 2;
      const endIndex = optionMatches[optionMatches.indexOf(option) + 1]?.index || beforeAnswer.length;
      const text = beforeAnswer.slice(startIndex, endIndex).replace(/^\s+/, "").trim().replace(/\s+/g, " ");
      if (text) choices.push({ key, text });
    }
    const promptEnd = optionMatches.length ? optionMatches[0].index : beforeAnswer.length;
    let prompt = cleanQuestionText(beforeAnswer.slice(0, promptEnd));
    prompt = prompt.replace(/^\d{1,3}\s+/, "").replace(/\s+/g, " ").trim();
    const explanationIndex = rawBlock.search(/(?:Associated\s+Facts\s+and\s+Reasoning|Associated\s+facts\s+and\s+Reasoning|Reasoning\.?|Associated\s+Facts\s+and\s+Reasoning\.?)/i);
    const explanation = explanationIndex >= 0 ? rawBlock.slice(explanationIndex).replace(/^(?:Associated\s+Facts\s+and\s+Reasoning|Associated\s+facts\s+and\s+Reasoning|Reasoning\.?|Associated\s+Facts\s+and\s+Reasoning\.?)\s*/i, "").replace(/\s+/g, " ").trim() : "";
    const page = source.pages.find((item) => {
      const offset = full.indexOf(item.text);
      return offset >= 0 && offset <= start.index && start.index < offset + item.text.length + 1;
    })?.page || null;
    const unitKey = classifyUnit(`${prompt} ${explanation}`);
    questions.push({
      number: String(start.number), order: questions.length + 1, prompt, choices,
      answer: choices.some((choice) => choice.key === answerMatch[1].toUpperCase()) ? answerMatch[1].toUpperCase() : "",
      explanation, marks: 1, topic: lessonFor(`${prompt} ${explanation}`, unitKey), unitKey, source_page: page,
      answer_source: choices.length >= 2 ? "worked" : "unverified", requires_figure: choices.length < 2,
      original_answer: answerMatch[1].toUpperCase(), raw: rawBlock,
    });
  }
  return questions;
}

function canonicalName(name) {
  if (/A\+DISTINCTION BIOLOGY\.pdf$/i.test(name)) return null;
  if (/Cambridge IGCSE Biology - Mackean, D\. G \[SRG\]\.pdf$/i.test(name)) return null;
  if (/Biology Exam questions & answers(?:-1)?\.pdf$/i.test(name)) return null;
  if (/pure biology\.pdf$/i.test(name)) return null;
  return name;
}

async function readSources() {
  const index = JSON.parse(await fs.readFile(path.join(EXTRACTED_DIR, "index.json"), "utf8"));
  const result = [];
  const hashes = new Set();
  for (const item of index) {
    const name = canonicalName(item.name);
    if (!name) continue;
    const sourcePath = path.join(INPUT_DIR, item.name);
    const buffer = await fs.readFile(sourcePath);
    const sha = crypto.createHash("sha256").update(buffer).digest("hex");
    if (hashes.has(sha)) continue;
    hashes.add(sha);
    const safe = item.name.replace(/[^a-z0-9._-]+/gi, "_").replace(/_+/g, "_");
    const extracted = JSON.parse(await fs.readFile(path.join(EXTRACTED_DIR, `${safe}.json`), "utf8"));
    let ocr = null;
    try {
      ocr = JSON.parse(await fs.readFile(path.join(ROOT, "tmp/pdfs/biology-ocr", `${safe}.json`), "utf8"));
    } catch {}
    const pages = ocr?.pages?.length ? ocr.pages : (extracted.pages || []);
    result.push({ ...item, path: sourcePath, ...extracted, pages, text: pages.map((page) => page.text || "").join("\n"), extraction: ocr?.extraction || null, ocr_engine: ocr?.ocr_engine || null, sha, buffer });
  }
  return result;
}

function fingerprint(question, sourceId) {
  const value = [question.prompt, ...question.choices.map((choice) => choice.text)].join("|").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return crypto.createHash("sha256").update(`${value}|${sourceId}|${question.source_page || question.order}`).digest("hex");
}

async function insertBatches(table, rows, size = 100) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + size));
    if (error) throw error;
  }
}

async function main() {
  const sources = await readSources();
  const aplus = sources.find((source) => /A\+DISTINCTION BIOLOGY \(1\)/i.test(source.name));
  const aplusQuestions = aplus ? parseAPlusQuestions(aplus) : [];
  const notePages = sources.reduce((total, source) => total + source.pages.filter((page) => page.text.trim()).length, 0);
  console.log(JSON.stringify({ dryRun: DRY_RUN, sources: sources.map((source) => ({ name: source.name, pages: source.pages.length, characters: source.text?.length || 0, sha: source.sha.slice(0, 12) })), notePages, aplusQuestions: aplusQuestions.length, gradedAplusQuestions: aplusQuestions.filter((question) => question.choices.length >= 2).length }, null, 2));
  if (DRY_RUN) return;

  let subject;
  if (subjectArg) {
    const { data, error } = await supabase.from("subjects").select("id,user_id,name").eq("id", subjectArg).single();
    if (error) throw error;
    subject = data;
  } else {
    const { data, error } = await supabase.from("subjects").select("id,user_id,name").eq("name", "Biology").order("created_at").limit(1).single();
    if (error) throw error;
    subject = data;
  }
  const { data: sections, error: sectionsError } = await supabase.from("curriculum_sections").select("id,title,topics").eq("subject_id", subject.id).eq("user_id", subject.user_id);
  if (sectionsError) throw sectionsError;
  const oldRows = [];
  for (let start = 0; ; start += 1000) {
    const old = await supabase.from("content_sources").select("id").eq("user_id", subject.user_id).eq("subject_id", subject.id).contains("metadata", { biology_seed_version: VERSION }).range(start, start + 999);
    if (old.error) throw old.error;
    oldRows.push(...(old.data || []));
    if (!old.data || old.data.length < 1000) break;
  }
  const oldIds = oldRows.map((row) => row.id);
  if (oldIds.length) {
    const oldIdSet = new Set(oldIds);
    const oldQuestions = await supabase.from("questions").select("id,source_id").eq("user_id", subject.user_id).eq("subject_id", subject.id);
    if (oldQuestions.error) throw oldQuestions.error;
    const oldQuestionIds = (oldQuestions.data || []).filter((row) => oldIdSet.has(row.source_id)).map((row) => row.id);
    for (let index = 0; index < oldQuestionIds.length; index += 100) {
      const batch = oldQuestionIds.slice(index, index + 100);
      const occurrenceDelete = await supabase.from("question_occurrences").delete().in("question_id", batch);
      if (occurrenceDelete.error) throw occurrenceDelete.error;
      const questionDelete = await supabase.from("questions").delete().in("id", batch);
      if (questionDelete.error) throw questionDelete.error;
    }
    for (let index = 0; index < oldIds.length; index += 100) {
      const sourceDelete = await supabase.from("content_sources").delete().in("id", oldIds.slice(index, index + 100));
      if (sourceDelete.error) throw sourceDelete.error;
    }
  }

  const sourceRows = [];
  const idByHash = new Map();
  for (const source of sources) {
    const storagePath = `${subject.user_id}/biology/${source.sha}_${source.name.replace(/[^a-z0-9._-]+/gi, "_")}`;
    let storedPath = null;
    let storageError = null;
    if (UPLOAD_PDFS) {
      const upload = await supabase.storage.from("study-materials").upload(storagePath, source.buffer, { contentType: "application/pdf", upsert: true });
      if (upload.error) {
        storageError = upload.error.message || "The source PDF could not be stored.";
        console.warn(`Skipping PDF storage for ${source.name}: ${storageError}`);
      } else storedPath = storagePath;
    }
    const fullText = source.pages.map((page) => page.text).join("\n\n");
    sourceRows.push({ user_id: subject.user_id, subject_id: subject.id, source_type: /G12 Biology/i.test(source.name) || /Exam questions/i.test(source.name) ? "past_paper" : "textbook", title: source.name.slice(0, 180), raw_text: fullText, status: "ready", file_name: source.name, mime_type: "application/pdf", storage_path: storedPath, metadata: { biology_seed_version: VERSION, biology_source: true, sha256: source.sha, page_count: source.pages.length, extracted_page_count: source.pages.filter((page) => page.text.trim()).length, extraction: source.extraction || (source.pages.some((page) => page.text.trim()) ? "pdf_text" : "source_pdf_only"), ocr_engine: source.ocr_engine, storage_error: storageError } });
  }
  const { data: createdSources, error: sourceError } = await supabase.from("content_sources").insert(sourceRows).select("id,title,storage_path,metadata");
  if (sourceError) throw sourceError;
  for (let i = 0; i < sources.length; i += 1) idByHash.set(sources[i].sha, createdSources[i].id);

  const noteRows = [];
  for (const source of sources) {
    const sourceId = idByHash.get(source.sha);
    for (const page of source.pages) {
      if (!page.text.trim()) continue;
      const unitKey = classifyUnit(page.text);
      const lessonTitle = lessonFor(page.text, unitKey);
      noteRows.push({ user_id: subject.user_id, subject_id: subject.id, source_type: "textbook", title: `${UNIT_META[unitKey].title} - ${lessonTitle} - ${source.name} p. ${page.page}`.slice(0, 180), raw_text: page.text, status: "ready", file_name: source.name, mime_type: "text/plain", storage_path: createdSources.find((item) => item.id === sourceId)?.storage_path || null, metadata: { biology_seed_version: VERSION, biology_material: true, derived_note: true, unit_key: unitKey, unit_title: UNIT_META[unitKey].title, lesson_title: lessonTitle, source_id: sourceId, source_name: source.name, source_page: page.page, extraction: source.extraction || "pdf_text", ocr_derived: source.extraction === "local_ocr", ocr_engine: source.ocr_engine || null, verbatim: true } });
    }
  }
  await insertBatches("content_sources", noteRows, 100);

  const questionRows = [];
  const occurrenceRows = [];
  if (aplus) {
    const sourceId = idByHash.get(aplus.sha);
    for (const question of aplusQuestions) {
      const section = matchSection(`${question.prompt} ${question.topic}`, sections);
      const questionType = question.choices.length >= 2 ? "multiple_choice" : "free_response";
      const questionId = crypto.randomUUID();
      questionRows.push({ id: questionId, user_id: subject.user_id, subject_id: subject.id, section_id: section?.id || null, source_id: sourceId, question_type: questionType, prompt: question.prompt, choices: question.choices, answer: questionType === "multiple_choice" ? question.answer : "", explanation: question.explanation || null, points: 1, topic: question.topic, difficulty: "standard", sequence_order: question.order, question_fingerprint: fingerprint(question, sourceId), appearance_count: 1, relevance_score: 1, last_seen_at: new Date().toISOString(), metadata: { biology_seed_version: VERSION, assessment_type: "practice_set", assessment_version: "A+ Distinction", source_page: question.source_page, number: question.number, answer_source: question.answer_source, original_answer: question.original_answer, requires_figure: question.requires_figure, model_answer: question.explanation || null } });
      occurrenceRows.push({ user_id: subject.user_id, question_id: questionId, source_id: sourceId, sequence_order: question.order, points: 1, source_label: aplus.name });
    }
  }
  await insertBatches("questions", questionRows, 100);
  await insertBatches("question_occurrences", occurrenceRows, 100);
  await supabase.from("content_sources").update({ metadata: { ...createdSources.find((item) => item.id === idByHash.get(aplus?.sha))?.metadata, question_count: aplusQuestions.length, graded_question_count: aplusQuestions.filter((question) => question.choices.length >= 2).length } }).eq("id", idByHash.get(aplus?.sha));
  console.log(JSON.stringify({ subject: subject.name, subjectId: subject.id, sources: createdSources.length, notes: noteRows.length, questions: questionRows.length, occurrences: occurrenceRows.length }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
