import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/types/database";

type OpenRouterMessage = { role: "system" | "user" | "assistant"; content: string };

export class OpenRouterError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "OpenRouterError";
  }
}

function getEncryptionKey() {
  const encoded = process.env.OPENROUTER_ENCRYPTION_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new OpenRouterError("College AI encryption is not configured on the server.", 503);
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    key.fill(0);
    throw new OpenRouterError("College AI encryption key must decode to exactly 32 bytes.", 503);
  }
  return key;
}

export function encryptOpenRouterKey(secret: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return {
      api_key_ciphertext: ciphertext.toString("base64"),
      api_key_iv: iv.toString("base64"),
      api_key_tag: cipher.getAuthTag().toString("base64"),
    };
  } finally {
    key.fill(0);
  }
}

function decryptOpenRouterKey(ciphertext: string, iv: string, tag: string) {
  const key = getEncryptionKey();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]);
  } catch {
    throw new OpenRouterError("The saved college AI key could not be decrypted. Ask an administrator to save it again.", 503);
  } finally {
    key.fill(0);
  }
}

export async function completeWithOpenRouter(
  profile: Profile,
  messages: OpenRouterMessage[],
  maxTokens = 900,
) {
  const admin = createAdminClient();
  const { data: settings, error } = await admin.from("college_ai_settings")
    .select("enabled,model,api_key_ciphertext,api_key_iv,api_key_tag")
    .eq("college_id", profile.college_id)
    .maybeSingle();

  if (error) {
    console.error("College AI configuration lookup failed", { code: error.code });
    throw new OpenRouterError("Could not load this college's AI configuration.", 500);
  }
  if (!settings?.enabled || !settings.api_key_ciphertext || !settings.api_key_iv || !settings.api_key_tag) {
    throw new OpenRouterError("CampusClass AI is not enabled for this college. Contact your college administrator.", 503);
  }

  const secret = decryptOpenRouterKey(
    settings.api_key_ciphertext,
    settings.api_key_iv,
    settings.api_key_tag,
  );
  const apiKey = secret.toString("utf8");
  secret.fill(0);

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://campusclass.app",
        "X-Title": "CampusClass",
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    console.error("OpenRouter request could not be completed", {
      reason: isTimeout ? "timeout" : "network",
    });
    throw new OpenRouterError(
      isTimeout ? "The AI request timed out. Please try again." : "Could not reach the AI service. Please try again.",
      isTimeout ? 504 : 502,
    );
  }

  if (!response.ok) {
    console.error("OpenRouter returned an error", { status: response.status });
    throw new OpenRouterError(
      response.status === 429
        ? "The college AI service is busy. Please try again shortly."
        : "The AI service could not complete this request.",
      response.status === 429 ? 429 : 502,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || !("choices" in payload)) {
    throw new OpenRouterError("The AI service returned an invalid response.", 502);
  }
  const choices = (payload as { choices?: { message?: { content?: unknown } }[] }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new OpenRouterError("The AI service returned an empty response.", 502);
  }
  return content.trim();
}
