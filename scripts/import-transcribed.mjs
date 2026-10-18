// Loads a hand-transcribed past paper (JSON) into the student account that owns the paper.
//
//   node scripts/import-transcribed.mjs <paper.json> [--figures=<dir>]
//
// paper.json: { "source_id": "<content_sources.id>", "questions": [ {
//   number, order, type: multiple_choice|short_answer|structured|essay, prompt,
//   choices: [{ key, text }], answer, accepted: [..], model_answer, explanation,
//   marks, topic, section, paper_part, difficulty, figure (image file in --figures),
//   figure_page (page of the paper PDF), figure_description,
//   answer_source: marking_scheme|worked|unverified } ] }   (unverified = no key; saved unmarked)
// Re-running a paper replaces only that paper's transcribed questions.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

async function loadEnv() {
  for (const file of [".env.local", ".env.corpus.local"]) {
    const text = await fs.readFile(path.join(ROOT, file), "utf8").catch(() => "");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

function arg(name) { return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3); }

// Same canonical form as the app's questionFingerprint; figure questions with generic
// wording are also keyed by their place in the paper so they are never merged.
function fingerprint(question, sourceId) {
  const canonical = (value) => String(value || "").normalize("NFKC").toLowerCase()
    .replace(/^\s*(?:question\s*)?\d+[a-z]?(?:\s*[.):\-]|\s+)+/i, "").replace(/[[(]\s*\d+\s*marks?\s*[\])]\s*$/i, "")
    .replace(/[^\p{L}\p{N}+\-=/]+/gu, " ").replace(/\s+/g, " ").trim();
  const position = (question.figure || question.figure_page) && canonical(question.prompt).length < 80 ? `${sourceId}#${question.order}` : "";
  return crypto.createHash("sha256").update([canonical(question.type), canonical(question.prompt), ...(question.choices || []).map((choice) => canonical(choice.text)), position].join("|")).digest("hex");
}

