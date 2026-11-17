import { z } from "zod";

export const emailSchema = z.string().trim().email().max(254).transform((v) => v.toLowerCase());
export const inviteSchema = z.object({
  email: emailSchema,
  full_name: z.string().trim().min(2).max(120),
  role: z.enum(["faculty", "student"]),
  password: z.string().min(8).max(128),
});
export const acceptInviteSchema = z.object({
  token: z.string().min(32).max(256).optional(),
  email: emailSchema.optional(),
  password: z.string().min(8).max(128).optional(),
  full_name: z.string().trim().min(2).max(120).optional(),
}).refine((value) => !!value.token || (!!value.email && !!value.password), {
  message: "Provide a valid invitation token or the invited email and password.",
  path: ["token"],
});
export const joinClassSchema = z.object({ code: z.string().trim().min(5).max(40).transform((v) => v.toUpperCase()) });
export const evaluateSchema = z.object({
  marks: z.number().finite().min(0),
  feedback: z.string().max(10000).optional().default(""),
  release: z.boolean().default(true),
});
export const submitSchema = z.object({
  text_answer: z.string().max(30000).optional().default(""),
  files: z.array(z.object({ file_name: z.string().min(1).max(255), storage_path: z.string().min(1).max(1024), mime_type: z.string().max(120).optional(), file_size: z.number().int().min(0).max(31457280).optional() })).max(8).default([]),
}).refine((v) => v.text_answer.trim().length > 0 || v.files.length > 0, "Add a written answer or at least one attachment.");
export const editSubmissionSchema = z.object({
  text_answer: z.string().max(30000),
});
