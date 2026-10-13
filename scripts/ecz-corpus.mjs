import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";

const ROOT = process.cwd();
const WORK_DIR = path.join(ROOT, ".ecz-corpus");
const CACHE_DIR = path.join(WORK_DIR, "cache");
const MANIFEST_PATH = path.join(WORK_DIR, "manifest.json");
const REPORT_PATH = path.join(WORK_DIR, "audit-report.json");
const MODEL = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Reading a cover is a simple task; a lite model is accurate enough and has a larger quota.
const VERIFY_MODEL = () => process.env.GEMINI_VERIFY_MODEL || "gemini-3.5-flash-lite";
// Question extraction tested accurately on the free lite model (60/60 Grade 7 items, structured Grade 12 parts).
const FALLBACK_MODEL = () => process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash";
const EXTRACT_MODEL = () => arg("model") || process.env.GEMINI_EXTRACT_MODEL || "gemini-3.5-flash-lite";
// Only these subjects are marked as extended prose; elsewhere "essay" means a structured answer.
const ESSAY_SUBJECTS = /^(English|Literature in English|History|Civic Education|Religious Education.*|Cinyanja|Icibemba|Chitonga|Silozi|Kiikaonde|Lunda|Luvale|French)$/;

class QuotaExhausted extends Error {}
const YEAR_MIN = 2016;
const YEAR_MAX = 2025;
const INLINE_LIMIT = 18 * 1024 * 1024;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) StudyPal educational corpus indexer/2.0";

// ECZ sittings. Grade 12 candidates sit either the School Certificate examination
// (often labelled "Internal", Oct-Dec) or the General Certificate of Education
// (labelled "GCE" or "External", mid-year). Older covers say "Joint Examination
// for the School Certificate and GCE" for the November sitting.
const SESSION_LABELS = {
  school_certificate: "School Certificate (Internal)",
  gce: "GCE (External)",
  grade_7_composite: "Composite Examination",
};

// Curricula for syllabi. Grade 12 examinations through 2026 assess the 2013
// Grade 10-12 syllabi; the 2023 Form 1-4 syllabi belong to the new curriculum.
const CURRICULA = {
  cdc_2013_g10_12: { label: "2013 Grade 10-12 syllabus (examined curriculum)", examined: true },
  ecz_assessment: { label: "ECZ examination syllabus", examined: true },
  cdc_2023_form1_4: { label: "2023 Form 1-4 syllabus (new curriculum)", examined: false },
  cdc_2013_g1_7: { label: "2013 Grade 1-7 syllabus (examined curriculum)", examined: true },
};

const SOURCES = [
  // Grade 12 question papers
  { url: "https://eczsolutions.com/grade-12.html", grade: "12", kind: "question_paper", priority: 88, parser: "anchors" },
  { url: "https://eczstudytool.com/grade12-past-papers", grade: "12", kind: "question_paper", priority: 90, parser: "anchors" },
  { url: "https://zambianecz.org/grade/12", grade: "12", kind: "question_paper", priority: 80, parser: "zambianecz_subjects" },
  { url: "https://zambiapastpapers.com/wp-json/wp/v2/pastpaper", grade: "12", kind: "question_paper", priority: 70, parser: "wp_pastpaper_rest" },
  // Grade 7 question papers
  { url: "https://g7quiz.maneja.net/", grade: "7", kind: "question_paper", priority: 95, parser: "heading_download_pairs" },
  { url: "https://eczstudytool.com/primary-education", grade: "7", kind: "question_paper", priority: 90, parser: "anchors" },
  { url: "https://eczsolutions.com/grade-7-9.html", grade: "7", kind: "question_paper", priority: 88, parser: "anchors" },
  { url: "https://zambianecz.org/grade/7", grade: "7", kind: "question_paper", priority: 80, parser: "zambianecz_subjects" },
  { url: "https://zambiapastpapers.com/wp-json/wp/v2/pastpaper", grade: "7", kind: "question_paper", priority: 70, parser: "wp_pastpaper_rest" },
  ...Array.from({ length: 5 }, (_, offset) => YEAR_MIN + offset).flatMap((year) => ([
    { url: `https://gidemy.com/gdownloads/guest/ExamPastPapersFiles?ExamBoard=ECZ&Year=${year}`, grade: "12", kind: "question_paper", priority: 75, parser: "gidemy_file_pairs" },
    { url: `https://gidemy.com/gdownloads/guest/ExamPastPapersFiles?ExamBoard=ECZ&Year=${year}`, grade: "7", kind: "question_paper", priority: 75, parser: "gidemy_file_pairs" },
  ])),
  // Marking schemes are catalogued for later answer-key pairing; never turned into questions.
  { url: "https://zedpastpapers.com/downloads/grade12/", grade: "12", kind: "marking_scheme", priority: 60, parser: "anchors" },
  { url: "https://zedpastpapers.com/downloads/grade7/", grade: "7", kind: "marking_scheme", priority: 60, parser: "anchors" },
  // Syllabi
  { url: "https://education.giakonda.org.uk/NEW%20SYLLABI%20ALL.NOV.22.2013%20PDF/", grade: "*", kind: "syllabus", priority: 95, parser: "autoindex" },
  { url: "https://gidemy.com/gdownloads/guest/SyllabiFiles?Studylevel=Senior+Secondary&Country=Zambia", grade: "12", kind: "syllabus", priority: 90, parser: "gidemy_file_pairs", curriculum: "cdc_2013_g10_12" },
  { url: "https://zambianecz.org/syllabus/senior-g10-g12", grade: "12", kind: "syllabus", priority: 85, parser: "anchors", curriculum: "cdc_2013_g10_12" },
  { url: "https://zambianecz.org/syllabus/primary-g1-g7", grade: "7", kind: "syllabus", priority: 85, parser: "anchors", curriculum: "cdc_2013_g1_7" },
];

const EXTRA_PAPER_ITEMS = [
  { source: { url: "https://g7quiz.maneja.net/", grade: "7", kind: "question_paper", priority: 95 }, item: { label: "G7 ENGLISH 2025", url: "https://g7quiz.maneja.net/download.php?id=1" } },
];

// The Ministry page intermittently rejects non-browser requests. These are the
// public links listed under its new-curriculum Form 1-4 syllabus section.
const OFFICIAL_FORM1_4_SYLLABI = [
  ["Chemistry", "CHEMISTRY-SYLLABUS.pdf"],
  ["Civic Education", "CIVIC-EDUCATION-SYLLABUS-SCIENCE-O-LEVEL-SYLLABUS-FORM-1-4.pdf"],
  ["Commerce", "COMMERCE-AND-PRINCIPLES-OF-ACCOUNTS-SYLABUS-CAMERA-READY-O-LEVEL-FORM-1-4.pdf"],
  ["Principles of Accounts", "COMMERCE-AND-PRINCIPLES-OF-ACCOUNTS-SYLABUS-CAMERA-READY-O-LEVEL-FORM-1-4.pdf"],
  ["Computer Studies", "COMPUTER_-SCIENCE-ORDINARY-SYLLABI-FORM-1-4.pdf"],
  ["Design and Technology", "DESIGN-AND-TECHNOLOGY-STUDIES.pdf"],
  ["English", "ENGLISH-SYLABUS-FORM-1-4-O-LEVELCAMERA-READY.pdf"],
  ["Fashion and Fabrics", "FASHION-AND-FABRICS-SYLABUS-O-LEVEL-FORM-1-4.pdf"],
  ["Food and Nutrition", "FOOD-AND-NUTRITION-SYLLABUS-FINAL-07-02-2024.pdf"],
  ["French", "FRENCH-LANGUAGE.pdf"],
  ["Geography", "GEOGRAPHY-SYLLABUS.pdf"],
  ["History", "HISTORY-SYLLABUS-FORMS-1-4.pdf"],
  ["Hospitality Management", "HOSPITALITY-MANAGEMENT.pdf"],
  ["ICT", "ICT_ORDINARY-LEVEL-SYLLABUS-FORMS-1-4.pdf"],
  ["Literature in English", "LITERATURE-IN-ENGLISH-SYLABUS-O-LEVEL-FORM-1-4.pdf"],
  ["Additional Mathematics", "MATHEMATICS-II-SYLLABUS.pdf"],
  ["Mathematics", "MATHEMATICS-O-LEVEL-FORMS-1-4.pdf"],
  ["Musical Arts Education", "MUSIC-ARTS-O-LEVEL-SYLLABUS-FORM-1-4-CAMERA-READY-1.pdf"],
  ["Physical Education", "PHYSICAL-EDUCATION-SYLLABUS-FORM-1-4.pdf"],
  ["Physics", "PHYSICS-SYLLABUS-O-LEVEL-FORM-1-4.pdf"],
  ["Religious Education (2044)", "RELIGIOUS-EDUCATION-SYLLABUS.pdf"],
  ["Religious Education (2046)", "RELIGIOUS-EDUCATION-SYLLABUS.pdf"],
  ["Travel and Tourism", "TRAVEL-AND-TOURISM-SYLLABUS.pdf"],
  ["Zambian Languages", "ZAMBIAN-LANGUAGES-ORDINARY-LEVEL-SYLLABUS-FORM-1-4-FINAL.pdf"],
  ["Agricultural Science", "AGRICULTURAL-SCIENCE-O-LEVEL-SYLLABUS-FORM-1-4.pdf"],
  ["Biology", "BIOLOGY-SYLABUS-O-LEVEL-FORM-1-4.pdf"],
  ["Art and Design", "ART-AND-DESIGN-SYLLABUS-FINAL.pdf"],
].map(([subject, file]) => ({ subject, url: `https://www.edu.gov.zm/wp-content/uploads/2025/04/${file}` }));

