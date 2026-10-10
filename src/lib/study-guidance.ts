export const MOTIVATION = [
  { text: "You do not need to feel ready before you begin. One honest study block is enough to change today.", label: "Before you start" },
  { text: "A difficult practice question is not proof that you are failing; it is a map of what to learn next.", label: "When practice feels hard" },
  { text: "Confidence is usually the result of keeping promises to yourself, one small session at a time.", label: "Build momentum" },
  { text: "The exam asks what you can do on one day. Your preparation is built on every ordinary day before it.", label: "Keep perspective" },
  { text: "Pause, breathe out slowly, and do the next clear step. You do not have to solve the whole paper at once.", label: "In the exam room" },
];

export const STUDY_TIPS = [
  { title: "Retrieve, then review", detail: "Close the book and write what you remember first. Check afterward and study the gaps, not the familiar parts.", tag: "Memory" },
  { title: "Space your returns", detail: "Revisit a topic after a day, then several days, then a week. Short spaced sessions beat one long reread.", tag: "Planning" },
  { title: "Keep an error log", detail: "Record why each mistake happened: knowledge gap, misread command word, rushed arithmetic, or weak method. Practise the cause.", tag: "Practice" },
  { title: "Use elimination", detail: "Cross out options that contradict the question, use the wrong unit, or make an extreme claim. Compare what remains to the exact wording.", tag: "Multiple choice" },
  { title: "Never leave a free point", detail: "When there is no penalty for wrong answers, answer every item. Use a consistent fallback choice only after eliminating what you can.", tag: "Exam strategy" },
  { title: "Plan essays before writing", detail: "Spend a few minutes on a claim, evidence, explanation, and counterpoint. A visible structure protects marks when time is tight.", tag: "Essays" },
  { title: "Simulate the real paper", detail: "Practise the original order under the real time limit, then review without the timer. Timing is a skill, not just a constraint.", tag: "Full papers" },
  { title: "Protect sleep", detail: "Stop heavy study early enough to sleep. Memory consolidation and attention matter more than one exhausted extra hour.", tag: "Wellbeing" },
];

export function dailyGuidanceIndex(length: number, offset = 0) {
  const now = new Date();
  return (Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000) + offset) % length;
}
