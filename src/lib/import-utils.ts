import crypto from "node:crypto";

export const extractionSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          topics: { type: "array", items: { type: "string" } },
        },
        required: ["title", "description", "topics"],
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section_title: { type: "string" },
          question_type: { type: "string", enum: ["multiple_choice", "fill_blank", "free_response", "essay"] },
          prompt: { type: "string" },
          choices: { type: "array", items: { type: "object", properties: { key: { type: "string" }, text: { type: "string" } }, required: ["key", "text"] } },
          answer: { type: "string" },
          accepted_answers: { type: "array", items: { type: "string" } },
          explanation: { type: "string" },
          points: { type: "integer" },
          year: { type: ["integer", "null"], description: "The year printed on the source, or null when not visible." },
          topic: { type: "string" },
          difficulty: { type: "string", enum: ["introductory", "standard", "challenging"] },
          sequence_order: { type: "integer" },
          needs_review: { type: "boolean" },
          confidence: { type: "number" },
          rubric: {
            type: ["object", "null"],
            properties: {
              criteria: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    points: { type: "number" },
                  },
                  required: ["name", "description", "points"],
                },
              },
              total_points: { type: "number" },
            },
            required: ["criteria", "total_points"],
          },
        },
        required: ["section_title", "question_type", "prompt", "choices", "answer", "accepted_answers", "explanation", "points", "year", "topic", "difficulty", "sequence_order", "needs_review", "confidence"],
      },
    },
  },
  required: ["title", "sections", "questions"],
};

export type ImportQuestion = {
  section_title: string;
  question_type: "multiple_choice" | "fill_blank" | "free_response" | "essay";
  prompt: string;
  choices: { key: string; text: string }[];
  answer: string;
  accepted_answers: string[];
  explanation: string;
  points: number;
  year: number | null;
  topic: string;
  difficulty: "introductory" | "standard" | "challenging";
  sequence_order: number;
  needs_review: boolean;
  confidence: number;
  rubric?: Record<string, unknown>;
};

export type ImportDraft = { title: string; sections: { title: string; description: string; topics: string[] }[]; questions: ImportQuestion[] };

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

export const SUPPORTED_UPLOAD_EXTENSIONS = [
  ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff",
  ".docx", ".doc", ".txt", ".md", ".rtf", ".odt", ".pptx", ".ppt",
  ".xlsx", ".xls", ".csv",
];

export function isSupportedUpload(fileName: string, mimeType = "") {
  const lower = fileName.toLowerCase();
  return SUPPORTED_UPLOAD_EXTENSIONS.some((extension) => lower.endsWith(extension)) ||
    mimeType.startsWith("image/") || mimeType.startsWith("text/") || mimeType === "application/pdf";
}

export function shouldProcessAsDocument(fileName: string, mimeType: string, extractedText: string) {
  const lower = fileName.toLowerCase();
  return mimeType === "application/pdf" || mimeType.startsWith("image/") ||
    (!extractedText.trim() && !lower.endsWith(".txt") && !lower.endsWith(".md") && !lower.endsWith(".csv"));
}

export function splitIntoChunks(input: string, maxLength = 12000) {
  const text = input.replace(/\r\n/g, "\n").trim();
  if (!text) return [""];
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (!current) current = paragraph;
    else if ((current.length + paragraph.length + 2) <= maxLength) current += `\n\n${paragraph}`;
    else { chunks.push(current); current = paragraph; }
  }
  if (current) chunks.push(current);
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxLength) return [chunk];
    return chunk.match(new RegExp(`.{1,${maxLength}}`, "gs")) || [chunk];
  });
}

export function questionFingerprint(question: Pick<ImportQuestion, "prompt" | "question_type" | "choices">) {
  const canonical = (value: string) => value.normalize("NFKC").toLowerCase()
    .replace(/^\s*(?:question\s*)?\d+[a-z]?(?:\s*[.):\-]|\s+)+/i, "")
    .replace(/[[(]\s*\d+\s*marks?\s*[\])]\s*$/i, "")
    .replace(/[^\p{L}\p{N}+\-=/]+/gu, " ").replace(/\s+/g, " ").trim();
  const normalized = [canonical(question.question_type), canonical(question.prompt), ...(question.choices || []).map((choice) => canonical(choice.text))].join("|");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function parseModelJson(text: string) {
  const clean = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(clean) as Partial<ImportDraft>;
}

