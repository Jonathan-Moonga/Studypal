type Metadata = Record<string, unknown> | null | undefined;

function createdAt(value: { created_at?: string | null }) {
  return value.created_at ? new Date(value.created_at).getTime() : 0;
}

export function dedupeBiologySources<T extends { id: string; title: string; created_at?: string | null; metadata?: Metadata }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => createdAt(b) - createdAt(a));
  const seen = new Set<string>();
  return sorted.filter((row) => {
    const metadata = row.metadata || {};
    if (metadata.biology_archived === true) return false;
    if (metadata.biology_source !== true) return true;
    const key = String(metadata.sha256 || row.title || row.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dedupeBiologyQuestions<T extends { id: string; prompt: string; choices?: unknown; created_at?: string | null; metadata?: Metadata }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => createdAt(b) - createdAt(a));
  const seen = new Set<string>();
  return sorted.filter((row) => {
    if (row.metadata?.biology_archived === true) return false;
    if (row.metadata?.biology_seed_version !== "biology-seed-v1") return true;
    const prompt = row.prompt.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
    const choices = JSON.stringify(row.choices || []);
    const key = `${prompt}|${choices}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
