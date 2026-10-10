import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to create a subject." }, { status: 401 });

  const body = await request.json();
  const name = String(body.name || "").trim();
  const color = String(body.color || "red");
  if (name.length < 1 || name.length > 80) return NextResponse.json({ error: "Subject names should be between 1 and 80 characters." }, { status: 400 });

  const { data, error } = await supabase.from("subjects").insert({ user_id: user.id, name, color }).select("id, name, color, created_at").single();
  if (error) return NextResponse.json({ error: "That subject could not be created." }, { status: 500 });
  return NextResponse.json({ subject: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to update an exam date." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const subjectId = String(body.subjectId || "");
  const examDate = body.examDate ? String(body.examDate) : null;
  const examTime = body.examTime ? String(body.examTime) : null;
  const examPaper = body.examPaper ? String(body.examPaper).trim().slice(0, 120) : null;
  if (!subjectId) return NextResponse.json({ error: "Choose a subject first." }, { status: 400 });
  if (examDate && !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return NextResponse.json({ error: "Enter a valid exam date." }, { status: 400 });
  const { data, error } = await supabase.from("subjects").update({ exam_date: examDate, exam_time: examTime, exam_paper: examPaper }).eq("id", subjectId).eq("user_id", user.id).select("id, exam_date, exam_time, exam_paper").single();
  if (error || !data) return NextResponse.json({ error: "We could not update that exam date." }, { status: 500 });
  return NextResponse.json({ subject: data });
}
