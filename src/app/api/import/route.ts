import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const extractionSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "A concise title for this source." },
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
          question_type: { type: "string", enum: ["multiple_choice", "fill_blank", "free_response"] },
          prompt: { type: "string" },
          choices: { type: "array", items: { type: "object", properties: { key: { type: "string" }, text: { type: "string" } }, required: ["key", "text"] } },
          answer: { type: "string" },
          accepted_answers: { type: "array", items: { type: "string" } },
          explanation: { type: "string" },
          points: { type: "integer" },
          year: { type: "integer" },
          topic: { type: "string" },
          difficulty: { type: "string", enum: ["introductory", "standard", "challenging"] },
          sequence_order: { type: "integer" },
        },
        required: ["section_title", "question_type", "prompt", "choices", "answer", "accepted_answers", "explanation", "points", "year", "topic", "difficulty", "sequence_order"],
      },
    },
  },
  required: ["title", "sections", "questions"],
};

function parseModelJson(text: string) {
  const clean = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(clean);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in before importing study material." }, { status: 401 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "AI importing is not configured yet. Add GEMINI_API_KEY to the server environment." }, { status: 503 });

  const body = await request.json();
  const sourceType = body.sourceType as "syllabus" | "past_paper" | "textbook";
  const subjectId = String(body.subjectId || "");
  const rawText = String(body.text || "").trim();
  if (!subjectId || !["syllabus", "past_paper", "textbook"].includes(sourceType) || rawText.length < 30) return NextResponse.json({ error: "Choose a source type and paste at least a short piece of study material." }, { status: 400 });
  if (rawText.length > 120000) return NextResponse.json({ error: "That paste is too large for one import. Split it into smaller chapters or papers." }, { status: 413 });

  const { data: source, error: sourceError } = await supabase.from("content_sources").insert({ user_id: user.id, subject_id: subjectId, source_type: sourceType, title: String(body.title || `${sourceType.replace("_", " ")} import`), raw_text: rawText, status: "processing" }).select("id").single();
  if (sourceError || !source) return NextResponse.json({ error: "We could not start this import." }, { status: 500 });

  const instruction = sourceType === "syllabus"
    ? "Extract the curriculum sections and topics. Return no questions unless the syllabus itself contains practice questions."
    : sourceType === "past_paper"
      ? "Extract every question from the paper, preserving the exact order with sequence_order. Include points, year when visible, topic, choices, answer, and explanation. Never invent an answer when it is not present; use an empty answer and explain that it needs review."
      : "Extract the teachable sections and create useful practice questions only from the supplied textbook text. Tag each question with a topic and difficulty.";

  const prompt = `You are StudyPal's curriculum parser. ${instruction}
Return only the requested JSON structure. Be faithful to the source and do not add facts that are not supported by it. Use section_title to connect questions to sections. For fill_blank questions, put accepted variants in accepted_answers. For multiple_choice, choices must use short keys such as A, B, C, D.

SOURCE TYPE: ${sourceType}
SOURCE TEXT:
${rawText}`;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseFormat: { text: { mimeType: "application/json", schema: extractionSchema } } },
      }),
    });
    if (!response.ok) throw new Error(`Gemini request failed with ${response.status}`);
    const payload = await response.json();
    const text = payload.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "";
    const parsed = parseModelJson(text);
    const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const sectionRows = sections.map((section: { title: string; description: string; topics: string[] }, index: number) => ({ user_id: user.id, subject_id: subjectId, title: section.title.slice(0, 180), description: section.description || null, topics: section.topics || [], position: index }));
    const { data: savedSections, error: sectionError } = sectionRows.length ? await supabase.from("curriculum_sections").insert(sectionRows).select("id, title") : { data: [], error: null };
    if (sectionError) throw sectionError;
    const sectionIds = new Map((savedSections || []).map((section) => [section.title, section.id]));
    const questionRows = questions.map((question: { section_title: string; question_type: string; prompt: string; choices: unknown[]; answer: string; accepted_answers: string[]; explanation: string; points: number; year: number; topic: string; difficulty: string; sequence_order: number }) => ({
      user_id: user.id, subject_id: subjectId, source_id: source.id, section_id: sectionIds.get(question.section_title) || null, question_type: question.question_type, prompt: question.prompt, choices: question.choices || [], answer: question.question_type === "fill_blank" && question.accepted_answers?.length ? question.accepted_answers : question.answer, explanation: question.explanation || null, points: Math.max(1, Number(question.points || 1)), year: Number.isFinite(question.year) && question.year > 0 ? question.year : null, topic: question.topic || null, difficulty: question.difficulty || "standard", sequence_order: Number.isFinite(question.sequence_order) ? question.sequence_order : null,
    }));
    if (questionRows.length) {
      const { error: questionError } = await supabase.from("questions").insert(questionRows);
      if (questionError) throw questionError;
    }
    await supabase.from("content_sources").update({ status: "ready", metadata: { sections: sectionRows.length, questions: questionRows.length, model: "gemini-2.5-flash" }, updated_at: new Date().toISOString() }).eq("id", source.id).eq("user_id", user.id);
    return NextResponse.json({ sourceId: source.id, sections: sectionRows.length, questions: questionRows.length });
  } catch (error) {
    await supabase.from("content_sources").update({ status: "failed", metadata: { error: error instanceof Error ? error.message : "unknown" }, updated_at: new Date().toISOString() }).eq("id", source.id).eq("user_id", user.id);
    return NextResponse.json({ error: "We could not understand that material. Try a smaller, clearer paste." }, { status: 502 });
  }
}