export function normalizeDraft(value: Partial<ImportDraft>, sequenceOffset = 0): ImportDraft {
  const sections = Array.isArray(value.sections) ? value.sections : [];
  const questions = Array.isArray(value.questions) ? value.questions : [];
  return {
    title: String(value.title || "Imported study material").slice(0, 180),
    sections: sections.map((section) => ({ title: String(section.title || "General section").slice(0, 180), description: String(section.description || ""), topics: Array.isArray(section.topics) ? section.topics.map(String).slice(0, 30) : [] })),
    questions: questions.filter((question) => String(question.prompt || "").trim()).map((question, index) => ({
      section_title: String(question.section_title || "General section"),
      question_type: ["multiple_choice", "fill_blank", "free_response", "essay"].includes(String(question.question_type)) ? question.question_type as ImportQuestion["question_type"] : "free_response",
      prompt: String(question.prompt).trim(), choices: Array.isArray(question.choices) ? question.choices : [], answer: String(question.answer || ""), accepted_answers: Array.isArray(question.accepted_answers) ? question.accepted_answers.map(String) : [], explanation: String(question.explanation || ""), points: Math.max(1, Number(question.points || 1)), year: Number.isFinite(Number(question.year)) && Number(question.year) > 0 ? Number(question.year) : null, topic: String(question.topic || ""), difficulty: ["introductory", "standard", "challenging"].includes(String(question.difficulty)) ? question.difficulty as ImportQuestion["difficulty"] : "standard", sequence_order: Number.isFinite(Number(question.sequence_order)) ? Number(question.sequence_order) + sequenceOffset : index + sequenceOffset, needs_review: Boolean(question.needs_review), confidence: Math.min(1, Math.max(0, Number(question.confidence ?? 0.7))), rubric: question.rubric,
    })),
  };
}

export async function extractFileText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt") || file.name.toLowerCase().endsWith(".md")) return { text: buffer.toString("utf8"), buffer };
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfModule = await import("pdf-parse") as unknown as { PDFParse: new (options: { data: Buffer }) => { getText: () => Promise<{ text: string }>; destroy: () => Promise<void> } };
    const parser = new pdfModule.PDFParse({ data: buffer });
    try { return { text: (await parser.getText()).text, buffer }; }
    finally { await parser.destroy(); }
  }
  if (file.name.toLowerCase().endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    return { text: (await mammoth.extractRawText({ buffer })).value, buffer };
  }
  return { text: "", buffer };
}

type GeminiFile = { mimeType: string; data: string };

function geminiErrorMessage(status: number, payload: unknown) {
  const raw = typeof payload === "object" && payload && "error" in payload
    ? String((payload as { error?: { message?: string } }).error?.message || "")
    : "";
  if (status === 400) return `Gemini rejected this file or request${raw ? `: ${raw}` : "."}`;
  if (status === 401 || status === 403) return "The Gemini API key is missing, invalid, or does not have access to this model.";
  if (status === 413) return "This document is too large for one Gemini request.";
  if (status === 429) return "Gemini is busy or the project has reached its quota. Wait a moment, then retry.";
  return `Gemini could not process this material (HTTP ${status})${raw ? `: ${raw}` : "."}`;
}

export async function callGemini(prompt: string, file?: GeminiFile, useSearch = false) {
  if (!process.env.GEMINI_API_KEY) throw new Error("AI importing is not configured yet.");
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [{ text: prompt }];
  if (file) parts.push({ inlineData: file });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts }],
      ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
      generationConfig: {
        responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: extractionSchema } },
        thinkingConfig: { thinkingLevel: "low" },
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(geminiErrorMessage(response.status, payload));
  const text = payload.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "";
  if (!text.trim()) throw new Error("Gemini returned no extractable content for this file.");
  return normalizeDraft(parseModelJson(text));
}
