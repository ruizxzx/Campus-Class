export type Role = "admin" | "faculty" | "student";
export type Profile = {
  id: string;
  college_id: string;
  role: Role;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_path: string | null;
  status: "active" | "inactive" | "pending";
  created_at: string;
};

export type ClassSummary = {
  id: string;
  college_id: string;
  subject_id: string;
  section: string;
  academic_year: string;
  semester: number;
  display_name: string | null;
  is_active: boolean;
  enrollment_open: boolean;
  subjects?: { name: string; code: string } | null;
};

export type ClassMessage = {
  id: string;
  college_id: string;
  class_id: string;
  sender_id: string;
  body: string;
  parent_id: string | null;
  pinned_at: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  attachment_ready: boolean;
  reaction_updated_at: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type ClassMessageReaction = {
  college_id: string;
  class_id: string;
  message_id: string;
  user_id: string;
  reaction: "👍" | "❤️" | "🎉" | "😄" | "👀";
  created_at: string;
};

export type ClassChatReadState = {
  college_id: string;
  class_id: string;
  user_id: string;
  last_read_at: string;
};

export type Assignment = {
  id: string;
  college_id: string;
  class_id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  due_at: string | null;
  max_marks: number;
  work_type?: "assignment" | "project";
  allow_late: boolean;
  allow_resubmission: boolean;
  status: "draft" | "published" | "archived";
  created_at: string;
  classes?: { display_name: string | null; section: string; subjects?: { name: string; code: string } | null } | null;
};

/** Durable import jobs and academic playback evidence (SQL 045–047). */
export type YoutubePlaylistImportStatus = "queued" | "processing" | "review" |
  "applying" | "applied" | "failed" | "cancelled";
export type YoutubeImportJob = {
  id: string; college_id: string; created_by: string; subject_id: string;
  target_course_id: string | null; playlist_id: string;
  batch_id: string; status: YoutubePlaylistImportStatus;
  processed_count: number; expected_count: number;
  next_page_token: string | null; failure_message: string | null;
};
export type YoutubeImportedLesson = {
  college_id: string; course_id: string; lesson_id: string;
  source_id: string; video_id: string; duration_seconds: number;
  playlist_position: number; removed_from_playlist_at: string | null;
};
export type YoutubeStudentWatchProgress = {
  college_id: string; course_id: string; lesson_id: string; student_id: string;
  position_seconds: number; duration_seconds: number; watched_seconds: number;
  percent: number; completed_at: string | null; last_activity_at: string;
};
