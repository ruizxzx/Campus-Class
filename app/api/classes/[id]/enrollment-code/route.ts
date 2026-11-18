import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestProfile, isResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requestProfile();
  if (isResponse(context)) return context;
  if (context.profile.role !== "admin") return NextResponse.json({ error: "Only administrators can manage enrollment codes." }, { status: 403 });
  const { id } = await params;
  const admin = createAdminClient();
  const { data: classRow, error: classLookupError } = await admin.from("classes").select("id,college_id,enrollment_open,is_active").eq("id", id).eq("college_id", context.profile.college_id).maybeSingle();
  if (classLookupError) {
    console.error(`Enrollment-code class lookup failed (${classLookupError.code}): ${classLookupError.message}`);
    return NextResponse.json({ error: "Could not check the class enrollment settings." }, { status: 500 });
  }
  if (!classRow) return NextResponse.json({ error: "Class not found in your college workspace." }, { status: 404 });
  if (!classRow.is_active) return NextResponse.json({ error: "This class is inactive." }, { status: 409 });
  if (!classRow.enrollment_open) return NextResponse.json({ error: "Enrollment is closed for this class." }, { status: 409 });

  const code = `CC-${randomBytes(8).toString("hex").toUpperCase()}`;
  const codeHash = createHash("sha256").update(code).digest("hex");
  // First prepare the replacement; never invalidate every existing active
  // class code before proving the replacement exists.
  const { data: newCode, error: createError } = await admin.from("enrollment_codes")
    .insert({ college_id: context.profile.college_id, class_id: id, code_hash: codeHash, created_by: context.userId })
    .select("id").single();
  if (createError || !newCode) {
    console.error("Enrollment-code creation failed", { code: createError?.code });
    return NextResponse.json({ error: "Could not create the replacement enrollment code. Existing codes remain usable." }, { status: 503 });
  }
  const { error: disableError } = await admin.from("enrollment_codes")
    .update({ active: false }).eq("class_id", id)
    .eq("college_id", context.profile.college_id).eq("active", true)
    .neq("id", newCode.id);
  if (disableError) {
    console.error("Enrollment-code rotation failed", { code: disableError.code });
    // Revoke only our newly generated code; old codes were not deliberately
    // disabled on the failed path and should remain usable.
    const { error: rollbackError } = await admin.from("enrollment_codes")
      .update({ active: false }).eq("id", newCode.id)
      .eq("college_id", context.profile.college_id);
    if (rollbackError) console.error("Enrollment-code replacement cleanup failed", { code: rollbackError.code });
    return NextResponse.json({ error: "Could not complete enrollment-code rotation. Please check the class's active codes." }, { status: 503 });
  }
  return NextResponse.json({ code });
}
