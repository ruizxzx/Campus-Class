import Link from "next/link";
import { ArrowUpRight, BookOpen, ClipboardCheck, RadioTower, LibraryBig } from "lucide-react";

const sections = [
  { id: "stream", label: "Class stream", href: "/stream", icon: RadioTower, actionHref: "/faculty/learning?tab=stream", actionLabel: "Create a post" },
  { id: "courses", label: "Courses", href: "/courses", icon: BookOpen, actionHref: "/faculty/learning?tab=course", actionLabel: "Create learning content" },
  { id: "library", label: "Digital library", href: "/library", icon: LibraryBig, actionHref: "/library", actionLabel: "Upload study resources" },
  { id: "assessments", label: "Quizzes & exams", href: "/quizzes", icon: ClipboardCheck, actionHref: "/faculty/learning?tab=quiz", actionLabel: "Create an assessment" },
] as const;

type Props = {
  active: (typeof sections)[number]["id"];
  title: string;
  description: string;
  canAuthor?: boolean;
};

export function LearningHubHeader({ active, title, description, canAuthor = false }: Props) {
  const activeSection = sections.find((section) => section.id === active);
  return (
    <section className="mb-6 overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <div className="eyebrow flex items-center gap-2">
            <BookOpen size={13} className="text-[var(--green-strong)]" />
            Learning hub
          </div>
          <h1 className="page-title mt-3">{title}</h1>
          <p className="page-subtitle mt-2">{description}</p>
        </div>
        {canAuthor && activeSection ? (
          <Link className="btn-primary shrink-0" href={activeSection.actionHref}>
            {activeSection.actionLabel}
            <ArrowUpRight size={15} />
          </Link>
        ) : null}
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-[var(--line)] px-3 py-2 sm:px-5" aria-label="Learning hub">
        {sections.map(({ id, label, href, icon: Icon }) => {
          const selected = id === active;
          return (
            <Link
              key={id}
              href={href}
              aria-current={selected ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors ${
                selected
                  ? "bg-[var(--green-soft)] text-[var(--green-strong)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