// Exact subject names after lower-casing, "&" -> "and", and punctuation removal.
const SUBJECT_ALIASES = new Map(Object.entries({
  "accounts": "Principles of Accounts", "acct": "Principles of Accounts", "principles of accounts": "Principles of Accounts", "poa": "Principles of Accounts",
  "addma": "Additional Mathematics", "additional maths": "Additional Mathematics", "additional mathematics": "Additional Mathematics", "amaths": "Additional Mathematics", "add maths": "Additional Mathematics",
  "agric science": "Agricultural Science", "agriculture science": "Agricultural Science", "agricultural science": "Agricultural Science",
  "art and design": "Art and Design", "artdesign": "Art and Design",
  "bio": "Biology", "biology": "Biology", "chem": "Chemistry", "chemistry": "Chemistry", "chemistry 5070": "Chemistry",
  "civic ed": "Civic Education", "civic education": "Civic Education", "civics": "Civic Education",
  "com": "Commerce", "commerce": "Commerce",
  "computer": "Computer Studies", "computer studies": "Computer Studies", "computer science": "Computer Studies",
  "design and technology": "Design and Technology",
  "eng": "English", "english": "English", "english language": "English", "english language 1123": "English",
  "fashion and fabrics": "Fashion and Fabrics", "food": "Food and Nutrition", "food nutrition": "Food and Nutrition", "food and nutrition": "Food and Nutrition", "fn": "Food and Nutrition",
  "french": "French", "french 3015": "French", "french 3015 12": "French",
  "ge": "Geography", "geography": "Geography",
  "gmd": "Geometrical and Mechanical Drawing", "geometrical": "Geometrical and Mechanical Drawing", "geometrical and mechanical drawing": "Geometrical and Mechanical Drawing",
  "history": "History", "home": "Home Management", "home management": "Home Management",
  "literature": "Literature in English", "literature in english": "Literature in English",
  "math": "Mathematics", "maths": "Mathematics", "mathematics": "Mathematics",
  "metal": "Metalwork", "metal work": "Metalwork", "metalwork": "Metalwork",
  "music": "Musical Arts Education", "musical": "Musical Arts Education", "musical art education": "Musical Arts Education", "musical arts education": "Musical Arts Education", "musical education": "Musical Arts Education",
  "physical": "Physical Education", "physical education": "Physical Education", "pe": "Physical Education",
  "phy": "Physics", "physics": "Physics",
  "religious": "Religious Education (2044)", "religion": "Religious Education (2046)",
  "wood": "Woodwork", "wood work": "Woodwork", "woodwork": "Woodwork",
  "chinyanja": "Cinyanja", "cinyanja": "Cinyanja", "nyanja": "Cinyanja", "icibemba": "Icibemba", "bemba": "Icibemba",
  "chitonga": "Chitonga", "tonga": "Chitonga", "silozi": "Silozi", "lozi": "Silozi", "kiikaonde": "Kiikaonde", "kaonde": "Kiikaonde",
  "lunda": "Lunda", "luvale": "Luvale", "chinese": "Chinese",
  "ict": "ICT", "travel and tourism": "Travel and Tourism",
  // Grade 7 composite subjects
  "ss": "Social Studies", "social studies": "Social Studies", "zl": "Zambian Language", "zambian language": "Zambian Language", "zambian languages": "Zambian Language",
  "cts": "Creative and Technology Studies", "creative technology studies": "Creative and Technology Studies", "creative and technology studies": "Creative and Technology Studies",
  "sp 1": "Special Paper 1", "sp1": "Special Paper 1", "special paper 1": "Special Paper 1",
  "sp 2": "Special Paper 2", "sp2": "Special Paper 2", "special paper 2": "Special Paper 2",
  "integrated science": "Integrated Science", "intergrated science": "Integrated Science",
}));

const GRADE_12_SUBJECTS = new Set([...SUBJECT_ALIASES.values()].filter((name) => !["Social Studies", "Zambian Language", "Creative and Technology Studies", "Special Paper 1", "Special Paper 2", "Integrated Science"].includes(name)).concat(["Science", "Religious Education", "Religious Education (2044)", "Religious Education (2046)", "Zambian Languages"]));
const GRADE_7_SUBJECTS = new Set(["English", "Mathematics", "Integrated Science", "Social Studies", "Creative and Technology Studies", "Special Paper 1", "Special Paper 2", "Zambian Language", "Home Economics", "Design and Technology", "Expressive Arts"]);

const IDENTITY_SCHEMA = {
  type: "object",
  properties: {
    document_type: { type: "string", enum: ["question_paper", "marking_scheme", "syllabus", "insert_or_resource_booklet", "other"] },
    issuing_body: { type: "string" },
    grade_level: { type: "string", enum: ["7", "9", "12", "other", "unknown"] },
    subject: { type: "string" },
    subject_code: { type: "string" },
    year: { type: ["integer", "null"] },
    paper_number: { type: ["integer", "null"] },
    sitting: { type: "string", enum: ["school_certificate", "gce", "joint_school_certificate_and_gce", "grade_7_composite", "grade_9", "unknown"] },
    is_specimen: { type: "boolean" },
    is_mock_or_school_based: { type: "boolean" },
    zambian_language: { type: "string" },
    duration_minutes: { type: ["integer", "null"], description: "Time allowed printed on the cover, in minutes." },
    header_text: { type: "string" },
    legible: { type: "boolean" },
    confidence: { type: "number" },
  },
  required: ["document_type", "issuing_body", "grade_level", "subject", "subject_code", "year", "paper_number", "sitting", "is_specimen", "is_mock_or_school_based", "zambian_language", "duration_minutes", "header_text", "legible", "confidence"],
};

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    sections: { type: "array", items: { type: "object", properties: {
      title: { type: "string" }, description: { type: "string" }, topics: { type: "array", items: { type: "string" } },
    }, required: ["title", "description", "topics"] } },
    questions: { type: "array", items: { type: "object", properties: {
      section_title: { type: "string", description: "For past papers: the exact title of the syllabus section this question assesses, copied from the supplied list, or empty when none fits." },
      paper_part: { type: "string", description: "The printed part of the paper, such as Section A, or empty." },
      question_type: { type: "string", enum: ["multiple_choice", "fill_blank", "free_response", "essay"] },
      prompt: { type: "string" },
      choices: { type: "array", items: { type: "object", properties: { key: { type: "string" }, text: { type: "string" } }, required: ["key", "text"] } },
      answer: { type: "string" }, accepted_answers: { type: "array", items: { type: "string" } }, explanation: { type: "string" },
      points: { type: "integer" }, year: { type: ["integer", "null"] }, topic: { type: "string" },
      difficulty: { type: "string", enum: ["introductory", "standard", "challenging"] }, sequence_order: { type: "integer" },
      page_number: { type: "integer", description: "1-based page of the attached PDF where this question starts." },
      requires_figure: { type: "boolean", description: "True when the question depends on a diagram, map, graph, table, picture or passage printed elsewhere on the page." },
      worked_answer: { type: "string", description: "Your own worked answer: the option key for multiple choice, otherwise a concise model answer. Never copied into prompt or answer." },
      worked_explanation: { type: "string", description: "One or two sentences explaining the worked answer for a learner." },
      worked_confidence: { type: "number" },
      needs_review: { type: "boolean" }, confidence: { type: "number" },
      rubric: { type: ["object", "null"], properties: { criteria: { type: "array", items: { type: "object", properties: {
        name: { type: "string" }, description: { type: "string" }, points: { type: "number" },
      }, required: ["name", "description", "points"] } }, total_points: { type: "number" } }, required: ["criteria", "total_points"] },
    }, required: ["section_title", "paper_part", "question_type", "prompt", "choices", "answer", "accepted_answers", "explanation", "points", "year", "topic", "difficulty", "sequence_order", "page_number", "requires_figure", "worked_answer", "worked_explanation", "worked_confidence", "needs_review", "confidence", "rubric"] } },
  },
  required: ["title", "sections", "questions"],
};

