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

export type Assignment = {
  id: string;
  college_id: string;
  class_id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  due_at: string | null;
  max_marks: number;
  allow_late: boolean;
  allow_resubmission: boolean;
  status: "draft" | "published" | "archived";
  created_at: string;
  classes?: { display_name: string | null; section: string; subjects?: { name: string; code: string } | null } | null;
};
