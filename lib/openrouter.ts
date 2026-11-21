import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/types/database";

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string | (
    | { type: "text"; text: string }
    | { type: "file"; file: { filename: string; file_data: string } }
  )[];
};

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
    .select("enabled,model,api_key_vault_id,api_key_ciphertext,api_key_iv,api_key_tag")
    .eq("college_id", profile.college_id)
    .maybeSingle();

  if (error) {
    console.error("College AI configuration lookup failed", { code: error.code });
    throw new OpenRouterError("Could not load this college's AI configuration.", 500);
  }
  if (!settings?.enabled) {
    throw new OpenRouterError("CampusClass AI is not enabled for this college. Contact your college administrator.", 503);
  }
  if (!settings.api_key_vault_id && (!settings.api_key_ciphertext || !settings.api_key_iv || !settings.api_key_tag)) {
    throw new OpenRouterError("The college AI key has not been configured. Ask an administrator to save an OpenRouter key.", 503);
  }

  // The quota RPC is atomic across all Next.js instances and routes.
  // Fail closed if its migration is missing rather than spending provider credits
  // without a server-enforced budget.
  const hasPdf = messages.some((message) => Array.isArray(message.content)
    && message.content.some((part) => part.type === "file"));
  const messageLengths = messages.map((message) => {
    if (typeof message.content === "string") return message.content.length;
    return message.content.reduce((total, part) => {
      if (part.type === "text") return total + part.text.length;
      // Server-generated signed URLs only, never client-supplied PDF data URLs.
      if (!/^https:\/\//.test(part.file.file_data) || part.file.file_data.length > 4000
        || !part.file.filename.toLowerCase().endsWith(".pdf")) return 100000;
      return total + part.file.file_data.length;
    }, 0);
  });
  if (messages.length > 24 || (hasPdf && messages.filter((message) =>
      Array.isArray(message.content) && message.content.some((part) => part.type === "file")).length > 1)
    || messageLengths.some((length) => length > 24000)
    || messageLengths.reduce((total, length) => total + length, 0) > 48000
    || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 2400) {
    throw new OpenRouterError("The AI request exceeds the supported context limit.", 400);
  }
  const { data: withinQuota, error: quotaError } = await admin.rpc("consume_ai_request_quota", {
    p_college_id: profile.college_id,
    p_user_id: profile.id,
  });
  if (quotaError) {
    console.error("AI request quota could not be checked", { code: quotaError.code });
    throw new OpenRouterError("AI request protection is unavailable. Apply the 202611180030 AI quota migration.", 503);
  }
  if (withinQuota !== true) {
    throw new OpenRouterError("Your hourly AI request limit has been reached. Try again next hour.", 429);
  }

  let apiKey: string;
  if (settings.api_key_vault_id) {
    // The service-only RPC reads a per-college secret from Supabase Vault.
    // Its root encryption key is managed outside Postgres and Vercel.
    const { data: vaultKey, error: vaultError } = await admin.rpc("read_college_ai_secret", {
      p_college_id: profile.college_id,
      p_user_id: profile.id,
    });
    if (vaultError) {
      console.error("College AI Vault lookup failed", { code: vaultError.code });
      throw new OpenRouterError("College AI secure storage is unavailable. Apply the Vault SQL migration.", 503);
    }
    if (typeof vaultKey !== "string" || !vaultKey.trim()) {
      throw new OpenRouterError("The saved college AI key is unavailable. Ask an administrator to save it again.", 503);
    }
    apiKey = vaultKey;
  } else {
    // Legacy AES-GCM rows remain readable only with their ORIGINAL master key.
    // A missing historical key cannot be reconstructed from its ciphertext.
    if (!process.env.OPENROUTER_ENCRYPTION_KEY) {
      throw new OpenRouterError("The college AI key uses legacy encryption and its server key is missing. Ask your administrator to re-save the OpenRouter API key in AI Settings after the Vault migration.", 503);
    }
    const secret = decryptOpenRouterKey(
      settings.api_key_ciphertext!,
      settings.api_key_iv!,
      settings.api_key_tag!,
    );
    apiKey = secret.toString("utf8");
    secret.fill(0);
  }

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
        ...(hasPdf ? { plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }] } : {}),
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
    if ([401, 402, 403, 404].includes(response.status)) {
      throw new OpenRouterError("The AI provider rejected the request. Ask your college administrator to check the API key, credits and model in AI Settings.", 503);
    }
    throw new OpenRouterError(
      response.status === 429
        ? "The college AI service is busy. Please try again shortly."
        : "The AI service could not complete this request.",
      response.status === 429 ? 429 : 502,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
      throw new OpenRouterError("The AI response timed out. Please try again.", 504);
    }
    throw new OpenRouterError("The AI provider returned an unreadable response. Please try again.", 502);
  }
  if (!payload || typeof payload !== "object" || !("choices" in payload)) {
    throw new OpenRouterError("The AI service returned an invalid response.", 502);
  }
  const choice = (Array.isArray(payload.choices) ? payload.choices[0] : undefined) as {
    error?: unknown;
    finish_reason?: unknown;
    message?: { content?: unknown };
  } | undefined;
  if (choice?.error || choice?.finish_reason === "error" || ("error" in payload && payload.error)) {
    console.error("OpenRouter completion failed after a successful HTTP response");
    throw new OpenRouterError("The AI provider could not finish the response. Please try again.", 502);
  }
  if (choice?.finish_reason === "length") {
    throw new OpenRouterError("The AI response reached its output limit. Try asking for a shorter answer.", 502);
  }
  const content = choice?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new OpenRouterError("The AI service returned an empty response.", 502);
  }
  return content.trim();
}