function log(message, detail) {
  const suffix = detail === undefined ? "" : ` ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  console.log(`[ecz-corpus] ${message}${suffix}`);
}

function arg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hasFlag(name) { return process.argv.includes(`--${name}`); }

async function loadEnv() {
  for (const file of [".env.local", ".env.corpus.local"]) {
    const text = await fs.readFile(path.join(ROOT, file), "utf8").catch(() => "");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pool(items, size, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const index = next++; await worker(items[index], index); }
  }));
}

function decodeHtml(value) {
  return String(value).replace(/<[^>]+>/g, " ").replace(/&amp;|&#0?38;/g, "&").replace(/&nbsp;/g, " ").replace(/&#0?39;|&#8217;/g, "'")
    .replace(/&quot;/g, '"').replace(/&#8211;|&#8212;/g, "-").replace(/\s+/g, " ").trim();
}

function safeDecode(value) { try { return decodeURIComponent(value); } catch { return value; } }

function anchors(html, baseUrl) {
  const rows = [];
  const regex = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const href = (match[1] || match[2]).replace(/&amp;/g, "&");
    try { rows.push({ url: new URL(href, baseUrl).href, label: decodeHtml(match[3]) }); } catch { /* invalid link */ }
  }
  return rows;
}

// Some listings HTML-encode the query string ("&amp;id=").
function cleanUrl(url) { return String(url).replace(/&amp;/g, "&").trim(); }

function driveId(url) {
  try {
    const parsed = new URL(cleanUrl(url));
    if (!/(^|\.)google(usercontent)?\.com$/i.test(parsed.hostname)) return null;
    return parsed.searchParams.get("id") || parsed.pathname.match(/\/file\/d\/([^/]+)/i)?.[1] || null;
  } catch { return null; }
}

// One stable identity per distinct remote file, so the same Drive file listed
// on several sites is downloaded once.
function fileIdentity(rawUrl) {
  const url = cleanUrl(rawUrl);
  const id = driveId(url);
  if (id) return `drive:${id}`;
  const parsed = new URL(url);
  const readerPath = parsed.searchParams.get("ReaderPath");
  if (readerPath) return `url:${new URL(readerPath, parsed.origin).href.toLowerCase()}`;
  return `url:${parsed.origin}${parsed.pathname}${parsed.search}`.toLowerCase();
}

function downloadUrl(rawUrl) {
  const url = cleanUrl(rawUrl);
  const id = driveId(url);
  if (id) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  const parsed = new URL(url);
  const readerPath = parsed.searchParams.get("ReaderPath");
  // Gidemy serves the files from its "wr" host; the FileDownload page is only an HTML wrapper.
  if (/gidemy\.com$/i.test(parsed.hostname) && readerPath) return new URL(readerPath, "https://wr.gidemy.com").href;
  return url;
}

function subjectKey(value) {
  return String(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function canonicalSubject(raw, grade) {
  const key = subjectKey(raw);
  if (!key) return null;
  const reCode = key.match(/\b(?:re|religious education)\b.*?\b(2044|2046)\b|\b(2044|2046)\b.*\breligious\b/);
  if (reCode || /^r ?e (2044|2046)$/.test(key)) return `Religious Education (${(reCode && (reCode[1] || reCode[2])) || key.match(/2044|2046/)[0]})`;
  if (/^religious education$|^re$/.test(key)) return "Religious Education";
  if (key === "science") return grade === "7" ? "Integrated Science" : "Science";
  if (/^science 5124$/.test(key)) return "Science";
  if (/^physics pure$/.test(key)) return "Physics";
  const alias = SUBJECT_ALIASES.get(key);
  if (alias) return alias;
  return key.replace(/\b\w/g, (char) => char.toUpperCase());
}

function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }

function paperKey(doc) {
  if (doc.document_kind === "syllabus") return ["ecz", `grade_${doc.grade}`, slug(doc.subject), "syllabus", doc.curriculum].join(":");
  return ["ecz", `grade_${doc.grade}`, slug(doc.subject), doc.year, doc.session, doc.paper ? `paper_${doc.paper}` : "paper_unknown", doc.variant, doc.document_kind].join(":");
}

function paperTitle(doc) {
  if (doc.document_kind === "syllabus") return `ECZ Grade ${doc.grade} ${doc.subject} syllabus - ${CURRICULA[doc.curriculum]?.label || doc.curriculum}`;
  const session = doc.session === "grade_7_composite" && doc.year >= 2024 ? "Primary School Leaving Examination" : SESSION_LABELS[doc.session] || doc.session;
  const variant = doc.variant === "standard" ? "" : ` ${doc.variant.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())}`;
  const paper = doc.grade === "7" ? "" : doc.paper ? ` Paper ${doc.paper}` : " (paper number unverified)";
  const kind = doc.document_kind === "marking_scheme" ? " Marking Scheme" : "";
  return `ECZ Grade ${doc.grade} ${doc.subject} ${doc.year} ${session}${variant}${paper}${kind}`;
}

// Interprets a link label such as "G12 ECZ Mathematics 2024 P1 GCE",
// "2016 Accounts P1 Grade 12 (Specimen)" or a subject-page row like "2021 P2".
// Only label text (and the hosting page's subject) is trusted; URL digits are not.
function parsePaper(source, item) {
  const label = decodeHtml(item.label || "");
  let text = `${item.subjectHint || ""} ${label}`.replace(/[_]+/g, " ").replace(/(\d)([A-Za-z])/g, "$1 $2").replace(/\s+/g, " ").trim();
  if (!/\b20\d\d\b/.test(text)) {
    const fileName = safeDecode(new URL(item.url).pathname.split("/").pop() || "").replace(/\.(pdf|docx?)$/i, "").replace(/[-_+]+/g, " ");
    text = `${text} ${fileName}`.trim();
  }
  if (!text) return null;
  const gradeMention = text.match(/\b(?:G|GRADE|GR)\s*\.?\s*(7|9|12)(?!\d)/i)?.[1] || (/\bGCE\b/i.test(text) ? "12" : null);
  if (gradeMention && gradeMention !== source.grade) return null;
  if (source.requireGradeMention && !gradeMention) return null;
  if (/\b(advance information|syllabus|timetable|results|notes|pamphlet)\b/i.test(text)) return null;
  const yearMatch = text.match(/\b(20\d\d)\b/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);
  if (year < YEAR_MIN || year > YEAR_MAX) return null;
  const isScheme = /\b(marking scheme|mark scheme|answers?|memo|solutions?)\b/i.test(text) || source.kind === "marking_scheme";
  const specialMatch = text.match(/\bSPECIAL\s*(?:PAPER)?\s*([12])\b/i) || text.match(/\bSP\s*([12])\b/i);
  const paperMatch = text.match(/\b(?:P|PAPER|PP)\s*([1-9])(?!\d)/i);
  const paper = source.grade === "7" ? 1 : paperMatch ? Number(paperMatch[1]) : null;
  const session = source.grade === "7" ? "grade_7_composite" : /\b(GCE|EXTERNAL)\b/i.test(text) ? "gce" : "school_certificate";
  const variant = /\bSPECIMEN\b/i.test(text) ? "specimen" : /\b(MOCK|PROVINCIAL|PRE ?MOCK)\b/i.test(text) ? "mock" : /\b(ALTERNATIVE|RESERVE|BACKUP)\b/i.test(text) ? "alternative" : "standard";
  if (variant === "mock") return null;
  let subjectRaw = specialMatch && source.grade === "7" ? `Special Paper ${specialMatch[1]}` : text
    .replace(/\b(?:G|GRADE|GR)\s*\.?\s*(7|9|12)(?!\d)/ig, " ").replace(/\bECZ\b/ig, " ").replace(new RegExp(`\\b${year}\\b`, "g"), " ")
    .replace(/\b(?:P|PAPER|PP)\s*[1-9](?!\d)/ig, " ").replace(/\b(GCE|INTERNAL|EXTERNAL|SPECIMEN|ALTERNATIVE|QUESTION PAPER|MARKING SCHEME|MARK SCHEME|ANSWERS?|MEMO|SOLUTIONS?|PDF|DOWNLOAD|PAST PAPERS?|EXAM|EXAMINATION|O LEVEL|COMPOSITE)\b/ig, " ")
    .replace(/\((?![^)]*\b(?:2044|2046)\b)[^)]*\)/g, " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  if (!subjectRaw || /^(download|pdf|view)$/i.test(subjectRaw)) return null;
  const subject = canonicalSubject(subjectRaw, source.grade);
  if (!subject || subject.length > 60) return null;
  const allowed = source.grade === "7" ? GRADE_7_SUBJECTS : GRADE_12_SUBJECTS;
  if (!allowed.has(subject)) return null;
  const doc = { exam_board: "ECZ", grade: source.grade, subject, year, session, paper, variant, document_kind: isScheme ? "marking_scheme" : "question_paper" };
  return { ...doc, corpus_key: paperKey(doc), title: paperTitle(doc), label, source_url: downloadUrl(item.url), file_identity: fileIdentity(item.url),
    discovered_from: source.url, source_priority: source.priority };
}

// Syllabus file names are noisy ("FINALISED GRADE 10 - 12 O LEVEL MATHS SYLLABUS_20 AUGUST_2013"),
// so match known subject phrases instead of cleaning the whole name. Returns every subject covered.
const SYLLABUS_PHRASES = [
  ["commerce and principles of a", ["Commerce", "Principles of Accounts"]],
  ["additional math", ["Additional Mathematics"]], ["mathematics ii", ["Additional Mathematics"]],
  ["integrated science", ["Integrated Science"]], ["intergrated science", ["Integrated Science"]],
  ["creative and techn", ["Creative and Technology Studies"]], ["creative techn", ["Creative and Technology Studies"]],
  ["social studies", ["Social Studies"]], ["zambian language", null], ["home economics", ["Home Economics"]], ["home management", ["Home Management"]],
  ["design and technology", ["Design and Technology"]], ["fashion and fabrics", ["Fashion and Fabrics"]], ["food and nutrition", ["Food and Nutrition"]],
  ["literature in english", ["Literature in English"]], ["civic", ["Civic Education"]], ["geography", ["Geography"]], ["history", ["History"]],
  ["physical education", ["Physical Education"]], ["musical", ["Musical Arts Education"]], ["music", ["Musical Arts Education"]],
  ["art and design", ["Art and Design"]], ["agric", ["Agricultural Science"]], ["biology", ["Biology"]], ["chemistry", ["Chemistry"]], ["physics", ["Physics"]],
  ["science 5124", ["Science"]], ["computer", ["Computer Studies"]], ["commerce", ["Commerce"]], ["accounts", ["Principles of Accounts"]],
  ["french", ["French"]], ["english", ["English"]], ["math", ["Mathematics"]], ["ict", ["ICT"]], ["travel and tourism", ["Travel and Tourism"]],
];

function syllabusSubjects(label, grade, context = "") {
  const text = subjectKey(safeDecode(label).replace(/\.(pdf|docx?)$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2"));
  const scope = subjectKey(safeDecode(`${context} ${label}`));
  const reCode = text.match(/\b(2044|2046)\b/)?.[1];
  if (/\b(r e|re|religious|religous)\b/.test(scope) && (reCode || /\breligi?ous\b/.test(scope))) return reCode ? [`Religious Education (${reCode})`] : [];
  for (const [phrase, subjects] of SYLLABUS_PHRASES) {
    if (!new RegExp(`(^|\\s)${phrase}`).test(text)) continue;
    if (phrase === "zambian language") return grade === "7" ? ["Zambian Language"] : ["Zambian Languages"];
    if (phrase === "art and design" || phrase === "design and technology") return subjects;
    return subjects;
  }
  if (/\bscience\b/.test(text)) return [grade === "7" ? "Integrated Science" : "Science"];
  return [];
}

function syllabusSubject(label, grade, context) { return syllabusSubjects(label, grade, context)[0] || null; }

function parseSyllabus(source, item) {
  const parsedUrl = new URL(item.url);
  const isDriveFile = Boolean(driveId(item.url));
  const fileName = safeDecode(parsedUrl.searchParams.get("Ptitle") || parsedUrl.pathname.split("/").pop() || "");
  if (!isDriveFile && !/\.pdf$/i.test(fileName) && !/\.pdf(?:$|[?#])/i.test(item.url)) return null;
  if (/login|privacy|contact|facebook|youtube|braill?e|intellectual disabilit|teaching profession|literacy framework|weekly schedule|teachers guide|presentation|new curriculum\.pdf/i.test(`${item.label} ${fileName}`)) return null;
  let grade = source.grade; let curriculum = source.curriculum;
  const folder = safeDecode(item.url).split("/").slice(0, -1).join("/");
  if (source.parser === "autoindex") {
    // The file name decides the grade band; the folder only breaks ties (folders mix bands, e.g. "P.E.8-12. EXP.G5-7").
    const band = (value) => /\b(?:g\.?\s*)?10\s*(?:-|to)\s*(?:g\s*)?12\b|\bg10\b|senior secondary/i.test(value) ? "12"
      : /\b(?:grades?|g)?\s*[1-5]\s*(?:-|to)\s*7\b/i.test(value) ? "7" : /\b8\s*(?:-|&|and)\s*9\b/i.test(value) ? "9" : null;
    const resolved = band(fileName) || band(folder.split("/").pop()) || (/geo\.his/i.test(folder) ? "12" : null);
    if (resolved === "7") { grade = "7"; curriculum = "cdc_2013_g1_7"; }
    else if (resolved === "12") { grade = "12"; curriculum = "cdc_2013_g10_12"; }
    else return null;
  }
  const label = /^(download|pdf|view)?$/i.test(String(item.label || "").trim()) ? fileName : item.label;
  const subjects = item.subject ? [item.subject] : syllabusSubjects(label || fileName, grade, folder);
  if (source.curriculum === "cdc_2013_g10_12" && /\b(5070|1123|3015)\b/.test(label)) curriculum = "ecz_assessment";
  const allowed = grade === "7" ? GRADE_7_SUBJECTS : GRADE_12_SUBJECTS;
  const rows = subjects.filter((subject) => allowed.has(subject)).map((subject) => {
    const doc = { exam_board: "ECZ", grade, subject, year: null, session: "curriculum", paper: null, variant: curriculum, curriculum, document_kind: "syllabus" };
    return { ...doc, corpus_key: paperKey(doc), title: paperTitle(doc), label: label || fileName, source_url: downloadUrl(item.url), file_identity: fileIdentity(item.url),
      discovered_from: source.url, source_priority: source.priority + (curriculum === "ecz_assessment" ? 5 : 0) };
  });
  return rows.length ? rows : null;
}

const pageCache = new Map();

async function fetchText(url, attempt = 0) {
  if (!pageCache.has(url)) {
    pageCache.set(url, (async () => {
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000), headers: { "user-agent": BROWSER_UA } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.text();
    })());
  }
  try { return await pageCache.get(url); }
  catch (error) {
    pageCache.delete(url);
    if (attempt < 2) { await sleep(1500 * (attempt + 1)); return fetchText(url, attempt + 1); }
    throw error;
  }
}

async function discoverSource(source) {
  log("discovering", `${source.url} (grade ${source.grade})`);
  let found = [];
  if (source.parser === "wp_pastpaper_rest") {
    for (let page = 1; page <= 50; page += 1) {
      let rows;
      try { rows = JSON.parse(await fetchText(`${source.url}?per_page=100&page=${page}&_fields=title,link`)); }
      catch (error) { if (page === 1) throw error; break; }
      if (!Array.isArray(rows) || !rows.length) break;
      found.push(...rows.map((row) => ({ label: decodeHtml(row.title?.rendered || ""), url: row.link })));
      if (rows.length < 100) break;
    }
    return found.map((item) => parsePaper({ ...source, requireGradeMention: true }, item)).filter(Boolean);
  }
  if (source.parser === "autoindex") {
    const seen = new Set();
    const crawl = async (url, depth) => {
      if (seen.has(url) || depth > 5) return; seen.add(url);
      for (const link of anchors(await fetchText(url), url)) {
        if (!link.url.startsWith(source.url) || /[?#]/.test(link.url)) continue;
        if (link.url.endsWith("/")) await crawl(link.url, depth + 1);
        else found.push({ label: safeDecode(link.url.split("/").pop()), url: link.url });
      }
    };
    await crawl(source.url, 0);
    return found.flatMap((item) => parseSyllabus(source, item) || []);
  }
  const rootHtml = await fetchText(source.url);
  if (source.parser === "heading_download_pairs") {
    const pairRegex = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>[\s\S]{0,1600}?<a\b[^>]*href=(?:"([^"]*download\.php[^"]*)"|'([^']*download\.php[^']*)')[^>]*>/gi;
    let pair;
    while ((pair = pairRegex.exec(rootHtml))) {
      try { found.push({ label: decodeHtml(pair[1]), url: new URL(pair[2] || pair[3], source.url).href }); } catch { /* invalid pair */ }
    }
  } else if (source.parser === "gidemy_file_pairs") {
    const fileRegex = /<h5\b[^>]*>([\s\S]*?)<\/h5>[\s\S]{0,1200}?<a\b[^>]*href=(?:"([^"]*FileDownload[^"]*)"|'([^']*FileDownload[^']*)')[^>]*>/gi;
    let filePair;
    while ((filePair = fileRegex.exec(rootHtml))) {
      try {
        const url = new URL((filePair[2] || filePair[3]).replace(/&amp;/g, "&"), source.url).href;
        const fullName = safeDecode(new URL(url).searchParams.get("Ptitle") || "") || decodeHtml(filePair[1]);
        found.push({ label: fullName, url });
      } catch { /* invalid pair */ }
    }
  } else if (source.parser === "zambianecz_subjects") {
    const root = new URL(source.url);
    const subjectPages = [...new Set(anchors(rootHtml, source.url).map((item) => item.url)
      .filter((url) => new URL(url).pathname.startsWith(`${root.pathname.replace(/\/$/, "")}/`)))];
    for (const pageUrl of subjectPages) {
      const subjectHint = pageUrl.split("/").pop().replace(/-/g, " ");
      try {
        const html = await fetchText(pageUrl);
        const jsonPath = html.match(/fetch\(['"]([^'"]+\.json)['"]\)/)?.[1];
        const rows = jsonPath ? JSON.parse(await fetchText(new URL(jsonPath, pageUrl).href)).map((row) => ({ label: decodeHtml(row.text), url: row.href }))
          : anchors(html, pageUrl).filter((row) => driveId(row.url) || /\.pdf/i.test(row.url));
        found.push(...rows.map((row) => ({ ...row, subjectHint })));
      } catch (error) { log("subject page skipped", { pageUrl, error: error.message }); }
    }
  } else found = anchors(rootHtml, source.url);
  return found.flatMap((item) => (source.kind === "syllabus" ? parseSyllabus(source, item) : parsePaper(source, item)) || []);
}

async function readManifest() {
  return JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
}

async function writeManifest(manifest) {
  const temp = `${MANIFEST_PATH}.tmp`;
  await fs.writeFile(temp, JSON.stringify(manifest, null, 2));
  await fs.rename(temp, MANIFEST_PATH);
}

// Files keep their download, verification and upload state across rediscovery.
const STATE_FIELDS = ["status", "local_path", "content_hash", "bytes", "pages", "error", "identity", "verified_at", "duplicate_of", "rejected_reason",
  "user_id", "subject_id", "source_id", "job_id", "storage_path", "validation", "extracted_questions", "approval_result", "label_identity", "superseded_by"];

async function discover() {
  await fs.mkdir(WORK_DIR, { recursive: true });
  const previous = await readManifest().catch(() => ({ documents: [] }));
  const previousByFile = new Map();
  for (const item of previous.documents || []) {
    const identity = item.file_identity || fileIdentity(item.source_url);
    previousByFile.set(identity, item);
  }
  const ministry = { url: "https://www.edu.gov.zm/?page_id=1142", grade: "12", kind: "syllabus", priority: 70, curriculum: "cdc_2023_form1_4" };
  const candidates = OFFICIAL_FORM1_4_SYLLABI.flatMap((item) => parseSyllabus(ministry, { ...item, label: item.subject }) || []);
  candidates.push(...EXTRA_PAPER_ITEMS.map(({ source, item }) => parsePaper(source, item)).filter(Boolean));
  const sourceStats = [];
  for (const source of SOURCES) {
    try {
      const rows = await discoverSource(source);
      candidates.push(...rows);
      sourceStats.push({ url: source.url, grade: source.grade, kind: source.kind, items: rows.length });
    } catch (error) {
      sourceStats.push({ url: source.url, grade: source.grade, kind: source.kind, error: error.message });
      log("source failed", { url: source.url, error: error.message });
    }
  }
  // Merge listings that point at the same remote file; keep every label for auditing.
  const byFile = new Map();
  for (const item of candidates) {
    const id = item.file_identity + (item.document_kind === "syllabus" ? `#${item.subject}` : "");
    const current = byFile.get(id);
    if (!current) { byFile.set(id, { ...item, file_id: id, listings: [{ label: item.label, from: item.discovered_from, key: item.corpus_key }] }); continue; }
    current.listings.push({ label: item.label, from: item.discovered_from, key: item.corpus_key });
    if (item.source_priority > current.source_priority) Object.assign(current, { ...item, file_id: id, listings: current.listings });
  }
  const documents = [...byFile.values()].map((doc) => {
    const prior = previousByFile.get(doc.file_identity);
    const state = {};
    if (prior && (prior.document_kind === "syllabus") === (doc.document_kind === "syllabus")) for (const field of STATE_FIELDS) if (prior[field] !== undefined) state[field] = prior[field];
    // Verified identity from the document itself overrides the listing label.
    const identity = state.identity?.resolved;
    const merged = { ...doc, label_identity: doc.corpus_key, ...state, status: state.status || "discovered" };
    if (identity) Object.assign(merged, identity, { corpus_key: paperKey({ ...merged, ...identity }), title: paperTitle({ ...merged, ...identity }) });
    return merged;
  }).sort((a, b) => `${a.grade}|${a.document_kind}|${a.subject}|${a.year || 0}|${a.session}|${a.paper || 0}|${a.variant}`
    .localeCompare(`${b.grade}|${b.document_kind}|${b.subject}|${b.year || 0}|${b.session}|${b.paper || 0}|${b.variant}`));
  await writeManifest({ version: 2, generated_at: new Date().toISOString(), year_range: [YEAR_MIN, YEAR_MAX], sources: sourceStats, documents });
  const counts = {};
  for (const doc of documents) counts[`${doc.grade}:${doc.document_kind}`] = (counts[`${doc.grade}:${doc.document_kind}`] || 0) + 1;
  log("manifest written", { path: MANIFEST_PATH, files: documents.length, counts, sources: sourceStats });
}

