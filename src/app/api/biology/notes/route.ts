import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const url = new URL(request.url);
  const subjectId = url.searchParams.get("subjectId") || "";
  const unitKey = url.searchParams.get("unitKey") || "";
  if (!subjectId || !unitKey) return NextResponse.json({ error: "Choose a Biology unit." }, { status: 400 });

  const { data: notes, error } = await supabase.from("content_sources")
    .select("id, title, raw_text, storage_path, metadata, created_at")
    .eq("user_id", user.id)
    .eq("subject_id", subjectId)
    .eq("metadata->>biology_seed_version", "biology-seed-v1")
    .eq("metadata->>biology_material", "true")
    .eq("metadata->>unit_key", unitKey)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) return NextResponse.json({ error: "We could not load the Biology notes." }, { status: 500 });

  const paths = [...new Set((notes || []).map((note) => note.storage_path).filter((value): value is string => Boolean(value)))];
  const signed = paths.length ? await supabase.storage.from("study-materials").createSignedUrls(paths, 60 * 60) : { data: [] };
  const urls = new Map((signed.data || []).map((item) => [item.path, item.signedUrl]));
  const seenPages = new Set<string>();
  const uniqueNotes = (notes || []).filter((note) => {
    const metadata = (note.metadata || {}) as Record<string, unknown>;
    if (metadata.biology_archived === true) return false;
    const key = `${String(metadata.source_name || note.title)}|${String(metadata.source_page || note.id)}|${String(metadata.lesson_title || "")}`;
    if (seenPages.has(key)) return false;
    seenPages.add(key);
    return true;
  }).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return NextResponse.json({ notes: uniqueNotes.map((note) => {
    const metadata = (note.metadata || {}) as Record<string, unknown>;
    return {
      id: note.id,
      title: note.title,
      body: note.raw_text,
      lessonTitle: String(metadata.lesson_title || "Biology notes"),
      sourceName: String(metadata.source_name || "Supplied source"),
      sourcePage: Number(metadata.source_page || 0),
      pdfUrl: note.storage_path ? urls.get(note.storage_path) || null : null,
    };
  }) });
}
