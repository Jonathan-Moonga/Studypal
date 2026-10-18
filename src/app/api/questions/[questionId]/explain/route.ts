import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// A light model is enough for one question and keeps this within the free tier.
const EXPLAIN_MODEL = process.env.GEMINI_EXPLAIN_MODEL || "gemini-3.5-flash-lite";

type Meta = { model_answer?: string | null; diagram_description?: string | null; figure_image_path?: string; explanation_steps?: string; number?: string | null };

// Step-by-step explanation of a single question, generated on request and cached on the question.
export async function POST(_request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "Explanations are not configured yet." }, { status: 503 });

  const { data: question } = await supabase.from("questions").select("id, question_type, prompt, choices, answer, explanation, metadata, subjects(name)").eq("id", questionId).eq("user_id", user.id).single();
  if (!question) return NextResponse.json({ error: "Question not found." }, { status: 404 });
  const meta = (question.metadata || {}) as Meta;
  if (meta.explanation_steps) return NextResponse.json({ steps: meta.explanation_steps });

  const choices = (question.choices || []) as { key: string; text: string }[];
  const key = Array.isArray(question.answer) ? question.answer.join(" or ") : String(question.answer || "");
  const correct = choices.find((choice) => choice.key === key);
  const subject = (question.subjects as { name?: string } | null)?.name || "this subject";
  const prompt = [
    `You are a patient Zambian ${subject} teacher helping a learner prepare for an ECZ examination.`,
    "Explain how to answer the question below, step by step, in simple English.",
    "Use short numbered steps, show any working, and end with one line starting 'Answer:'. Use plain text with Unicode maths symbols, no Markdown or LaTeX.",
    "The correct answer is given; explain why it is correct (and, for multiple choice, briefly why the other options are wrong). Do not change it.",
    "",
    `Question: ${question.prompt}`,
    choices.length ? `Options:\n${choices.map((choice) => `${choice.key}. ${choice.text}`).join("\n")}` : "",
    correct ? `Correct answer: ${correct.key}. ${correct.text}` : key ? `Correct answer: ${key}` : meta.model_answer ? `Model answer: ${meta.model_answer}` : "",
    meta.diagram_description ? `Diagram: ${meta.diagram_description}` : "",
    question.explanation ? `Short explanation already given: ${question.explanation}` : "",
  ].filter(Boolean).join("\n");

  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [{ text: prompt }];
  if (meta.figure_image_path) {
    const { data: image } = await supabase.storage.from("study-materials").download(meta.figure_image_path);
    if (image) parts.push({ inlineData: { mimeType: image.type || "image/png", data: Buffer.from(await image.arrayBuffer()).toString("base64") } });
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EXPLAIN_MODEL}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { thinkingConfig: { thinkingLevel: "low" } } }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const busy = response.status === 429 || response.status === 503;
    return NextResponse.json({ error: busy ? "The explainer is busy right now. Try again in a minute." : "We could not get an explanation for this question." }, { status: busy ? 503 : 502 });
  }
  const steps = String(payload.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "").trim();
  if (!steps) return NextResponse.json({ error: "No explanation came back. Try again." }, { status: 502 });
  await supabase.from("questions").update({ metadata: { ...meta, explanation_steps: steps } }).eq("id", question.id).eq("user_id", user.id);
  return NextResponse.json({ steps });
}