function selected(item) {
  const grade = arg("grade"); const kind = arg("kind"); const subject = arg("subject"); const year = arg("year");
  return (!grade || item.grade === grade) && (!kind || item.document_kind === kind) && (!subject || item.subject.toLowerCase().includes(subject.toLowerCase()))
    && (!year || String(item.year) === year);
}

async function fetchPdf(url) {
  let response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000), headers: { "user-agent": BROWSER_UA } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  let buffer = Buffer.from(await response.arrayBuffer());
  let contentType = response.headers.get("content-type") || "";
  const id = driveId(url);
  if (!buffer.subarray(0, 5).toString().startsWith("%PDF") && id) {
    // Large Drive files return a virus-scan interstitial instead of the file.
    response = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,
      { redirect: "follow", signal: AbortSignal.timeout(180_000), headers: { "user-agent": BROWSER_UA } });
    if (!response.ok) throw new Error(`Drive ${response.status} ${response.statusText}`);
    buffer = Buffer.from(await response.arrayBuffer()); contentType = response.headers.get("content-type") || contentType;
  }
  const start = buffer.subarray(0, 1024).indexOf("%PDF");
  if (start < 0) throw new Error(`not a PDF (${contentType || "unknown content type"})`);
  return start > 0 ? buffer.subarray(start) : buffer;
}

async function downloadOne(item) {
  const urls = [item.source_url];
  let lastError;
  for (const url of urls) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const buffer = await fetchPdf(url);
        const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false }).catch(() => null);
        if (!pdf) throw new Error("PDF could not be opened (corrupt or truncated)");
        const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
        const fileName = `${sha256.slice(0, 20)}.pdf`;
        await fs.mkdir(CACHE_DIR, { recursive: true });
        await fs.writeFile(path.join(CACHE_DIR, fileName), buffer);
        return { ...item, status: "downloaded", error: undefined, local_path: `.ecz-corpus/cache/${fileName}`, content_hash: sha256, bytes: buffer.length, pages: pdf.getPageCount(), mime_type: "application/pdf" };
      } catch (error) {
        lastError = error;
        if (/not a PDF|could not be opened|404/.test(error.message)) break;
        await sleep(2000 * (attempt + 1));
      }
    }
  }
  return { ...item, status: "download_failed", error: lastError?.message || "Download failed" };
}

async function download() {
  const manifest = await readManifest(); const limit = Number(arg("limit", "0")); const retryFailed = hasFlag("retry-failed");
  const includeSchemes = hasFlag("include-marking-schemes");
  const queue = manifest.documents.map((item, index) => ({ item, index })).filter(({ item }) => selected(item)
    && (item.status === "discovered" || (retryFailed && item.status === "download_failed"))
    && (includeSchemes || item.document_kind !== "marking_scheme"));
  const work = limit ? queue.slice(0, limit) : queue;
  log("downloading", { files: work.length });
  let done = 0; let lastSave = Date.now();
  await pool(work, Number(arg("concurrency", "4")), async ({ item, index }) => {
    manifest.documents[index] = await downloadOne(item); done += 1;
    const result = manifest.documents[index];
    log(result.status, { n: `${done}/${work.length}`, key: item.corpus_key, pages: result.pages, error: result.error });
    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); await writeManifest(manifest); }
  });
  markContentDuplicates(manifest);
  await writeManifest(manifest);
}

// Identical bytes are one document no matter how many sites list them.
function markContentDuplicates(manifest) {
  const firstByHash = new Map();
  const rank = (item) => (item.status === "verified" ? 0 : item.status === "registered" || item.status === "processed" || item.status === "approved" ? -1 : 1);
  const sorted = manifest.documents.filter((item) => item.content_hash && item.status !== "download_failed")
    .sort((a, b) => rank(a) - rank(b) || b.source_priority - a.source_priority);
  for (const item of sorted) {
    const hashKey = `${item.content_hash}|${item.document_kind === "syllabus" ? item.subject : ""}`;
    const first = firstByHash.get(hashKey);
    if (!first) { firstByHash.set(hashKey, item); continue; }
    if (item === first) continue;
    if (["registered", "processed", "approved"].includes(item.status)) continue;
    item.status = "duplicate"; item.duplicate_of = first.file_id;
    first.listings = [...(first.listings || []), ...(item.listings || [])];
  }
}

async function geminiFilePart(buffer) {
  if (buffer.length <= INLINE_LIMIT) return { inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } };
  const upload = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST", headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "X-Goog-Upload-Protocol": "raw", "Content-Type": "application/pdf" }, body: buffer,
  });
  const payload = await upload.json().catch(() => ({}));
  if (!upload.ok || !payload.file?.uri) throw new Error(`Gemini file upload ${upload.status}: ${payload?.error?.message || "failed"}`);
  for (let wait = 0; payload.file.state === "PROCESSING" && wait < 30; wait += 1) {
    await sleep(2000);
    const status = await fetch(`https://generativelanguage.googleapis.com/v1beta/${payload.file.name}`, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY } });
    payload.file = await status.json();
  }
  return { fileData: { mimeType: "application/pdf", fileUri: payload.file.uri } };
}

