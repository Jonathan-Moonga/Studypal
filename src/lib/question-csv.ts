// Ready-made quiz questions imported from a CSV file (one row per question).
// The column set is documented in QUESTION_CSV_COLUMNS and mirrored by the Gemini prompt.

export const QUESTION_CSV_COLUMNS = [
  "paper", "year", "number", "order", "section", "topic", "type", "question",
  "option_a", "option_b", "option_c", "option_d", "option_e",
  "answer", "explanation", "marks", "difficulty", "diagram", "diagram_description",
] as const;

export type CsvQuestionType = "multiple_choice" | "short_answer" | "structured" | "essay";

export type ParsedQuestion = {
  row: number;
  paper: string;
  year: number | null;
  number: string;
  order: number;
  section: string;
  topic: string;
  type: CsvQuestionType;
  prompt: string;
  choices: { key: string; text: string }[];
  answer: string;
  acceptedAnswers: string[];
  explanation: string;
  marks: number;
  difficulty: "introductory" | "standard" | "challenging";
  diagram: { kind: "image"; file: string } | { kind: "page"; page: number } | null;
  diagramDescription: string;
};

export type RowError = { row: number; message: string };

// RFC 4180 CSV: quoted fields may contain commas, quotes ("") and line breaks.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

const TYPE_ALIASES: Record<string, CsvQuestionType> = {
  multiple_choice: "multiple_choice", mcq: "multiple_choice", "multiple choice": "multiple_choice",
  short_answer: "short_answer", "short answer": "short_answer", fill_blank: "short_answer", "fill in the blank": "short_answer",
  structured: "structured", free_response: "structured", calculation: "structured", "long answer": "structured",
  essay: "essay", composition: "essay",
};

const DIFFICULTY: Record<string, ParsedQuestion["difficulty"]> = {
  easy: "introductory", introductory: "introductory", medium: "standard", standard: "standard", hard: "challenging", challenging: "challenging",
};

const OPTION_COLUMNS = ["option_a", "option_b", "option_c", "option_d", "option_e"] as const;

export function parseQuestionCsv(text: string): { questions: ParsedQuestion[]; errors: RowError[] } {
  const rows = parseCsv(text);
  const errors: RowError[] = [];
  if (rows.length < 2) return { questions: [], errors: [{ row: 1, message: "The file has no question rows." }] };
  const header = rows[0].map((name) => name.trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = ["question", "type"].filter((name) => !header.includes(name));
  if (missing.length) return { questions: [], errors: [{ row: 1, message: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Use the template header.` }] };
  const questions: ParsedQuestion[] = [];
  rows.slice(1).forEach((values, offset) => {
    const row = offset + 2;
    const cell = (name: string) => String(values[header.indexOf(name)] ?? "").trim();
    const prompt = cell("question");
    const type = TYPE_ALIASES[cell("type").toLowerCase()];
    if (!prompt) { errors.push({ row, message: "The question text is empty." }); return; }
    if (!type) { errors.push({ row, message: `Unknown type "${cell("type")}". Use multiple_choice, short_answer, structured or essay.` }); return; }
    const choices = OPTION_COLUMNS.map((name, index) => ({ key: String.fromCharCode(65 + index), text: cell(name) })).filter((choice) => choice.text);
    let answer = cell("answer");
    if (type === "multiple_choice") {
      if (choices.length < 2) { errors.push({ row, message: "Multiple choice questions need at least two options (option_a, option_b...)." }); return; }
      const letter = answer.replace(/[().\s]/g, "").toUpperCase();
      const byText = choices.find((choice) => choice.text.toLowerCase() === answer.toLowerCase());
      if (choices.some((choice) => choice.key === letter)) answer = letter;
      else if (byText) answer = byText.key;
      else if (answer) { errors.push({ row, message: `The answer "${answer}" is not one of the option letters.` }); return; }
    }
    const diagramCell = cell("diagram");
    const page = diagramCell.match(/^page\s*:?\s*(\d+)$/i);
    const diagram = !diagramCell ? null : page ? { kind: "page" as const, page: Number(page[1]) } : { kind: "image" as const, file: diagramCell };
    const order = Number(cell("order"));
    const marks = Number(cell("marks"));
    const year = Number(cell("year"));
    questions.push({
      row, paper: cell("paper"), year: Number.isInteger(year) && year > 1900 ? year : null, number: cell("number"),
      order: Number.isFinite(order) && cell("order") !== "" ? order : row - 1, section: cell("section"), topic: cell("topic"), type, prompt,
      choices: type === "multiple_choice" ? choices : [], answer,
      acceptedAnswers: type === "short_answer" ? answer.split("|").map((value) => value.trim()).filter(Boolean) : [],
      explanation: cell("explanation"), marks: Number.isFinite(marks) && marks > 0 ? Math.round(marks) : 1,
      difficulty: DIFFICULTY[cell("difficulty").toLowerCase()] || "standard", diagram, diagramDescription: cell("diagram_description"),
    });
  });
  return { questions, errors };
}

// Exact title, then title without a "G7 · " prefix, then the section sharing the most words.
export function matchSectionId(question: Pick<ParsedQuestion, "section" | "topic">, sections: { id: string; title: string; topics: string[] | null }[]) {
  const clean = (value: string) => value.toLowerCase().replace(/^g\d+\s*·\s*/, "").replace(/^\d+(\.\d+)*\s*/, "").trim();
  const wanted = clean(question.section);
  if (wanted) {
    const exact = sections.find((section) => section.title.toLowerCase() === question.section.toLowerCase() || clean(section.title) === wanted);
    if (exact) return exact.id;
  }
  const words = (value: string) => new Set(value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((word) => word.length > 3));
  const target = words(`${question.section} ${question.topic}`);
  let best: string | null = null;
  let bestScore = 0;
  for (const section of sections) {
    const have = words(`${section.title} ${(section.topics || []).join(" ")}`);
    const score = [...target].filter((word) => have.has(word)).length;
    if (score > bestScore) { best = section.id; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

export function csvTemplate() {
  const example = [
    ["ECZ Grade 7 Mathematics 2025", "2025", "1", "1", "G7 · Number patterns", "Sequences", "multiple_choice", "Find the next number in the sequence 20, 23, 26, ...", "27", "29", "30", "31", "", "B", "The numbers increase by 3, so 26 + 3 = 29.", "1", "easy", "", ""],
    ["ECZ Grade 12 Mathematics 2024 GCE Paper 2", "2024", "3(b)(ii)", "7", "Mensuration", "Volume of a cone", "structured", "The figure shows a cone of radius 2 cm and height 3 cm. Calculate its volume. [Take π = 3.14]", "", "", "", "", "", "12.56 cm³", "V = ⅓πr²h = ⅓ × 3.14 × 2² × 3 = 12.56 cm³", "3", "medium", "cone.png", "A right circular cone with radius 2 cm and height 3 cm."],
  ];
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return [QUESTION_CSV_COLUMNS.join(","), ...example.map((row) => row.map(escape).join(","))].join("\n");
}
