import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TEMPLATE_DAYS: Record<string, number> = { sprint_10: 10, sprint_15: 15, focused_20: 20, balanced_30: 30, steady_90: 90 };

function startOfDay(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; }
function dateAt(date: Date, hour: number) { const value = new Date(date); value.setHours(hour, 0, 0, 0); return value; }

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to apply a template." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const requested = String(body.templateKey || "auto");
  const [{ data: subjects }, { data: profile }] = await Promise.all([
    supabase.from("subjects").select("id, name, exam_date").eq("user_id", user.id).order("exam_date", { ascending: true, nullsFirst: false }).order("name"),
    supabase.from("profiles").select("exam_date").eq("id", user.id).single(),
  ]);
  if (!subjects?.length) return NextResponse.json({ error: "Add at least one subject before applying a timetable template." }, { status: 400 });
  const dates = subjects.map((subject) => subject.exam_date).filter((date): date is string => Boolean(date)).sort();
  const firstExam = dates[0] || profile?.exam_date;
  const finalExam = dates[dates.length - 1] || profile?.exam_date;
  if (!firstExam || !finalExam) return NextResponse.json({ error: "Add an exam date before applying a template." }, { status: 400 });
  const today = startOfDay(new Date());
  const first = startOfDay(new Date(`${firstExam}T00:00:00`));
  const final = startOfDay(new Date(`${finalExam}T00:00:00`));
  const actualDays = Math.max(1, Math.ceil((first.getTime() - today.getTime()) / 86400000));
  const templateDays = requested === "auto" ? (actualDays <= 10 ? 10 : actualDays <= 15 ? 15 : actualDays <= 20 ? 20 : actualDays <= 45 ? 30 : 90) : (TEMPLATE_DAYS[requested] || 30);
  const templateKey = requested === "auto" ? (templateDays === 10 ? "sprint_10" : templateDays === 15 ? "sprint_15" : templateDays === 20 ? "focused_20" : templateDays === 30 ? "balanced_30" : "steady_90") : requested;
  const sessionsPerWeek = templateDays <= 10 ? 7 : templateDays <= 20 ? 6 : templateDays <= 30 ? 5 : 4;
  const duration = templateDays <= 15 ? 50 : 45;
  const allowedDays = sessionsPerWeek === 7 ? [0, 1, 2, 3, 4, 5, 6] : sessionsPerWeek === 6 ? [1, 2, 3, 4, 5, 6] : sessionsPerWeek === 5 ? [1, 2, 3, 4, 6] : [1, 2, 4, 6];
  const hours = templateDays <= 20 ? [17, 19] : [17];
  const recurrenceGroupId = randomUUID();
  const rows = [];
  let subjectIndex = 0;
  for (let cursor = new Date(today); cursor <= final && rows.length < 500; cursor.setDate(cursor.getDate() + 1)) {
    if (!allowedDays.includes(cursor.getDay())) continue;
    for (const hour of hours) {
      const available = subjects.filter((subject) => !subject.exam_date || startOfDay(new Date(`${subject.exam_date}T00:00:00`)) >= cursor);
      if (!available.length) continue;
      const subject = available[subjectIndex % available.length];
      subjectIndex += 1;
      const startsAt = dateAt(cursor, hour);
      if (startsAt < new Date() || startsAt >= final) continue;
      rows.push({ user_id: user.id, subject_id: subject.id, title: `${subject.name} focused practice`, event_type: "study", starts_at: startsAt.toISOString(), ends_at: new Date(startsAt.getTime() + duration * 60000).toISOString(), notes: "Generated from a StudyPal template. Drag this block to customize this week.", recurrence_group_id: recurrenceGroupId, template_key: templateKey });
    }
  }
  if (!rows.length) return NextResponse.json({ error: "The final exam date has already passed or leaves no time for a plan." }, { status: 400 });
  const { data: createdEvents, error } = await supabase.from("timetable_events").insert(rows).select("id, title, starts_at, ends_at, event_type, subject_id");
  if (error) return NextResponse.json({ error: "We could not create that study plan." }, { status: 500 });
  return NextResponse.json({ created: rows.length, events: createdEvents || [], templateKey, through: finalExam });
}
