"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import { BrandMark } from "@/components/ui";
import { LayoutDashboard, Users, GraduationCap, Building2, BookOpen, ClipboardList, FileText, Megaphone, Bell, UserRound, Settings, Sun, Moon, LogOut, Plus, CalendarDays, ChartNoAxesCombined, School, ChevronDown, Menu, X, MessageCircle, NotebookPen, ListChecks, Award, BrainCircuit, MessagesSquare, RadioTower, PenLine } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { PWAInstallButton } from "@/components/pwa-install-button";

const iconMap = { LayoutDashboard, Users, GraduationCap, Building2, BookOpen, ClipboardList, FileText, Megaphone, Bell, UserRound, Settings, CalendarDays, ChartNoAxesCombined, School, MessageCircle, NotebookPen, ListChecks, Award, BrainCircuit, MessagesSquare, RadioTower, PenLine } as const;
type NavItem = { label: string; href: string; icon: keyof typeof iconMap };

function itemsFor(role: Profile["role"]): { section: string; items: NavItem[] }[] {
  if (role === "admin") return [
    { section: "Workspace", items: [{ label: "Overview", href: "/dashboard", icon: "LayoutDashboard" }, { label: "Faculty", href: "/admin/faculty", icon: "Users" }, { label: "Students", href: "/admin/students", icon: "GraduationCap" }] },
    { section: "Academics", items: [{ label: "Departments", href: "/admin/departments", icon: "Building2" }, { label: "Subjects", href: "/admin/subjects", icon: "BookOpen" }, { label: "Classes", href: "/admin/classes", icon: "School" }, { label: "Reports", href: "/admin/reports", icon: "ChartNoAxesCombined" }, { label: "Academic calendar", href: "/calendar", icon: "CalendarDays" }, { label: "Courses & learning", href: "/courses", icon: "BookOpen" }, { label: "Quizzes & exams", href: "/quizzes", icon: "ClipboardList" }, { label: "Class stream", href: "/stream", icon: "RadioTower" }, { label: "Class chat", href: "/chat", icon: "MessagesSquare" }] },
    { section: "Personal", items: [{ label: "Notifications", href: "/notifications", icon: "Bell" }, { label: "Profile", href: "/profile", icon: "UserRound" }, { label: "AI settings", href: "/admin/ai", icon: "BrainCircuit" }, { label: "College settings", href: "/admin/settings", icon: "Settings" }] },
  ];
  if (role === "faculty") return [
    { section: "Teaching", items: [{ label: "Overview", href: "/dashboard", icon: "LayoutDashboard" }, { label: "My classes", href: "/faculty/classes", icon: "School" }, { label: "Assignments", href: "/faculty/assignments", icon: "FileText" }, { label: "Projects", href: "/faculty/projects", icon: "PenLine" }, { label: "Submissions", href: "/faculty/submissions", icon: "ClipboardList" }, { label: "Syllabus", href: "/syllabus", icon: "BookOpen" }, { label: "Timetable", href: "/schedule", icon: "CalendarDays" }, { label: "Learning studio", href: "/faculty/learning", icon: "PenLine" }, { label: "Announcements", href: "/announcements", icon: "Megaphone" }, { label: "Class stream", href: "/stream", icon: "RadioTower" }, { label: "Class chat", href: "/chat", icon: "MessagesSquare" }, { label: "Courses & learning", href: "/courses", icon: "BookOpen" }, { label: "Quizzes & exams", href: "/quizzes", icon: "ClipboardList" }, { label: "My notes", href: "/notes", icon: "NotebookPen" }, { label: "To-do", href: "/todo", icon: "ListChecks" }] },
    { section: "Personal", items: [{ label: "Notifications", href: "/notifications", icon: "Bell" }, { label: "Profile", href: "/profile", icon: "UserRound" }, { label: "Settings", href: "/settings", icon: "Settings" }] },
  ];
  return [
    { section: "Learning", items: [{ label: "Overview", href: "/dashboard", icon: "LayoutDashboard" }, { label: "My classes", href: "/classes", icon: "School" }, { label: "Join a class", href: "/join", icon: "Plus" as never }, { label: "Assignments", href: "/assignments", icon: "FileText" }, { label: "Projects", href: "/projects", icon: "PenLine" }, { label: "Results", href: "/results", icon: "ClipboardList" }, { label: "Announcements", href: "/announcements", icon: "Megaphone" }, { label: "Class stream", href: "/stream", icon: "RadioTower" }, { label: "Class chat", href: "/chat", icon: "MessagesSquare" }, { label: "Syllabus", href: "/syllabus", icon: "BookOpen" }, { label: "Timetable", href: "/schedule", icon: "CalendarDays" }, { label: "AI study assistant", href: "/ai-study", icon: "BrainCircuit" }, { label: "My notes", href: "/notes", icon: "NotebookPen" }, { label: "To-do", href: "/todo", icon: "ListChecks" }, { label: "Certificates", href: "/certificates", icon: "Award" }, { label: "Courses & learning", href: "/courses", icon: "BookOpen" }, { label: "Quizzes & exams", href: "/quizzes", icon: "ClipboardList" }] },
    { section: "Personal", items: [{ label: "Notifications", href: "/notifications", icon: "Bell" }, { label: "Profile", href: "/profile", icon: "UserRound" }, { label: "Settings", href: "/settings", icon: "Settings" }] },
  ];
}

