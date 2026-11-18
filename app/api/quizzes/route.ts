import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createQuizSchema } from "@/lib/validators";
import { isResponse, requestProfile } from "@/lib/http";

export async function POST(request: Request) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role !== "faculty" && context.profile.role !== "admin") {
    return NextResponse.json({ error: "Only faculty and administrators can create assessments." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The assessment request must be valid JSON." }, { status: 400 });
  }
  const parsed = createQuizSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Review the assessment details." }, { status: 400 });
  }

  const db = await createClient();
  const assessment = parsed.data;
  const { data: quizId, error } = await db.rpc("create_quiz_with_questions", {
    _class_id: assessment.class_id,
    _title: assessment.title,
    _description: assessment.description,
    _opens_at: assessment.opens_at,
    _closes_at: assessment.closes_at,
    _duration_minutes: assessment.duration_minutes,
    _attempts_allowed: assessment.attempts_allowed,
    _show_score_after_submit: assessment.show_score_after_submit,
    _publish: assessment.publish,
    _questions: assessment.questions,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "You cannot create assessments for this classroom." }, { status: 403 });
    }
    if (error.code === "22023") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error.code === "23514") {
      return NextResponse.json({ error: "Review the question choices and marks." }, { status: 400 });
    }
    if (error.code === "23505") {
      return NextResponse.json({ error: "An assessment with these details already exists." }, { status: 409 });
    }
    console.error("Unable to create quiz assessment", { code: error.code, message: error.message });
    return NextResponse.json({ error: "The assessment could not be saved. Please try again." }, { status: 500 });
  }

  if (!quizId) {
    console.error("Quiz authoring RPC returned no assessment ID.");
    return NextResponse.json({ error: "The assessment could not be saved. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ id: quizId }, { status: 201 });
}
