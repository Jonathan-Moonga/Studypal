import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const { data: job, error } = await supabase.from("import_jobs").select("id, source_id, status, total_chunks, completed_chunks, draft, error").eq("id", jobId).eq("user_id", user.id).single();
  if (error || !job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  return NextResponse.json({ job });
}