function matchSection(question, sections) {
  const clean = (value) => String(value || "").toLowerCase().replace(/^g\d+\s*·\s*/, "").replace(/^\d+(\.\d+)*\s*/, "").trim();
  if (question.section) {
    const exact = sections.find((row) => row.title.toLowerCase() === question.section.toLowerCase() || clean(row.title) === clean(question.section));
    if (exact) return exact.id;
  }
  const words = (value) => new Set(String(value || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((word) => word.length > 3));
  const wanted = words(`${question.section || ""} ${question.topic || ""}`);
  let best = null; let bestScore = 0;
  for (const row of sections) {
    const have = words(`${row.title} ${(row.topics || []).join(" ")}`);
    const score = [...wanted].filter((word) => have.has(word)).length;
    if (score > bestScore) { best = row.id; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

const TYPES = { multiple_choice: "multiple_choice", short_answer: "fill_blank", structured: "free_response", essay: "essay" };

function validate(paper) {
  const problems = [];
  const orders = new Set();
  for (const [index, question] of paper.questions.entries()) {
    const label = `#${index + 1} (${question.number || "?"})`;
    if (!String(question.prompt || "").trim()) problems.push(`${label} has no prompt`);
    if (!TYPES[question.type]) problems.push(`${label} has unknown type ${question.type}`);
    if (orders.has(question.order)) problems.push(`${label} repeats order ${question.order}`); orders.add(question.order);
    if (question.type === "multiple_choice") {
      if ((question.choices || []).length < 2) problems.push(`${label} is multiple choice without options`);
      if (question.answer_source !== "unverified" && !(question.choices || []).some((choice) => choice.key === question.answer)) problems.push(`${label} answer ${question.answer} is not an option`);
    }
    if (question.type === "short_answer" && !(question.accepted || []).length && !question.answer) problems.push(`${label} short answer has no answer`);
    if (!["marking_scheme", "worked", "unverified"].includes(question.answer_source)) problems.push(`${label} answer_source must be marking_scheme, worked or unverified`);
    if (question.answer_source === "unverified" && question.answer) problems.push(`${label} is unverified but has an answer`);
  }
  return problems;
}

async function main() {
  await loadEnv();
  const file = process.argv[2];
  if (!file) throw new Error("Usage: node scripts/import-transcribed.mjs <paper.json> [--figures=<dir>]");
  const paper = JSON.parse(await fs.readFile(file, "utf8"));
  const problems = validate(paper);
  if (problems.length) throw new Error(`Fix these before importing:\n- ${problems.join("\n- ")}`);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: source, error: sourceError } = await supabase.from("content_sources").select("id, user_id, subject_id, title, storage_path, metadata").eq("id", paper.source_id).single();
  if (sourceError || !source) throw new Error(`Paper ${paper.source_id} not found`);
  const year = Number(source.metadata?.year) || null;

  // Replace this paper's previous transcription.
  const { data: previous } = await supabase.from("questions").select("id").eq("source_id", source.id).contains("metadata", { transcribed: true });
  if (previous?.length) { const removed = await supabase.from("questions").delete().in("id", previous.map((row) => row.id)); if (removed.error) throw removed.error; }
  await supabase.from("question_occurrences").delete().eq("source_id", source.id);

  const { data: sections } = await supabase.from("curriculum_sections").select("id, title, topics").eq("subject_id", source.subject_id);
  const figuresDir = arg("figures");
  const slug = path.basename(file, ".json");
  let saved = 0; let linked = 0; let tagged = 0; let figures = 0;
  for (const question of paper.questions) {
    let figure = {};
    if (question.figure) {
      if (!figuresDir) throw new Error(`Question ${question.number} names a figure but --figures was not given`);
      const storagePath = `${source.user_id}/figures/${slug}/${question.figure}`;
      const upload = await supabase.storage.from("study-materials").upload(storagePath, await fs.readFile(path.join(figuresDir, question.figure)), { contentType: "image/png", upsert: true });
      if (upload.error) throw upload.error;
      figure = { figure_image_path: storagePath }; figures += 1;
    } else if (question.figure_page && source.storage_path) figure = { source_storage_path: source.storage_path, source_page: question.figure_page };
    const questionType = TYPES[question.type];
    const answer = questionType === "multiple_choice" ? question.answer : questionType === "fill_blank" ? (question.accepted?.length ? question.accepted : [question.answer]) : "";
    const sectionId = matchSection(question, sections || []);
    const key = fingerprint(question, source.id);
    const { data: existing } = await supabase.from("questions").select("id, appearance_count").eq("user_id", source.user_id).eq("subject_id", source.subject_id).eq("question_fingerprint", key).maybeSingle();
    let questionId;
    if (existing) {
      const count = Number(existing.appearance_count || 1) + 1;
      await supabase.from("questions").update({ appearance_count: count, relevance_score: Math.round((1 + Math.log2(count + 1)) * 1000) / 1000, last_seen_at: new Date().toISOString() }).eq("id", existing.id);
      questionId = existing.id; linked += 1;
    } else {
      const { data, error } = await supabase.from("questions").insert({
        user_id: source.user_id, subject_id: source.subject_id, source_id: source.id, section_id: sectionId, question_type: questionType,
        prompt: question.prompt, choices: question.choices || [], answer, explanation: question.explanation || null,
        points: Math.max(1, Number(question.marks) || 1), year, topic: question.topic || null, difficulty: question.difficulty || "standard",
        sequence_order: question.order, question_fingerprint: key, appearance_count: 1, relevance_score: 1,
        metadata: { transcribed: true, number: question.number || null, paper_part: question.paper_part || null, answer_source: question.answer_source,
          model_answer: questionType === "multiple_choice" ? null : question.model_answer || (questionType === "fill_blank" ? null : question.answer) || null,
          requires_figure: Boolean(question.figure || question.figure_page), diagram_description: question.figure_description || null, ...figure },
      }).select("id").single();
      if (error) throw error;
      questionId = data.id; saved += 1; if (sectionId) tagged += 1;
    }
    const occurrence = await supabase.from("question_occurrences").insert({ user_id: source.user_id, question_id: questionId, source_id: source.id, sequence_order: question.order, year, points: Math.max(1, Number(question.marks) || 1), source_label: source.title });
    if (occurrence.error) throw occurrence.error;
  }
  await supabase.from("content_sources").update({ status: "ready", metadata: { ...source.metadata, transcribed_questions: paper.questions.length, transcribed_at: new Date().toISOString() } }).eq("id", source.id);
  console.log(JSON.stringify({ paper: source.title, questions: paper.questions.length, saved, linked, tagged, figures }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