async function geminiJson(prompt, filePart, schema, thinkingLevel = "low", timeoutMs = 600_000, model = MODEL()) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY }, body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, filePart] }],
        generationConfig: { responseFormat: { text: { mimeType: "APPLICATION_JSON", schema } }, thinkingConfig: { thinkingLevel } },
      }), signal: AbortSignal.timeout(timeoutMs) }).catch((error) => ({ ok: false, status: 0, json: async () => ({ error: { message: error.message } }) }));
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
      if (!text) throw new Error(`Gemini returned no structured content (${payload.candidates?.[0]?.finishReason || "no candidate"})`);
      return JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
    }
    const message = String(payload?.error?.message || "");
    // A daily allowance will not recover by retrying; stop the run and resume tomorrow.
    if (response.status === 429 && /per ?day|retry in \d+h/i.test(message)) {
      const detail = message.split("\n").filter((line) => /Quota exceeded|retry in/i.test(line)).join(" ") || message;
      throw new QuotaExhausted(`Gemini daily quota reached for ${model}: ${detail}`);
    }
    const retryable = [0, 429, 500, 502, 503, 504].includes(response.status);
    if (!retryable || attempt >= 5) throw new Error(`Gemini ${response.status}: ${payload?.error?.message || "request failed"}`);
    await sleep(Math.min(60_000, 4000 * 2 ** attempt));
  }
}

async function firstPages(buffer, count) {
  try {
    const source = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
    const target = await PDFDocument.create();
    const pages = await target.copyPages(source, [...Array(Math.min(count, source.getPageCount())).keys()]);
    for (const page of pages) target.addPage(page);
    return Buffer.from(await target.save());
  } catch { return buffer; }
}

const IDENTITY_PROMPT = `You are checking the identity of a scanned Zambian examination document before it is filed.
Read the printed cover/first pages only. Report exactly what is printed; do not guess from typical patterns.
Conventions: Examinations Council of Zambia (ECZ) covers state the examination, for example
"Examination for School Certificate Ordinary Level" (Grade 12 internal sitting),
"Examination for General Certificate of Education Ordinary Level" or "GCE" (external sitting),
"Joint Examination for the School Certificate and General Certificate of Education Ordinary Level" (joint November sitting),
"Grade Seven Composite Examination" or, from 2024, "Primary School Leaving Examination" (Grade 7), "Junior Secondary School Leaving Examination" (Grade 9).
Grade 12 covers show a subject code such as 4024/1 where the digit after "/" is the paper number. "Specimen" papers say SPECIMEN.
Set is_mock_or_school_based=true for mock, provincial, district or school-set papers that ECZ did not set.
For Grade 7 Zambian language papers give the language name in zambian_language (else "").
header_text: the main cover lines verbatim (max 400 chars). confidence: 0..1 for the identity as a whole.`;

function resolveIdentity(item, found) {
  const reasons = [];
  if (!found.legible || Number(found.confidence) < 0.5) return { accept: false, reason: `cover not legible enough to verify (confidence ${found.confidence})` };
  if (found.document_type === "other") return { accept: false, reason: "not an examination document" };
  if (found.is_mock_or_school_based) return { accept: false, reason: "mock or school-set paper, not an ECZ national paper" };
  if (!/zambia|ecz/i.test(`${found.issuing_body} ${found.header_text}`)) return { accept: false, reason: `issuer is not ECZ (${found.issuing_body || "unknown"})` };
  const resolved = {};
  const grade = ["7", "12"].includes(found.grade_level) ? found.grade_level : found.grade_level === "9" ? "9" : item.grade;
  if (grade !== item.grade) return { accept: false, reason: `cover says Grade ${found.grade_level}, listed as Grade ${item.grade}` };
  if (item.document_kind !== "syllabus") {
    const kind = found.document_type === "marking_scheme" ? "marking_scheme" : "question_paper";
    if (kind !== item.document_kind) { resolved.document_kind = kind; reasons.push(`kind ${item.document_kind}->${kind}`); }
    const year = Number(found.year);
    if (year && year !== item.year) {
      if (year < YEAR_MIN || year > YEAR_MAX) return { accept: false, reason: `cover year ${year} is outside ${YEAR_MIN}-${YEAR_MAX}` };
      resolved.year = year; reasons.push(`year ${item.year}->${year}`);
    }
    const subject = canonicalSubject(found.subject.replace(/\b(paper|ordinary level|o level)\b.*$/i, ""), item.grade);
    const codeRe = /\b(2044|2046)\b/.exec(`${found.subject_code} ${found.subject}`)?.[1];
    let finalSubject = codeRe ? `Religious Education (${codeRe})` : subject;
    // Grade 7 sets one paper per Zambian language; the cover may name only the language.
    const ZAMBIAN_LANGUAGES = ["Chitonga", "Cinyanja", "Icibemba", "Kiikaonde", "Lunda", "Luvale", "Silozi"];
    const language = [canonicalSubject(found.zambian_language || "", "7"), subject].find((name) => ZAMBIAN_LANGUAGES.includes(name));
    if (item.grade === "7" && language) { finalSubject = "Zambian Language"; if (item.variant !== slug(language)) { resolved.variant = slug(language); reasons.push(`language ->${language}`); } }
    const allowed = item.grade === "7" ? GRADE_7_SUBJECTS : GRADE_12_SUBJECTS;
    if (finalSubject && allowed.has(finalSubject) && finalSubject !== item.subject) {
      // Keep the specific listing name when the cover only gives a generic one.
      if (!(finalSubject === "Religious Education" && /^Religious Education \(/.test(item.subject))) { resolved.subject = finalSubject; reasons.push(`subject ${item.subject}->${finalSubject}`); }
    }
    if ((resolved.subject || item.subject) === "Religious Education") return { accept: false, reason: "Religious Education syllabus code (2044/2046) not visible" };
    if (item.grade === "12") {
      const codePaper = Number(/\/\s*([1-9])\b/.exec(found.subject_code || "")?.[1]) || null;
      const paper = Number(found.paper_number) || codePaper;
      if (paper && paper !== item.paper) { resolved.paper = paper; reasons.push(`paper ${item.paper ?? "?"}->${paper}`); }
      if (!paper && !item.paper) return { accept: false, reason: "paper number not visible on cover or listing" };
      const sitting = found.sitting === "gce" ? "gce" : ["school_certificate", "joint_school_certificate_and_gce"].includes(found.sitting) ? "school_certificate" : null;
      if (sitting && sitting !== item.session) { resolved.session = sitting; reasons.push(`session ${item.session}->${sitting}`); }
    }
    if (Number(found.duration_minutes) > 0) resolved.duration_minutes = Number(found.duration_minutes);
    if (found.is_specimen && item.variant !== "specimen") { resolved.variant = "specimen"; reasons.push("variant ->specimen"); }
    if (!found.is_specimen && item.variant === "specimen" && Number(found.confidence) >= 0.8) { resolved.variant = "standard"; reasons.push("variant specimen->standard"); }
  }
  return { accept: true, resolved, reasons };
}

const LIVE_STATUSES = ["verified", "registered", "processed", "approved"];

// One slot per grade + subject + paper number (and Zambian language for Grade 7).
function paperGroup(item) {
  const language = item.grade === "7" && item.subject === "Zambian Language" && item.variant !== "standard" && item.variant !== "specimen" ? item.variant : "";
  return `${item.grade}|${item.subject}|${item.grade === "7" ? language : item.paper ?? "?"}`;
}

const rankPaper = (a, b) => (b.year - a.year) || Number(a.variant === "specimen") - Number(b.variant === "specimen")
  || Number(b.session === "school_certificate") - Number(a.session === "school_certificate") || (b.pages || 0) - (a.pages || 0);

// The newest verified paper in every slot: what --latest registers and processes.
function latestSet(manifest) {
  const best = new Map();
  for (const item of manifest.documents) {
    if (item.document_kind !== "question_paper" || !LIVE_STATUSES.includes(item.status) || !item.year) continue;
    const group = paperGroup(item); const current = best.get(group);
    if (!current || rankPaper(item, current) < 0) best.set(group, item);
  }
  return new Set([...best.values()].map((item) => item.file_id));
}

// Unverified files that could still beat the current newest paper in their slot.
function latestCandidates(manifest) {
  const bestYear = new Map(); const latest = latestSet(manifest);
  for (const item of manifest.documents) if (latest.has(item.file_id)) bestYear.set(paperGroup(item), item.year);
  const pending = manifest.documents.filter((item) => item.status === "downloaded" && item.document_kind === "question_paper" && item.variant !== "specimen" && !item.error?.startsWith("verify: cover"));
  const subjectMax = new Map(); const groupMax = new Map();
  for (const item of [...pending, ...manifest.documents.filter((row) => LIVE_STATUSES.includes(row.status) && row.document_kind === "question_paper")]) {
    const subjectKey = `${item.grade}|${item.subject}`;
    subjectMax.set(subjectKey, Math.max(subjectMax.get(subjectKey) || 0, item.year || 0));
  }
  for (const item of pending) groupMax.set(paperGroup(item), Math.max(groupMax.get(paperGroup(item)) || 0, item.year || 0));
  return new Set(pending.filter((item) => {
    const group = paperGroup(item);
    // Unknown paper numbers are only worth checking when they are as new as anything in the subject.
    if (item.grade === "12" && !item.paper) return item.year >= (subjectMax.get(`${item.grade}|${item.subject}`) || 0);
    return item.year === groupMax.get(group) && item.year >= (bestYear.get(group) || 0);
  }).map((item) => item.file_id));
}

async function verify() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required to verify documents.");
  const latestOnly = hasFlag("latest");
  // In --latest mode a rejected newest file promotes the next-newest, so repeat until stable.
  for (let round = 1; round <= (latestOnly ? 6 : 1); round += 1) {
    const result = await verifyPass(latestOnly);
    if (result.quota || !latestOnly || !result.processed) return;
    log("latest pass complete", { round, processed: result.processed });
  }
}

