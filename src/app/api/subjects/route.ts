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
