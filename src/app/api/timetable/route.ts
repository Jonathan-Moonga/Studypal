import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to plan a study block." }, { status: 401 });

  const body = await request.json();
  const title = String(body.title || "").trim();
  const startsAt = new Date(String(body.startsAt || ""));
  const endsAt = new Date(String(body.endsAt || ""));
  if (!title || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "Add a title and a valid start/end time." }, { status: 400 });
  }

  const { data, error } = await supabase.from("timetable_events").insert({
    user_id: user.id,
    subject_id: body.subjectId || null,
    title,
    event_type: body.eventType || "study",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    notes: body.notes ? String(body.notes).trim() : null,
  }).select("id, title, starts_at, ends_at, event_type, subject_id").single();

  if (error) return NextResponse.json({ error: "We could not save that timetable block." }, { status: 500 });
  return NextResponse.json({ event: data });
}