async function verifyPass(latestOnly) {
  const manifest = await readManifest(); const limit = Number(arg("limit", "0")); const force = hasFlag("force");
  const candidates = latestOnly ? latestCandidates(manifest) : null;
  const queue = manifest.documents.map((item, index) => ({ item, index })).filter(({ item }) => selected(item)
    && (item.status === "downloaded" || (force && item.status === "verified")) && item.document_kind !== "marking_scheme"
    && (!candidates || item.document_kind === "syllabus" || candidates.has(item.file_id)));
  const work = limit ? queue.slice(0, limit) : queue;
  log("verifying", { files: work.length, model: VERIFY_MODEL() });
  let done = 0; let lastSave = Date.now(); let quotaError = null;
  await pool(work, Number(arg("concurrency", "4")), async ({ item, index }) => {
    if (quotaError) return;
    let updated;
    try {
      const buffer = await fs.readFile(path.join(ROOT, item.local_path));
      if (item.document_kind === "syllabus") {
        // Syllabi come from official CDC/Ministry file names; check they are real, readable documents.
        updated = (item.pages || 0) >= 4 ? { ...item, status: "verified", verified_at: new Date().toISOString(), identity: { method: "official_file_name" } }
          : { ...item, status: "rejected", rejected_reason: `only ${item.pages} pages` };
      } else {
        const found = await geminiJson(IDENTITY_PROMPT, await geminiFilePart(await firstPages(buffer, 2)), IDENTITY_SCHEMA, "low", 90_000, VERIFY_MODEL());
        const decision = resolveIdentity(item, found);
        if (!decision.accept) updated = { ...item, status: "rejected", rejected_reason: decision.reason, identity: { found } };
        else {
          const next = { ...item, ...decision.resolved };
          updated = { ...next, corpus_key: paperKey(next), title: paperTitle(next), status: "verified", verified_at: new Date().toISOString(),
            identity: { found, resolved: decision.resolved, corrections: decision.reasons } };
        }
      }
    } catch (error) {
      if (error instanceof QuotaExhausted) { quotaError = error; return; }
      updated = { ...item, status: "downloaded", error: `verify: ${error.message}` };
    }
    if (updated.status === "verified") delete updated.error;
    manifest.documents[index] = updated; done += 1;
    log(updated.status, { n: `${done}/${work.length}`, key: updated.corpus_key, corrections: updated.identity?.corrections, reason: updated.rejected_reason, error: updated.status === "downloaded" ? updated.error : undefined });
    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); await writeManifest(manifest); }
  });
  resolveIdentityConflicts(manifest);
  await writeManifest(manifest);
  if (quotaError) { log("stopped early", quotaError.message); process.exitCode = 2; }
  return { processed: done, quota: Boolean(quotaError) };
}

// Different files that verify as the same paper: keep the most complete scan.
function resolveIdentityConflicts(manifest) {
  const groups = new Map();
  for (const item of manifest.documents) {
    if (!["verified", "registered", "processed", "approved"].includes(item.status)) continue;
    const rows = groups.get(item.corpus_key) || []; rows.push(item); groups.set(item.corpus_key, rows);
  }
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const locked = rows.find((row) => row.status !== "verified");
    rows.sort((a, b) => Number(b.status !== "verified") - Number(a.status !== "verified") || (b.pages || 0) - (a.pages || 0)
      || Number(b.identity?.found?.confidence || 0) - Number(a.identity?.found?.confidence || 0) || b.source_priority - a.source_priority);
    const keep = locked || rows[0];
    for (const row of rows) if (row !== keep && row.status === "verified") { row.status = "superseded"; row.superseded_by = keep.file_id; }
  }
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for trusted corpus imports. Put the service-role key in .env.corpus.local.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function allUsers(supabase) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error; users.push(...data.users); if (data.users.length < 1000) return users;
  }
}

async function resolveStudents(supabase) {
  const users = await allUsers(supabase);
  const { data: profiles, error } = await supabase.from("profiles").select("id, display_name, grade_level, exam_name, exam_key");
  if (error) throw error;
  const grade12Name = arg("grade12-user", "Abigail Monga").toLowerCase();
  const grade7Email = arg("grade7-email", "jonathanmoongacs@gmail.com").toLowerCase();
  const nameOf = (row) => String(row.display_name || "").toLowerCase().replace(/\s+/g, " ").trim();
  const nameMatches = profiles.filter((profile) => nameOf(profile) === grade12Name
    || (nameOf(profile).includes("abigail") && /mo+nga/.test(nameOf(profile))));
  const abigailProfile = nameMatches.length === 1 ? nameMatches[0] : null;
  const prosperUser = users.find((user) => String(user.email || "").toLowerCase() === grade7Email);
  const prosperProfile = prosperUser && profiles.find((profile) => profile.id === prosperUser.id);
  if (nameMatches.length > 1) throw new Error(`Several profiles match ${grade12Name}: ${nameMatches.map((row) => row.id).join(", ")}. Pass --grade12-user with the exact display name.`);
  if (!abigailProfile) throw new Error(`No profile matched ${grade12Name}.`);
  if (!prosperUser || !prosperProfile) throw new Error(`No profile matched ${grade7Email}.`);
  if (abigailProfile.id === prosperProfile.id) throw new Error("The Grade 12 and Grade 7 students resolved to the same account.");
  return { "12": abigailProfile, "7": prosperProfile };
}

// Names a student may already use for a corpus subject.
const ACCOUNT_SUBJECT_ALIASES = {
  "English": ["English Language"],
  "Religious Education (2044)": ["Religious Education"],
  "Religious Education (2046)": ["Religious Education"],
  "Integrated Science": ["Science"],
  "Social Studies": ["Social and Development Studies"],
  "Creative and Technology Studies": ["CTS", "Creative & Technology Studies"],
};

function listArg(name) {
  const value = arg(name);
  return value ? value.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean) : null;
}

// Which of the student's subjects a document belongs to, or null to skip it.
//   --grade12-subjects=account   only subjects already in the account
//   --grade7-subjects=A,B,C       only these subjects (created when missing)
//   --grade7-language=Icibemba    only that Zambian language's papers
function targetSubject(item, accountSubjects) {
  const names = [item.subject, ...(ACCOUNT_SUBJECT_ALIASES[item.subject] || [])];
  const existing = accountSubjects.find((row) => names.some((name) => name.toLowerCase() === row.name.toLowerCase()));
  if (item.grade === "12" && arg("grade12-subjects") === "account") return existing ? existing.name : null;
  if (item.grade === "7") {
    const allowed = listArg("grade7-subjects");
    if (allowed && !names.some((name) => allowed.includes(name.toLowerCase()))) return null;
    const language = arg("grade7-language");
    if (language && item.subject === "Zambian Language" && item.document_kind === "question_paper" && item.variant !== slug(canonicalSubject(language, "7"))) return null;
  }
  return existing ? existing.name : item.subject;
}

async function ensureSubject(supabase, userId, name) {
  const { data: existing } = await supabase.from("subjects").select("id, name").eq("user_id", userId).ilike("name", name).maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase.from("subjects").insert({ user_id: userId, name, color: "red" }).select("id, name").single();
  if (error) throw error; return data;
}

function registrable(item, includeNewCurriculum) {
  if (item.status !== "verified") return false;
  if (item.document_kind === "marking_scheme") return false;
  if (item.document_kind === "syllabus" && !includeNewCurriculum && !CURRICULA[item.curriculum]?.examined) return false;
  if (item.document_kind === "syllabus" && item.subject === "Zambian Languages") return false;
  return true;
}

async function register() {
  const supabase = adminClient(); const students = await resolveStudents(supabase); const manifest = await readManifest();
  log("students", { grade12: students["12"].display_name, grade7: students["7"].display_name });
  const includeNew = hasFlag("include-new-curriculum"); const limit = Number(arg("limit", "0")); let completed = 0;
  const latest = hasFlag("latest") ? latestSet(manifest) : null;
  const accountSubjects = {};
  for (const grade of ["12", "7"]) {
    const { data, error } = await supabase.from("subjects").select("id, name").eq("user_id", students[grade].id);
    if (error) throw error; accountSubjects[grade] = data || [];
  }
  if (hasFlag("dry-run")) return registerPlan(manifest, latest, includeNew, accountSubjects, students);
  // Syllabi first so paper extraction can tag questions against the official topics.
  const order = manifest.documents.map((item, index) => ({ item, index }))
    .sort((a, b) => Number(b.item.document_kind === "syllabus") - Number(a.item.document_kind === "syllabus"));
  for (const { item, index } of order) {
    if (!selected(item) || !registrable(item, includeNew)) continue;
    if (latest && item.document_kind === "question_paper" && !latest.has(item.file_id)) continue;
    if (limit && completed >= limit) break;
    const student = students[item.grade];
    const subjectName = targetSubject(item, accountSubjects[item.grade]);
    if (!subjectName) continue;
    try {
      const subject = await ensureSubject(supabase, student.id, subjectName);
      if (!accountSubjects[item.grade].some((row) => row.id === subject.id)) accountSubjects[item.grade].push(subject);
      const file = await fs.readFile(path.join(ROOT, item.local_path));
      const storagePath = `${student.id}/ecz/${item.grade}/${item.content_hash}.pdf`;
      const uploaded = await supabase.storage.from("study-materials").upload(storagePath, file, { contentType: "application/pdf", upsert: false });
      if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message)) throw uploaded.error;
      const sourceType = item.document_kind === "syllabus" ? "syllabus" : "past_paper";
      let { data: source } = await supabase.from("content_sources").select("id").eq("user_id", student.id).contains("metadata", { corpus_key: item.corpus_key }).maybeSingle();
      if (!source) {
        const { data: duplicate } = await supabase.from("content_sources").select("id, title").eq("user_id", student.id).eq("subject_id", subject.id).eq("content_hash", item.content_hash).maybeSingle();
        if (duplicate) {
          await supabase.from("corpus_import_events").insert({ user_id: student.id, source_id: duplicate.id, corpus_key: item.corpus_key, stage: "skipped", detail: { reason: "identical_content", duplicate_of: duplicate.id } });
          manifest.documents[index] = { ...item, status: "duplicate", duplicate_of: duplicate.id };
          completed += 1; log("skipped identical content", { key: item.corpus_key, duplicate_of: duplicate.id });
          await writeManifest(manifest);
          continue;
        }
        const result = await supabase.from("content_sources").insert({ user_id: student.id, subject_id: subject.id, source_type: sourceType, title: paperTitle(item).slice(0, 180),
          raw_text: "", status: "processing", file_name: `${slug(item.title)}.pdf`, mime_type: "application/pdf", storage_path: storagePath,
          exam_key: `ecz_grade_${item.grade}`, content_hash: item.content_hash, processing_mode: "document",
          metadata: { corpus_key: item.corpus_key, exam_board: "ECZ", grade: item.grade, year: item.year, session: item.session, session_label: SESSION_LABELS[item.session] || null,
            paper: item.paper, variant: item.variant, curriculum: item.curriculum || null, document_kind: item.document_kind, pages: item.pages, duration_minutes: item.duration_minutes || null,
            source_url: item.source_url, listings: item.listings || [], identity: item.identity || null, provenance_checked_at: new Date().toISOString() } }).select("id").single();
        if (result.error) throw result.error; source = result.data;
      }
      let { data: job } = await supabase.from("import_jobs").select("id").eq("source_id", source.id).maybeSingle();
      if (!job) {
        const result = await supabase.from("import_jobs").insert({ user_id: student.id, subject_id: subject.id, source_id: source.id, exam_key: `ecz_grade_${item.grade}`,
          status: "queued", total_chunks: 1, completed_chunks: 0 }).select("id").single();
        if (result.error) throw result.error; job = result.data;
        const chunk = await supabase.from("import_chunks").insert({ job_id: job.id, chunk_index: 0, content: "", mime_type: "application/pdf", status: "queued" });
        if (chunk.error) throw chunk.error;
      }
      await supabase.from("corpus_import_events").insert({ user_id: student.id, source_id: source.id, corpus_key: item.corpus_key, stage: "registered", detail: { job_id: job.id } });
      manifest.documents[index] = { ...item, status: "registered", user_id: student.id, subject_id: subject.id, source_id: source.id, job_id: job.id, storage_path: storagePath };
      completed += 1; log("registered", item.corpus_key);
    } catch (error) { manifest.documents[index] = { ...item, error: `register: ${error.message}` }; log("registration failed", { key: item.corpus_key, error: error.message }); }
    await writeManifest(manifest);
  }
}

