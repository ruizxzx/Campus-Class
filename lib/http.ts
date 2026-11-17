import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export async function requestProfile(): Promise<{ profile: Profile; userId: string } | NextResponse> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (profileError || !profile || profile.status !== "active") {
    return NextResponse.json({ error: "Your account is not active in a college workspace." }, { status: 403 });
  }
  return { profile: profile as Profile, userId: user.id };
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
