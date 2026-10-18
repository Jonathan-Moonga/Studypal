export type QuizQuestion = {
  id: string;
  topic: string | null;
  sequence_order: number | null;
  source_id: string | null;
  section_id: string | null;
  question_type: "multiple_choice" | "fill_blank" | "free_response" | "essay";
};

type Attempt = { question_id: string; is_correct: boolean };

function questionPriority(question: QuizQuestion, attempts: Attempt[]) {
  const history = attempts.filter((attempt) => attempt.question_id === question.id);
  if (history.length === 0) return 100;

  const correct = history.filter((attempt) => attempt.is_correct).length;
  const accuracy = correct / history.length;
  // Unseen questions come first. After that, deliberately surface weak areas.
  return Math.round((1 - accuracy) * 80) + Math.max(0, 5 - history.length);
}

function stableShuffle<T>(items: T[], seed: string) {
  return [...items].sort((a, b) => {
    const aKey = `${seed}:${JSON.stringify(a)}`;
    const bKey = `${seed}:${JSON.stringify(b)}`;
    return aKey.localeCompare(bKey);
  });
}

export function selectTopicQuiz(questions: QuizQuestion[], attempts: Attempt[], count = 10, variant = "A") {
  // Topic practice favors weak and unseen questions while keeping the set varied.
  const ranked = [...questions].sort((a, b) => questionPriority(b, attempts) - questionPriority(a, attempts));
  const byTopic = new Map<string, QuizQuestion[]>();
  ranked.forEach((question) => {
    const topic = question.topic || "General practice";
    byTopic.set(topic, [...(byTopic.get(topic) || []), question]);
  });

  const selected: QuizQuestion[] = [];
  const topicQueues = [...byTopic.values()].map((queue) => stableShuffle(queue, `topic:${variant}`));
  while (selected.length < Math.min(count, questions.length) && topicQueues.length) {
    for (const queue of topicQueues) {
      const next = queue.shift();
      if (next) selected.push(next);
      if (selected.length >= count) break;
    }
    for (let index = topicQueues.length - 1; index >= 0; index -= 1) {
      if (!topicQueues[index].length) topicQueues.splice(index, 1);
    }
  }
  return selected;
}

export function selectAssessmentVariant(questions: QuizQuestion[], variant = "A", count = 20) {
  if (!questions.length) return [];
  const variants = ["A", "B", "C", "D"];
  const variantIndex = Math.max(0, variants.indexOf(variant));
  const shuffled = stableShuffle(questions, `assessment:${variant}`);
  const target = Math.min(count, shuffled.length);
  if (shuffled.length >= target * variants.length) return shuffled.slice(variantIndex * target, (variantIndex + 1) * target);
  // Smaller banks still get four reproducible versions, with a rotated order.
  return Array.from({ length: target }, (_, index) => shuffled[(index + variantIndex) % shuffled.length]);
}

export function selectSectionPractice(questions: QuizQuestion[]) {
  // A section practice is a complete, timed pass in curriculum order.
  return [...questions].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
}

export function selectFullPaper(questions: QuizQuestion[], sourceId: string) {
  // A full paper is never remixed: source order is the assessment contract.
  return questions
    .filter((question) => question.source_id === sourceId)
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
}

export function durationForQuiz(type: "topic" | "section" | "full_paper" | "unit_test", questionCount: number) {
  if (type === "topic") return Math.max(8 * 60, questionCount * 75);
  if (type === "section") return Math.max(20 * 60, questionCount * 90);
  if (type === "unit_test") return Math.max(45 * 60, questionCount * 120);
  return Math.max(45 * 60, questionCount * 90);
}
