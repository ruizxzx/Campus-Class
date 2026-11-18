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
export const streamPostSchema = z.object({
  class_id: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  body: z.string().trim().max(10000),
  post_type: z.enum(["announcement", "assignment", "quiz", "question", "material", "poll"]),
  visibility: z.enum(["class", "selected_students"]),
  student_ids: z.array(z.string().uuid()).max(300).refine((ids) => new Set(ids).size === ids.length),
  pinned: z.boolean(),
}).superRefine((value, context) => {
  if (value.visibility === "selected_students" && value.student_ids.length === 0) {
    context.addIssue({ code: "custom", path: ["student_ids"], message: "Choose at least one student." });
  }
  if (value.visibility === "class" && value.student_ids.length > 0) {
    context.addIssue({ code: "custom", path: ["student_ids"], message: "Class-wide posts cannot have targeted recipients." });
  }
});

const quizQuestionSchema = z.object({
  question_type: z.enum(["multiple_choice", "multiple_select", "true_false", "short_answer"]),
  prompt: z.string().trim().min(1).max(5000),
  options: z.array(z.string().trim().min(1).max(500)).max(100),
  answer_key: z.union([
    z.string().max(500),
    z.array(z.string().max(500)).max(100),
    z.null(),
  ]),
  marks: z.number().finite().gt(0).max(10000),
}).superRefine((question, context) => {
  const distinctOptions = new Set(question.options);
  if (distinctOptions.size !== question.options.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Question choices must be unique." });
  }

  if (question.question_type === "short_answer") {
    if (question.options.length || question.answer_key !== null) {
      context.addIssue({ code: "custom", path: ["answer_key"], message: "Short answers are manually graded." });
    }
    return;
  }

  if (question.question_type === "true_false") {
    if (question.options.length !== 2 || question.options[0] !== "True" || question.options[1] !== "False"
      || (question.answer_key !== "True" && question.answer_key !== "False")) {
      context.addIssue({ code: "custom", path: ["answer_key"], message: "Choose a valid true/false answer." });
    }
    return;
  }

  if (question.options.length < 2) {
    context.addIssue({ code: "custom", path: ["options"], message: "Add at least two choices." });
  }
  if (question.question_type === "multiple_choice") {
    if (typeof question.answer_key !== "string" || !question.options.includes(question.answer_key)) {
      context.addIssue({ code: "custom", path: ["answer_key"], message: "Choose one correct option." });
    }
    return;
  }

  if (!Array.isArray(question.answer_key) || !question.answer_key.length
    || new Set(question.answer_key).size !== question.answer_key.length
    || question.answer_key.some((answer) => !question.options.includes(answer))) {
    context.addIssue({ code: "custom", path: ["answer_key"], message: "Choose one or more valid answers." });
  }
});

export const createQuizSchema = z.object({
  class_id: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(10000).default(""),
  opens_at: z.string().datetime({ offset: true }).nullable(),
  closes_at: z.string().datetime({ offset: true }).nullable(),
  duration_minutes: z.number().int().min(1).max(600).nullable(),
  attempts_allowed: z.number().int().min(1).max(20),
  show_score_after_submit: z.boolean(),
  publish: z.boolean(),
  questions: z.array(quizQuestionSchema).min(1).max(100),
}).superRefine((quiz, context) => {
  if (quiz.opens_at && quiz.closes_at
    && new Date(quiz.closes_at).getTime() <= new Date(quiz.opens_at).getTime()) {
    context.addIssue({ code: "custom", path: ["closes_at"], message: "The closing time must be after the opening time." });
  }
  const totalMarks = quiz.questions.reduce((total, question) => total + question.marks, 0);
  if (totalMarks > 999999.99) {
    context.addIssue({ code: "custom", path: ["questions"], message: "The total marks exceed the supported maximum." });
  }
});

export const chatMessageSchema = z.object({
  class_id: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
  parent_id: z.string().uuid().nullable().default(null),
});

export const editChatMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const chatReactionSchema = z.object({
  message_id: z.string().uuid(),
  reaction: z.enum(["👍", "❤️", "🎉", "😄", "👀"]),
});

export const chatMessageIdSchema = z.object({
  message_id: z.string().uuid(),
});

export const chatRouteIdSchema = z.string().uuid();

export const chatRoomIdSchema = z.object({
  class_id: z.string().uuid(),
});

export const collegeAISettingsSchema = z.object({
  enabled: z.boolean(),
  model: z.string().trim().min(3).max(120).regex(/^[a-zA-Z0-9._/-]+$/),
  api_key: z.string().trim().min(20).max(300).optional().or(z.literal("")),
});

export const aiStudyAssistantSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(4000),
  })).max(8).default([]),
});

export const aiSummarizeSchema = z.object({
  resource_type: z.enum(["post", "course", "lesson", "syllabus"]),
  resource_id: z.string().uuid(),
});

export const aiEvaluateSchema = z.object({
  submission_id: z.string().uuid(),
});

export const aiResourceAssistantSchema = z.object({
  resource_type: z.enum(["post", "course", "lesson", "syllabus"]),
  resource_id: z.string().uuid(),
  question: z.string().trim().min(2).max(4000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(4000),
  })).max(8).default([]),
});

export const aiEvaluationSuggestionSchema = z.object({
  marks: z.number().finite().min(0),
  feedback: z.string().trim().max(6000),
  rationale: z.string().trim().max(3000).default(""),
});

export const syllabusUploadSchema = z.object({
  title: z.string().trim().min(2).max(180),
  outline_text: z.string().trim().max(50000).default(""),
});

const timeOfDaySchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const classScheduleSchema = z.object({
  class_id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  start_time: timeOfDaySchema,
  end_time: timeOfDaySchema,
  location: z.string().trim().max(180).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
}).refine((value) => value.end_time > value.start_time, {
  message: "The end time must be after the start time.",
  path: ["end_time"],
});