function registerPlan(manifest, latest, includeNew, accountSubjects, students) {
  const plan = {};
  for (const item of manifest.documents) {
    if (!selected(item) || !registrable(item, includeNew)) continue;
    if (latest && item.document_kind === "question_paper" && !latest.has(item.file_id)) continue;
    const subjectName = targetSubject(item, accountSubjects[item.grade]);
    if (!subjectName) continue;
    const bucket = ((plan[`${students[item.grade].display_name} (Grade ${item.grade})`] ||= {})[subjectName] ||= []);
    bucket.push(item.document_kind === "syllabus" ? `syllabus: ${CURRICULA[item.curriculum]?.label}` : item.title.replace(/^ECZ Grade \d+ /, ""));
  }
  console.log(JSON.stringify(plan, null, 2));
}

function fingerprint(question, item) {
  const canonical = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/^\s*(?:question\s*)?\d+[a-z]?(?:\s*[.):\-]|\s+)+/i, "")
    .replace(/\[?(\d+)\s*marks?\]?$/i, "").replace(/[^\p{L}\p{N}+=/\-]+/gu, " ").replace(/\s+/g, " ").trim();
  // A question that depends on a figure is only identified by its wording when that wording is specific;
  // generic prompts ("Which one comes next?") are told apart by where they appear.
  const position = question.requires_figure && canonical(question.prompt).length < 80 && item ? `${item.corpus_key}#${question.sequence_order}` : "";
  return crypto.createHash("sha256").update([canonical(question.question_type), canonical(question.prompt), ...(question.choices || []).map((choice) => canonical(choice.text)), position].join("|")).digest("hex");
}