function NavLinks({ navSections, pathname, close }: { navSections: { section: string; items: NavItem[] }[]; pathname: string; close?: () => void }) {
  return <div className="space-y-6">
    {navSections.map((section) => <div key={section.section}>
      <div className="mb-2 px-3 text-[9px] font-bold tracking-[.16em] text-[var(--muted)] uppercase">{section.section}</div>
      <div className="space-y-1">{section.items.map((item) => {
        const Icon = (iconMap as Record<string, typeof LayoutDashboard>)[item.icon] || Plus;
        const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
        return <Link key={item.href} href={item.href} onClick={close} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-colors ${active ? "bg-[var(--green-soft)] text-[var(--green-strong)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"}`}>
          <Icon size={16} strokeWidth={active ? 2.3 : 1.8}/><span>{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--green)]"/>}
        </Link>;
      })}</div>
    </div>)}
  </div>;
}

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const navSections = itemsFor(profile.role);
  const allItems = navSections.flatMap((s) => s.items);

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return <div className="min-h-screen bg-[var(--bg)]">
    <aside className="desktop-sidebar fixed inset-y-0 left-0 z-30 flex w-[252px] flex-col border-r border-[var(--line)] bg-[var(--surface)] px-5 py-6">
      <div className="px-2"><BrandMark/></div>
      <div className="my-7 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
        <div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><School size={15}/></div><div className="min-w-0"><div className="truncate text-[11px] font-semibold">{profile.full_name}</div><div className="mt-0.5 text-[10px] capitalize text-[var(--muted)]">{profile.role} workspace</div></div><ChevronDown size={13} className="ml-auto text-[var(--muted)]"/></div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto pr-1"><NavLinks navSections={navSections} pathname={pathname}/></nav>
      <div className="mt-5 border-t border-[var(--line)] pt-4">
        <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><span className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--surface-2)]">{mounted && theme === "dark" ? <Sun size={14}/> : <Moon size={14}/>}</span>{mounted && theme === "dark" ? "Light appearance" : "Dark appearance"}</button>
        <button disabled={signingOut} onClick={signOut} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]"><LogOut size={15}/>{signingOut ? "Signing out…" : "Sign out"}</button>
      </div>
    </aside>

    <header className="fixed top-0 right-0 left-0 z-20 flex h-[66px] items-center justify-between border-b border-[var(--line)] bg-[var(--surface)]/95 px-5 backdrop-blur md:left-[252px] md:px-8">
      <div className="flex items-center gap-3 md:hidden"><button className="btn-secondary !p-2" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={16}/></button><BrandMark/></div>
      <div className="hidden text-xs font-medium text-[var(--muted)] md:block">Academic workspace <span className="mx-2 text-[var(--line)]">/</span><span className="capitalize text-[var(--text)]">{profile.role}</span></div>
      <div className="ml-auto flex items-center gap-3"><PWAInstallButton/><Link href="/notifications" className="relative grid h-9 w-9 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-2)]"><Bell size={17}/></Link><div className="hidden h-8 w-8 place-items-center rounded-full bg-[var(--green-soft)] text-xs font-bold text-[var(--green-strong)] sm:grid">{profile.full_name.slice(0,1).toUpperCase()}</div><div className="hidden text-right sm:block"><div className="text-[11px] font-semibold">{profile.full_name}</div><div className="text-[10px] capitalize text-[var(--muted)]">{profile.role}</div></div></div>
    </header>

    {mobileOpen && <div className="fixed inset-0 z-50 bg-black/35 md:hidden" onClick={() => setMobileOpen(false)}><div className="h-full w-[min(320px,86vw)] bg-[var(--surface)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="mb-7 flex items-center justify-between"><BrandMark/><button className="btn-secondary !p-2" onClick={() => setMobileOpen(false)}><X size={15}/></button></div><NavLinks navSections={navSections} pathname={pathname} close={() => setMobileOpen(false)}/><button onClick={signOut} className="mt-8 flex items-center gap-3 text-xs font-semibold text-[var(--muted)]"><LogOut size={15}/>Sign out</button></div></div>}

    <main className="app-content min-h-screen pt-[66px] md:pl-[252px]"><div className="mx-auto w-full max-w-[1500px] px-5 py-8 md:px-8 md:py-10">{children}</div></main>
    <nav className="mobile-nav fixed right-0 bottom-0 left-0 z-30 justify-around border-t border-[var(--line)] bg-[var(--surface)]/95 px-2 py-2 pb-[max(env(safe-area-inset-bottom),8px)] backdrop-blur md:hidden">
      {allItems.slice(0,5).map((item) => { const Icon = (iconMap as Record<string, typeof LayoutDashboard>)[item.icon] || Plus; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[9px] font-semibold ${active ? "text-[var(--green-strong)]" : "text-[var(--muted)]"}`}><Icon size={18}/><span className="max-w-[64px] truncate">{item.label}</span></Link>; })}
    </nav>
  </div>;
}
