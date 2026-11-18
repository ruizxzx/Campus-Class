import { NextResponse } from "next/server";
import { requestProfile, isResponse } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { collegeAISettingsSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await requestProfile();
    if (isResponse(context)) return context;
    if (context.profile.role !== "admin") {
      return NextResponse.json({ error: "Only a college administrator can view AI settings." }, { status: 403 });
    }

    const { data, error } = await createAdminClient().from("college_ai_settings")
      .select("enabled,model,api_key_vault_id,api_key_ciphertext,updated_at")
      .eq("college_id", context.profile.college_id)
      .maybeSingle();
    if (error) {
      console.error("College AI settings could not be loaded", { code: error.code });
      return NextResponse.json({ error: "Could not load AI settings." }, { status: 500 });
    }
    return NextResponse.json({
      enabled: data?.enabled ?? false,
      model: data?.model ?? "openai/gpt-4o-mini",
      configured: Boolean(data?.api_key_vault_id || data?.api_key_ciphertext),
      needs_rekey: Boolean(data?.api_key_ciphertext && !data?.api_key_vault_id && !process.env.OPENROUTER_ENCRYPTION_KEY),
      updated_at: data?.updated_at ?? null,
    });
  } catch (error) {
    console.error("Unexpected College AI settings load failure", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "CampusClass AI settings could not be loaded because the server configuration is unavailable." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY.includes("your_server_only")) {
      return NextResponse.json({ error: "Server Supabase secret key is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local." }, { status: 503 });
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: "Server Supabase URL is not configured. Add NEXT_PUBLIC_SUPABASE_URL to .env.local." }, { status: 503 });
    }
    const context = await requestProfile();
    if (isResponse(context)) return context;
    if (context.profile.role !== "admin") {
      return NextResponse.json({ error: "Only a college administrator can change AI settings." }, { status: 403 });
    }

    const parsed = collegeAISettingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid AI settings." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: current, error: currentError } = await admin.from("college_ai_settings")
      .select("api_key_vault_id,api_key_ciphertext,api_key_iv,api_key_tag")
      .eq("college_id", context.profile.college_id)
      .maybeSingle();
    if (currentError) {
      console.error("College AI settings could not be read for update", { code: currentError.code });
      return NextResponse.json({ error: "Could not update AI settings." }, { status: 500 });
    }

    if (parsed.data.enabled && !parsed.data.api_key
      && !current?.api_key_vault_id && !current?.api_key_ciphertext) {
      return NextResponse.json({ error: "Add an OpenRouter API key before enabling CampusClass AI." }, { status: 400 });
    }

    if (parsed.data.api_key) {
      // Atomic Vault update + settings upsert in one database transaction.
      // No application environment encryption secret is required.
      const { error: vaultError } = await admin.rpc("set_college_ai_secret", {
        p_college_id: context.profile.college_id,
        p_admin_id: context.userId,
        p_secret: parsed.data.api_key,
        p_model: parsed.data.model,
        p_enabled: parsed.data.enabled,
      });
      if (vaultError) {
        console.error("College AI Vault save failed", { code: vaultError.code });
        return NextResponse.json({
          error: vaultError.code === "PGRST202" || vaultError.code === "42883"
            ? "Run the new college AI Vault migration in Supabase SQL Editor before saving the key."
            : "Could not securely save the college AI key. Check the Vault migration.",
        }, { status: 503 });
      }
    } else {
      // Do not touch the existing key when changing the model/toggle.
      const { error: saveError } = await admin.from("college_ai_settings").upsert({
        college_id: context.profile.college_id,
        enabled: parsed.data.enabled,
        model: parsed.data.model,
        api_key_vault_id: current?.api_key_vault_id ?? null,
        api_key_ciphertext: current?.api_key_ciphertext ?? null,
        api_key_iv: current?.api_key_iv ?? null,
        api_key_tag: current?.api_key_tag ?? null,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "college_id" });
      if (saveError) {
        console.error("College AI settings could not be saved", { code: saveError.code });
        return NextResponse.json({ error: "Could not save AI settings." }, { status: 500 });
      }
    }

    await admin.from("activity_logs").insert({
      college_id: context.profile.college_id,
      actor_id: context.userId,
      action: "college.ai_settings.updated",
      entity_type: "college_ai_settings",
      entity_id: context.profile.college_id,
    });
    return NextResponse.json({
      success: true,
      enabled: parsed.data.enabled,
      model: parsed.data.model,
      configured: Boolean(parsed.data.api_key || current?.api_key_vault_id || current?.api_key_ciphertext),
      needs_rekey: Boolean(!parsed.data.api_key && current?.api_key_ciphertext
        && !current?.api_key_vault_id && !process.env.OPENROUTER_ENCRYPTION_KEY),
    });
  } catch (error) {
    console.error("Unexpected College AI settings save failure", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "CampusClass AI settings could not be saved because the server configuration is unavailable." }, { status: 500 });
  }
}
