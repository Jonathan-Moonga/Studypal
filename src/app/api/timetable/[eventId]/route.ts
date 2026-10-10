import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to move this study block." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const startsAt = new Date(String(body.startsAt || ""));
  const endsAt = new Date(String(body.endsAt || ""));
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return NextResponse.json({ error: "Choose a valid day and time." }, { status: 400 });
  const { data, error } = await supabase.from("timetable_events").update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() }).eq("id", eventId).eq("user_id", user.id).select("id, title, starts_at, ends_at, event_type, subject_id").single();
  if (error || !data) return NextResponse.json({ error: "We could not move that block." }, { status: 500 });
  return NextResponse.json({ event: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const { error } = await supabase.from("timetable_events").delete().eq("id", eventId).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "We could not remove that block." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
