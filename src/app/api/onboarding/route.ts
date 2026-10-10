import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const body = await request.json();
  const displayName = String(body.displayName || "").trim();
  const examName = String(body.examName || "").trim();
  const examKey = String(body.examKey || "custom");
  const selectedSubjects = Array.isArray(body.subjects) ? body.subjects.map((subject: unknown) => String(subject).trim()).filter(Boolean) : [];
  const examDate = body.examDate ? String(body.examDate) : null;
  const weeklyGoalMinutes = Number(body.weeklyGoalMinutes || 180);

  if (!displayName || !examName || !examDate || !Number.isFinite(weeklyGoalMinutes)) {
    return NextResponse.json({ error: "Tell us your name, exam, exam date, and weekly goal." }, { status: 400 });
  }

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    display_name: displayName,
    exam_name: examName,
    exam_key: examKey,
    exam_board: examKey.startsWith("ecz_") ? "ECZ" : examKey === "cambridge_igcse" ? "Cambridge" : "Custom",
    exam_date: examDate,
    weekly_goal_minutes: Math.max(30, Math.round(weeklyGoalMinutes)),
    onboarding_complete: true,
    updated_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: "We could not save your study plan yet." }, { status: 500 });
  if (selectedSubjects.length) {
    const { data: existingSubjects } = await supabase.from("subjects").select("name").eq("user_id", user.id);
    const existingNames = new Set((existingSubjects || []).map((subject: { name: string }) => subject.name.toLowerCase()));
    const newSubjects = selectedSubjects.filter((subject: string) => !existingNames.has(subject.toLowerCase())).map((name: string) => ({ user_id: user.id, name, color: "red" }));
    if (newSubjects.length) await supabase.from("subjects").insert(newSubjects);
  }
  return NextResponse.json({ ok: true });
}