function validateDraft(draft, item) {
  const errors = []; const warnings = [];
  if (!Array.isArray(draft.sections) || !Array.isArray(draft.questions)) { errors.push("Malformed extraction result"); return { errors, warnings }; }
  if (item.document_kind === "question_paper" && draft.questions.length < 3) errors.push("Fewer than three questions were extracted");
  // Lite models sometimes stop after the first page; the last question should sit near the end of the paper.
  const lastPage = Math.max(0, ...draft.questions.map((question) => Number(question.page_number) || 0));
  if (item.document_kind === "question_paper" && item.pages > 3 && lastPage && lastPage < Math.ceil(item.pages * 0.6)) errors.push(`Extraction stopped at page ${lastPage} of ${item.pages}`);
  if (item.grade === "7" && item.document_kind === "question_paper") {
    const mcq = draft.questions.filter((question) => question.question_type === "multiple_choice");
    if (mcq.length < draft.questions.length * 0.8) warnings.push("Grade 7 composite papers are multiple choice, but many extracted questions are not");
    if (draft.questions.length < 30) warnings.push(`Only ${draft.questions.length} questions extracted; Grade 7 papers usually have 50-60`);
  }
  const seenOrder = new Set();
  for (const question of draft.questions) {
    if (question.question_type === "essay" && !ESSAY_SUBJECTS.test(item.subject)) question.question_type = "free_response";
    if (!String(question.prompt || "").trim()) errors.push("A question has no prompt");
    if (question.question_type === "multiple_choice" && (question.choices || []).length < 2) errors.push(`Question ${question.sequence_order} is multiple choice without choices`);
    if (seenOrder.has(question.sequence_order)) warnings.push(`Repeated sequence order ${question.sequence_order}`); seenOrder.add(question.sequence_order);
    if (Number(question.confidence || 0) < 0.7 || question.needs_review) warnings.push(`Question ${question.sequence_order} needs review`);
    if (question.page_number && item.pages && question.page_number > item.pages) warnings.push(`Question ${question.sequence_order} cites page ${question.page_number} of ${item.pages}`);
    question.year = item.year; question.points = Math.max(1, Number(question.points || 1)); question.sequence_order = Number(question.sequence_order || 0);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

// Errors and structural warnings hold a paper for review; a few uncertain questions do not,
// because each one keeps its own needs_review flag.
function needsHumanReview(validation, draft) {
  if (validation.errors.length) return true;
  const flagged = validation.warnings.filter((warning) => /needs review$/.test(warning)).length;
  if (validation.warnings.length > flagged) return true;
  // Diagram- or specimen-dependent questions are often flagged at ~0.8 with clean text; only low confidence counts.
  const uncertain = (draft.questions || []).filter((question) => Number(question.confidence || 0) < 0.75).length;
  return uncertain > Math.max(1, (draft.questions || []).length * 0.1);
}

// Approves stored drafts that pass the review rule, without calling Gemini again.
async function approveStored() {
  const supabase = adminClient(); const manifest = await readManifest();
  for (const [index, item] of manifest.documents.entries()) {
    if (!selected(item) || item.status !== "processed") continue;
    const { data: job, error } = await supabase.from("import_jobs").select("draft").eq("id", item.job_id).single();
    if (error) { log("approve skipped", { key: item.corpus_key, error: error.message }); continue; }
    const draft = job.draft; const validation = validateDraft(draft, item);
    if (needsHumanReview(validation, draft)) { log("still needs review", { key: item.corpus_key, validation }); continue; }
    const result = await approveDraft(supabase, { ...item }, draft);
    await supabase.from("import_jobs").update({ status: "approved" }).eq("id", item.job_id);
    const { data: sourceRow } = await supabase.from("content_sources").select("metadata").eq("id", item.source_id).single();
    await supabase.from("content_sources").update({ status: "ready", metadata: { ...(sourceRow?.metadata || {}), validation, ...result } }).eq("id", item.source_id);
    await supabase.from("corpus_import_events").insert({ user_id: item.user_id, source_id: item.source_id, corpus_key: item.corpus_key, stage: "approved", detail: { validation, result } });
    manifest.documents[index] = { ...item, status: "approved", validation, approval_result: result };
    await writeManifest(manifest); log("approved", { key: item.corpus_key, ...result });
  }
}

function extractionPrompt(item, sectionContext) {
  const format = item.grade === "7"
    ? "Format: ECZ Grade 7 composite papers are multiple choice (usually 50-60 items, options A-D). Record the option keys exactly as printed."
    : `Format: ECZ Grade 12 ${SESSION_LABELS[item.session] || ""} paper ${item.paper}. Keep sections (A/B/C), structured sub-questions (a)(b)(i)(ii) and marks as printed; use question_type=essay only for extended prose answers (compositions, essays, letters); calculations, structured and short answers are free_response. Essay questions get a rubric built only from printed mark allocations.`;
  const instruction = item.document_kind === "syllabus"
    ? "Map only the supplied official syllabus into curriculum sections. Make one section per topic or unit in syllabus order (for example \"10.2 Cell Structure and Organisation\"), never one section per grade or term; put that unit's sub-topics (and key specific outcomes, briefly) in topics, and a one-sentence summary in description. Cover every unit for all grades in the document. Do not invent questions. Return an empty questions array." + (item.grade === "7" ? " This learner sits the Grade 7 Primary School Leaving Examination: include only Grade 5, 6 and 7 units, and prefix each title with its grade, for example \"G6 · Fractions\". When the document covers several languages, describe the units once for all languages." : "")
    : `The attached past paper is the only source of question wording. Transcribe every visible question exactly, including subparts, choices, marks and original order. Never invent, paraphrase, complete or fetch question wording. If text is unreadable, keep the readable part and set needs_review=true. Leave answer/accepted_answers blank unless an answer key is printed; separately, work out the correct answer yourself in worked_answer (option key for multiple choice) with worked_explanation and worked_confidence, using the figure when needed. For each question give page_number (1-based PDF page where it starts) and requires_figure=true when it depends on a diagram, map, graph, table, picture or reading passage. When questions share a passage or figure, start the first prompt of the group with the shared instruction text. ${format}${hasFlag("skip-passages") ? " Do not transcribe reading passages, poems or summary texts themselves; transcribe only the questions, refer to the passage by its title or number, and set requires_figure=true with the passage's page_number so the learner reads it from the original page." : ""}`;
  return `You are StudyPal's evidence-first ECZ parser. Context: Examinations Council of Zambia; Grade ${item.grade}; ${item.subject}; ${item.year || "syllabus"}; ${SESSION_LABELS[item.session] || item.session}; paper ${item.paper || "n/a"}; variant ${item.variant}. ${instruction}\n${sectionContext ? `Syllabus sections for tagging only (never a source of question wording). Set section_title to the one title from this list that the question assesses, copied exactly, and put the printed paper part (Section A, B...) in paper_part. Return an empty sections array.
${sectionContext}` : ""}\nReturn only JSON matching the schema. Preserve source order. Use confidence 0..1.`;
}

// Exact title first, then the closest syllabus unit by shared words with the question's topic.
function matchSection(question, sections, sectionMap) {
  const exact = sectionMap.get(String(question.section_title || "").toLowerCase().trim());
  if (exact) return exact;
  const words = (value) => new Set(String(value || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((word) => word.length > 3));
  const wanted = words(`${question.section_title} ${question.topic}`);
  let best = null; let bestScore = 0;
  for (const row of sections) {
    const have = words(`${row.title} ${(row.topics || []).join(" ")}`);
    const score = [...wanted].filter((word) => have.has(word)).length;
    if (score > bestScore) { best = row.id; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

// "(b)", "B.", " b " -> "B"
function optionKey(value) { return String(value || "").replace(/[().\s]/g, "").toUpperCase(); }

async function approveDraft(supabase, item, draft) {
  const { data: existingSections, error: sectionReadError } = await supabase.from("curriculum_sections").select("id, title, topics").eq("user_id", item.user_id).eq("subject_id", item.subject_id);
  if (sectionReadError) throw sectionReadError;
  const sectionMap = new Map((existingSections || []).map((row) => [row.title.toLowerCase(), row.id]));
  // Only syllabi define sections; a paper's "Section A" is a paper part, not a topic.
  for (const section of item.document_kind === "syllabus" ? draft.sections || [] : []) {
    const key = String(section.title || "General").toLowerCase(); if (sectionMap.has(key)) continue;
    const { data, error } = await supabase.from("curriculum_sections").insert({ user_id: item.user_id, subject_id: item.subject_id, title: String(section.title || "General").slice(0, 180),
      description: section.description || null, topics: section.topics || [], position: sectionMap.size, metadata: { imported_from: item.corpus_key, curriculum: item.curriculum || null } }).select("id").single();
    if (error) throw error; sectionMap.set(key, data.id);
  }
  let saved = 0; let repeated = 0; let aiKeyed = 0;
  for (const question of draft.questions || []) {
    const questionFingerprint = fingerprint(question, item);
    const printedAnswer = Boolean(String(question.answer || "").trim()) || (question.accepted_answers || []).length > 0;
    const workedKey = optionKey(question.worked_answer);
    const workedChoice = question.question_type === "multiple_choice" && workedKey ? (question.choices || []).find((choice) => optionKey(choice.key) === workedKey) : null;
    const useWorked = !printedAnswer && Boolean(workedChoice) && Number(question.worked_confidence || 0) >= 0.75;
    if (useWorked) { question.answer = workedChoice.key; aiKeyed += 1; }
    const answerSource = printedAnswer ? "printed" : useWorked ? "ai_worked" : "none";
    const modelAnswer = question.question_type !== "multiple_choice" && question.worked_answer ? `Model answer (AI-worked): ${question.worked_answer}\n` : "";
    const explanation = question.explanation || (question.worked_explanation || modelAnswer ? `${modelAnswer}${question.worked_explanation || ""}`.trim() : null);
    const { data: existing, error: lookupError } = await supabase.from("questions").select("id, appearance_count").eq("user_id", item.user_id).eq("subject_id", item.subject_id).eq("question_fingerprint", questionFingerprint).maybeSingle();
    if (lookupError) throw lookupError;
    let questionId;
    const source = { source_id: item.source_id, storage_path: item.storage_path, page_number: question.page_number || null, requires_figure: Boolean(question.requires_figure) };
    if (existing) {
      const count = Number(existing.appearance_count || 1) + 1; questionId = existing.id; repeated += 1;
      const update = await supabase.from("questions").update({ appearance_count: count, relevance_score: Math.round((1 + Math.log2(count + 1)) * 1000) / 1000, last_seen_at: new Date().toISOString() }).eq("id", existing.id);
      if (update.error) throw update.error;
    } else {
      const { data, error } = await supabase.from("questions").insert({ user_id: item.user_id, subject_id: item.subject_id,
        section_id: matchSection(question, existingSections || [], sectionMap), source_id: item.source_id,
        question_type: question.question_type || "free_response", prompt: question.prompt, choices: question.choices || [],
        answer: question.question_type === "fill_blank" && question.accepted_answers?.length ? question.accepted_answers : question.answer || "",
        explanation, points: question.points, year: item.year, topic: question.topic || null,
        difficulty: question.difficulty || "standard", sequence_order: question.sequence_order, question_fingerprint: questionFingerprint,
        appearance_count: 1, relevance_score: 1, rubric: question.rubric || null,
        metadata: { needs_review: Boolean(question.needs_review), confidence: question.confidence, corpus_key: item.corpus_key, session: item.session,
          paper: item.paper, paper_part: question.paper_part || null, variant: item.variant, answer_source: answerSource, worked_confidence: question.worked_confidence ?? null, source_page: source.page_number, requires_figure: source.requires_figure, source_storage_path: item.storage_path } }).select("id").single();
      if (error) throw error; questionId = data.id; saved += 1;
    }
    const occurrence = await supabase.from("question_occurrences").upsert({ user_id: item.user_id, question_id: questionId, source_id: item.source_id,
      sequence_order: question.sequence_order, year: item.year, points: question.points, source_label: item.title }, { onConflict: "question_id,source_id,sequence_order", ignoreDuplicates: true });
    if (occurrence.error) throw occurrence.error;
  }
  return { saved, repeated, ai_keyed: aiKeyed, sections: sectionMap.size };
}

async function processJobs() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required to extract questions.");
  const supabase = adminClient(); const manifest = await readManifest(); const limit = Number(arg("limit", "5")); const shouldApprove = hasFlag("approve"); let completed = 0;
  // Syllabi first so their sections exist when papers are tagged.
  const order = manifest.documents.map((item, index) => ({ item, index }))
    .sort((a, b) => Number(b.item.document_kind === "syllabus") - Number(a.item.document_kind === "syllabus"));
  for (const { item, index } of order) {
    if (!selected(item) || item.status !== "registered" || item.document_kind === "marking_scheme") continue;
    if (limit && completed >= limit) break;
    try {
      const buffer = await fs.readFile(path.join(ROOT, item.local_path));
      const { data: sectionRows } = await supabase.from("curriculum_sections").select("title, topics").eq("user_id", item.user_id).eq("subject_id", item.subject_id).limit(80);
      const sectionContext = (sectionRows || []).map((row) => `- ${row.title} (${(row.topics || []).slice(0, 6).join(", ")})`).join("\n").slice(0, 12000);
      const filePart = await geminiFilePart(buffer);
      let model = EXTRACT_MODEL();
      let draft = await geminiJson(extractionPrompt(item, sectionContext), filePart, EXTRACTION_SCHEMA, "low", 600_000, model);
      let validation = validateDraft(draft, item);
      // Lite models occasionally stop after the first item; retry once on a stronger model.
      if (item.document_kind === "question_paper" && validation.errors.some((error) => /Fewer than three|Extraction stopped/.test(error)) && FALLBACK_MODEL() !== model) {
        model = FALLBACK_MODEL(); log("retrying with fallback model", { key: item.corpus_key, model });
        draft = await geminiJson(extractionPrompt(item, sectionContext), filePart, EXTRACTION_SCHEMA, "low", 600_000, model);
        validation = validateDraft(draft, item);
      }
      const reviewRequired = needsHumanReview(validation, draft);
      await supabase.from("import_chunks").update({ status: "done" }).eq("job_id", item.job_id);
      await supabase.from("import_jobs").update({ status: "review", completed_chunks: 1, draft, error: validation.errors.length ? validation.errors.join("; ") : null,
        updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq("id", item.job_id);
      let result = null; let status = "processed";
      const { data: sourceRow } = await supabase.from("content_sources").select("metadata").eq("id", item.source_id).single();
      const baseMetadata = sourceRow?.metadata || {};
      if (shouldApprove && !reviewRequired) {
        result = await approveDraft(supabase, item, draft); status = "approved";
        await supabase.from("import_jobs").update({ status: "approved" }).eq("id", item.job_id);
        await supabase.from("content_sources").update({ status: "ready", metadata: { ...baseMetadata, validation, ...result, model } }).eq("id", item.source_id);
      } else await supabase.from("content_sources").update({ status: "ready", metadata: { ...baseMetadata, validation, extracted_questions: draft.questions?.length || 0, model } }).eq("id", item.source_id);
      await supabase.from("corpus_import_events").insert({ user_id: item.user_id, source_id: item.source_id, corpus_key: item.corpus_key, stage: status, detail: { validation, result } });
      manifest.documents[index] = { ...item, status, validation, extracted_questions: draft.questions?.length || 0, approval_result: result };
      completed += 1; log(status, { key: item.corpus_key, questions: draft.questions?.length || 0, errors: validation.errors, warnings: validation.warnings.length });
    } catch (error) {
      if (error instanceof QuotaExhausted) { log("stopped early", error.message); process.exitCode = 2; break; }
      await supabase.from("import_jobs").update({ status: "failed", error: error.message, updated_at: new Date().toISOString() }).eq("id", item.job_id);
      await supabase.from("corpus_import_events").insert({ user_id: item.user_id, source_id: item.source_id, corpus_key: item.corpus_key, stage: "failed", detail: { error: error.message } });
      manifest.documents[index] = { ...item, error: `process: ${error.message}` }; log("processing failed", { key: item.corpus_key, error: error.message });
    }
    await writeManifest(manifest);
    const delay = Number(arg("delay-ms", "1200")); if (delay) await sleep(delay);
  }
}

async function audit() {
  const manifest = await readManifest(); const documents = manifest.documents.filter(selected);
  const live = documents.filter((item) => ["verified", "registered", "processed", "approved"].includes(item.status));
  const keyCounts = new Map(); for (const item of live) keyCounts.set(item.corpus_key, (keyCounts.get(item.corpus_key) || 0) + 1);
  const identityDuplicates = [...keyCounts.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count }));
  const hashGroups = new Map(); for (const item of live) { const rows = hashGroups.get(item.content_hash) || []; rows.push(item.corpus_key); hashGroups.set(item.content_hash, rows); }
  const contentDuplicates = [...hashGroups.entries()].filter(([, keys]) => new Set(keys).size !== keys.length || (keys.length > 1 && !live.some((row) => row.document_kind === "syllabus" && keys.includes(row.corpus_key))))
    .map(([hash, keys]) => ({ hash, keys }));
  const tally = (rows, key) => rows.reduce((acc, row) => { const value = key(row); acc[value] = (acc[value] || 0) + 1; return acc; }, {});
  // Coverage grid: subject x year, listing the sessions/papers held.
  const coverage = {};
  for (const item of live.filter((row) => row.document_kind === "question_paper")) {
    const subjectRow = (coverage[`Grade ${item.grade}`] ||= {})[item.subject] ||= {};
    const cell = subjectRow[item.year] ||= [];
    cell.push(item.grade === "7" ? (item.variant === "standard" ? "paper" : item.variant) : `${item.session === "gce" ? "GCE" : "SC"} P${item.paper}${item.variant === "standard" ? "" : ` ${item.variant}`}`);
  }
  for (const grade of Object.values(coverage)) for (const subject of Object.values(grade)) for (const year of Object.keys(subject)) subject[year] = subject[year].sort().join(", ");
  const syllabi = live.filter((row) => row.document_kind === "syllabus").map((row) => `${row.grade}: ${row.subject} [${row.curriculum}]`).sort();
  const report = { generated_at: new Date().toISOString(), total_files: documents.length, byStatus: tally(documents, (row) => row.status),
    live_by_grade_kind: tally(live, (row) => `${row.grade}:${row.document_kind}`), live_by_year: tally(live.filter((row) => row.year), (row) => `${row.grade}:${row.year}`),
    identityDuplicates, contentDuplicates, corrected_by_cover: live.filter((row) => row.identity?.corrections?.length).map((row) => ({ key: row.corpus_key, label: row.label, corrections: row.identity.corrections })),
    rejected: documents.filter((row) => row.status === "rejected").map((row) => ({ label: row.label, key: row.label_identity || row.corpus_key, reason: row.rejected_reason })),
    failures: documents.filter((row) => row.error).map((row) => ({ key: row.corpus_key, status: row.status, error: row.error })),
    reviewRequired: documents.filter((row) => row.validation?.errors?.length || row.validation?.warnings?.length).map((row) => ({ key: row.corpus_key, validation: row.validation })),
    syllabi, coverage };
  await fs.mkdir(WORK_DIR, { recursive: true }); await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  log("audit complete", { path: REPORT_PATH, total_files: report.total_files, byStatus: report.byStatus, live: report.live_by_grade_kind, identityDuplicates: identityDuplicates.length, contentDuplicates: contentDuplicates.length, failures: report.failures.length });
}

async function main() {
  await loadEnv(); await fs.mkdir(WORK_DIR, { recursive: true });
  const command = process.argv[2];
  if (command === "discover") return discover();
  if (command === "download") return download();
  if (command === "verify") return verify();
  if (command === "register") return register();
  if (command === "process") return processJobs();
  if (command === "audit") return audit();
  if (command === "approve") return approveStored();
  throw new Error("Usage: node scripts/ecz-corpus.mjs <discover|download|verify|register|process|audit> [--grade=7|12] [--kind=question_paper|syllabus] [--subject=...] [--year=YYYY] [--limit=N] [--concurrency=N] [--approve]");
}

export { matchSection, fingerprint, paperTitle, extractionPrompt, EXTRACTION_SCHEMA, validateDraft, latestSet, latestCandidates, loadEnv, geminiJson, geminiFilePart, firstPages, IDENTITY_PROMPT, IDENTITY_SCHEMA, syllabusSubject, audit, canonicalSubject, discover, download, paperKey, parsePaper, parseSyllabus, register, resolveIdentity, processJobs, verify };

if (process.argv[1] && path.basename(process.argv[1]) === "ecz-corpus.mjs") {
  main().catch((error) => { console.error(`[ecz-corpus] ${error.stack || error.message}`); process.exitCode = 1; });
}
