import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { emailSchema } from "@/lib/validators";

export const bulkRowSchema = z.object({
 full_name: z.string().trim().min(2).max(120),
 email: emailSchema,
 role: z.enum(["faculty","student"]),
 department: z.string().trim().max(120).optional().default(""),
 semester: z.number().int().min(1).max(12).nullable().optional(),
 section: z.string().trim().max(16).optional().default(""),
 identifier: z.string().trim().max(60).optional().default(""),
 synthetic: z.boolean().default(false),
}).refine(r => !r.synthetic || /\.(example|test|invalid)$/.test(r.email.split("@")[1] ?? ""), "Demo accounts require a reserved .example, .test or .invalid domain.");
export const bulkRequestSchema = z.object({
 idempotency_key: z.string().uuid(),
 rows: z.array(bulkRowSchema).min(1).max(150),
}).superRefine((data,ctx)=>{
 const seen = new Set<string>();
 data.rows.forEach((row,i) => {
  if (seen.has(row.email)) ctx.addIssue({code:"custom",path:["rows",i,"email"],message:"Duplicate email in batch."});
  seen.add(row.email);
 });
});
export function bulkPassword(rowId: string) {
 const secret=process.env.BULK_ACCOUNT_PASSWORD_SECRET;
 if (!secret || secret.length < 32) throw new Error("BULK_ACCOUNT_PASSWORD_SECRET must be configured with at least 32 characters.");
 return "Cc!" + createHmac("sha256",secret).update("campus-class-bulk:v1:"+rowId).digest("base64url").slice(0,28);
}
