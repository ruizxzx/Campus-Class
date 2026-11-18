import { NextResponse } from "next/server";
import { z } from "zod";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const schema = z.object({
  class_id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  duration_minutes: z.number().int().min(15).max(240),
  location: z.string().trim().max(180).default(""),
});
const minuteValue = (clock: string) => {
  const [hours,minutes] = clock.split(":").map(Number);
  return hours*60+minutes;
};
const clock = (minutes: number) => String(Math.floor(minutes/60)).padStart(2,"0")
  + ":" + String(minutes%60).padStart(2,"0");

export async function POST(request: Request) {
  const ctx = await requestProfile();
  if (isResponse(ctx)) return ctx;
  if (ctx.profile.role === "student") return NextResponse.json({ error: "Faculty access required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid search." }, { status: 400 });
  const body = parsed.data;
  const db = createAdminClient();
  const collegeId = ctx.profile.college_id;
  const { data: classroom, error: classError } = await db.from("classes").select("id")
    .eq("college_id",collegeId).eq("id",body.class_id).eq("is_active",true).maybeSingle();
  if(classError || !classroom)return NextResponse.json({error:"Selected class not found."},{status:classError?503:404});
  const { data: assignments, error: facultyError } = await db.from("class_faculty")
    .select("class_id,faculty_id").eq("college_id",collegeId).limit(3000);
  if (facultyError) return NextResponse.json({ error: "Could not check faculty schedules." }, { status: 503 });
  const ownFaculty = new Set((assignments??[]).filter((item)=>item.class_id===body.class_id)
    .map((item)=>item.faculty_id));
  if(ctx.profile.role==="faculty" && !ownFaculty.has(ctx.userId)) {
    return NextResponse.json({error:"You are not assigned to this class."},{status:403});
  }
  const { data: entries, error } = await db.from("class_schedule_entries")
    .select("class_id,start_time,end_time,location").eq("college_id",collegeId)
    .eq("weekday",body.weekday).limit(2000);
  if(error)return NextResponse.json({error:"Could not load timetable availability."},{status:503});
  const linkedClasses = new Set((assignments??[]).filter((item)=>ownFaculty.has(item.faculty_id))
    .map((item)=>item.class_id));
  const room=body.location.toLocaleLowerCase("en").trim();
  const relevant=(entries??[]).filter((item)=>item.class_id===body.class_id || linkedClasses.has(item.class_id)
    || Boolean(room && item.location?.trim().toLocaleLowerCase("en")===room));
  const slots:{start_time:string;end_time:string}[]=[];
  for(let start=8*60;start+body.duration_minutes<=18*60;start+=30){
    const end=start+body.duration_minutes;
    const busy=relevant.some((item)=>minuteValue(item.start_time)<end && minuteValue(item.end_time)>start);
    if(!busy)slots.push({start_time:clock(start),end_time:clock(end)});
    if(slots.length>=12)break;
  }
  return NextResponse.json({suggestions:slots});
}
