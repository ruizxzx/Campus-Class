"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import { BrandMark } from "@/components/ui";
import { LayoutDashboard, Users, GraduationCap, Building2, BookOpen, ClipboardList, FileText, Megaphone, Bell, UserRound, Settings, Sun, Moon, LogOut, Plus, CalendarDays, ChartNoAxesCombined, School, Menu, X, MessageCircle, NotebookPen, ListChecks, Award, BrainCircuit, MessagesSquare, RadioTower, PenLine, QrCode, TrendingUp, ClipboardCheck, Target } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PWAInstallButton } from "@/components/pwa-install-button";
import { languageOptions, translateUi, type UiLanguage } from "@/lib/ui-language";
import { chooseUiLanguage, useUiLanguage } from "@/lib/use-ui-language";

const iconMap = { LayoutDashboard, Users, GraduationCap, Building2, BookOpen, ClipboardList, FileText, Megaphone, Bell, UserRound, Settings, CalendarDays, ChartNoAxesCombined, School, MessageCircle, NotebookPen, ListChecks, Award, BrainCircuit, MessagesSquare, RadioTower, PenLine, QrCode, TrendingUp, ClipboardCheck, Target } as const;
type NavItem = { label: string; href: string; icon: keyof typeof iconMap };

function itemsFor(role: Profile["role"]): { section: string; items: NavItem[] }[] {
  if (role === "admin") return [
    { section: "Workspace", items: [{ label: "Overview", href: "/dashboard", icon: "LayoutDashboard" }, { label: "Faculty", href: "/admin/faculty", icon: "Users" }, { label: "Students", href: "/admin/students", icon: "GraduationCap" }] },
    { section: "Academics", items: [{ label: "Departments", href: "/admin/departments", icon: "Building2" }, { label: "Subjects", href: "/admin/subjects", icon: "BookOpen" }, { label: "Classes", href: "/admin/classes", icon: "School" }, { label: "Reports", href: "/admin/reports", icon: "ChartNoAxesCombined" }, { label: "Student success", href: "/success", icon: "TrendingUp" }, { label: "Attendance", href: "/attendance", icon: "QrCode" }, { label: "Gradebook", href: "/gradebook", icon: "ClipboardCheck" }, { label: "Outcomes", href: "/outcomes", icon: "Target" }, { label: "Academic calendar", href: "/calendar", icon: "CalendarDays" }, { label: "Courses & learning", href: "/courses", icon: "BookOpen" }, { label: "Quizzes & exams", href: "/quizzes", icon: "ClipboardList" }, { label: "Class stream", href: "/stream", icon: "RadioTower" }, { label: "Class chat", href: "/chat", icon: "MessagesSquare" }] },
    { section: "Personal", items: [{ label: "Notifications", href: "/notifications", icon: "Bell" }, { label: "Profile", href: "/profile", icon: "UserRound" }, { label: "AI settings", href: "/admin/ai", icon: "BrainCircuit" }, { label: "College settings", href: "/admin/settings", icon: "Settings" }] },
  ];
  if (role === "faculty") return [
    { section: "Teaching", items: [{ label: "Overview", href: "/dashboard", icon: "LayoutDashboard" }, { label: "My classes", href: "/faculty/classes", icon: "School" }, { label: "Assignments", href: "/faculty/assignments", icon: "FileText" }, { label: "Projects", href: "/faculty/projects", icon: "PenLine" }, { label: "Submissions", href: "/faculty/submissions", icon: "ClipboardList" }, { label: "Syllabus", href: "/syllabus", icon: "BookOpen" }, { label: "Timetable", href: "/schedule", icon: "CalendarDays" }, { label: "Attendance", href: "/attendance", icon: "QrCode" }, { label: "Student success", href: "/success", icon: "TrendingUp" }, { label: "Gradebook", href: "/gradebook", icon: "ClipboardCheck" }, { label: "Outcomes", href: "/outcomes", icon: "Target" }, { label: "Learning studio", href: "/faculty/learning", icon: "PenLine" }, { label: "Announcements", href: "/announcements", icon: "Megaphone" }, { label: "Class stream", href: "/stream", icon: "RadioTower" }, { label: "Class chat", href: "/chat", icon: "MessagesSquare" }, { label: "Courses & learning", href: "/courses", icon: "BookOpen" }, { label: "Quizzes & exams", href: "/quizzes", icon: "ClipboardList" }, { label: "My notes", href: "/notes", icon: "NotebookPen" }, { label: "To-do", href: "/todo", icon: "ListChecks" }] },
    { section: "Personal", items: [{ label: "Notifications", href: "/notifications", icon: "Bell" }, { label: "Profile", href: "/profile", icon: "UserRound" }, { label: "Settings", href: "/settings", icon: "Settings" }] },
  ];
  return [
    { section: "Learning", items: [{ label: "Overview", href: "/dashboard", icon: "LayoutDashboard" }, { label: "My classes", href: "/classes", icon: "School" }, { label: "Join a class", href: "/join", icon: "Plus" as never }, { label: "Assignments", href: "/assignments", icon: "FileText" }, { label: "Projects", href: "/projects", icon: "PenLine" }, { label: "Results", href: "/results", icon: "ClipboardList" }, { label: "Announcements", href: "/announcements", icon: "Megaphone" }, { label: "Class stream", href: "/stream", icon: "RadioTower" }, { label: "Class chat", href: "/chat", icon: "MessagesSquare" }, { label: "Syllabus", href: "/syllabus", icon: "BookOpen" }, { label: "Timetable", href: "/schedule", icon: "CalendarDays" }, { label: "Attendance", href: "/attendance", icon: "QrCode" }, { label: "Gradebook", href: "/gradebook", icon: "ClipboardCheck" }, { label: "AI Study Copilot", href: "/ai-study", icon: "BrainCircuit" }, { label: "My notes", href: "/notes", icon: "NotebookPen" }, { label: "To-do", href: "/todo", icon: "ListChecks" }, { label: "Certificates", href: "/certificates", icon: "Award" }, { label: "Courses & learning", href: "/courses", icon: "BookOpen" }, { label: "Quizzes & exams", href: "/quizzes", icon: "ClipboardList" }] },
    { section: "Personal", items: [{ label: "Notifications", href: "/notifications", icon: "Bell" }, { label: "Profile", href: "/profile", icon: "UserRound" }, { label: "Settings", href: "/settings", icon: "Settings" }] },
  ];
}

function NavLinks({ navSections, pathname, close, language }: { navSections: { section: string; items: NavItem[] }[]; pathname: string; close?: () => void; language: UiLanguage }) {
  return <div className="space-y-6">
    {navSections.map((section) => <div key={section.section}>
      <div className="mb-2 px-3 text-[9px] font-bold tracking-[.16em] text-[var(--muted)] uppercase">{translateUi(section.section, language)}</div>
      <div className="space-y-1">{section.items.map((item) => {
        const Icon = (iconMap as Record<string, typeof LayoutDashboard>)[item.icon] || Plus;
        const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
        return <Link key={item.href} href={item.href} onClick={close} aria-current={active ? "page" : undefined} className={`flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-colors ${active ? "bg-[var(--green-soft)] text-[var(--green-strong)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"}`}>
          <Icon size={16} className="shrink-0" strokeWidth={active ? 2.3 : 1.8}/><span className="min-w-0 flex-1 truncate">{translateUi(item.label, language)}</span>{active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--green)]"/>}
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
  const language=useUiLanguage();
  useEffect(()=>{document.documentElement.lang=language;},[language]);
  function chooseLanguage(next: UiLanguage) {
    chooseUiLanguage(next);
  }
  const [signingOut, setSigningOut] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const navSections = itemsFor(profile.role);
  const allItems = navSections.flatMap((section) => section.items);

  const closeMobileNav = useCallback(() => {
    setMobileOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  // Lock background scrolling while the mobile drawer is open. Keep keyboard
  // navigation inside it and close it on Escape or when switching to desktop.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileNav();
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    const desktop = window.matchMedia("(min-width: 768px)");
    function handleBreakpointChange() {
      if (desktop.matches) setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    desktop.addEventListener("change", handleBreakpointChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      desktop.removeEventListener("change", handleBreakpointChange);
    };
  }, [mobileOpen, closeMobileNav]);

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const languageToggle = <label className="mt-1 flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)]">
    <span className="min-w-0 flex-1">{translateUi("Language", language)}</span>
    <select className="max-w-28 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2 text-xs" value={language}
      aria-label="Interface language" onChange={(event) => chooseLanguage(event.target.value as UiLanguage)}>
      {languageOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
    </select>
  </label>;

  const appearanceToggle = (
    <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)]">{mounted && theme === "dark" ? <Sun size={14}/> : <Moon size={14}/>}</span>
      {translateUi(mounted && theme === "dark" ? "Light appearance" : "Dark appearance", language)}
    </button>
  );

  const signOutButton = (
    <button type="button" disabled={signingOut} onClick={signOut} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-60"><LogOut size={15} className="shrink-0"/>{translateUi(signingOut ? "Signing out…" : "Sign out", language)}</button>
  );

  return <div className="min-h-[100dvh] min-w-0 bg-[var(--bg)]">
    <a href="#main-content" className="sr-only fixed top-2 left-2 z-[70] rounded-lg bg-[var(--surface)] px-3 py-2 text-sm font-semibold focus:not-sr-only">Skip to main content</a>
    <aside className="desktop-sidebar fixed inset-y-0 left-0 z-30 hidden w-[252px] min-h-0 flex-col overflow-hidden border-r border-[var(--line)] bg-[var(--surface)] px-4 py-5 md:flex lg:px-5 lg:py-6" aria-label="Desktop sidebar">
      <div className="shrink-0 px-2"><BrandMark/></div>
      <div className="my-5 shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3 lg:my-7">
        <div className="flex min-w-0 items-center gap-2"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--green-soft)] text-[var(--green-strong)]"><School size={15}/></div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{profile.full_name}</div><div className="mt-0.5 text-[10px] capitalize text-[var(--muted)]">{profile.role} workspace</div></div></div>
      </div>
      <nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1" aria-label="Sidebar navigation"><NavLinks navSections={navSections} pathname={pathname} language={language}/></nav>
      <div className="mt-3 shrink-0 border-t border-[var(--line)] pt-3">
        {languageToggle}
        {appearanceToggle}
        {signOutButton}
      </div>
    </aside>

    <header className="fixed top-0 right-0 left-0 z-20 flex h-[66px] min-w-0 items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface)]/95 px-3 backdrop-blur sm:px-5 md:left-[252px] md:px-8">
      <div className="flex min-w-0 items-center gap-2 md:hidden"><button ref={menuButtonRef} type="button" className="btn-secondary !h-10 !w-10 shrink-0 !p-2" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-controls="mobile-sidebar" aria-expanded={mobileOpen}><Menu size={19}/></button><div className="min-w-0 scale-90 origin-left sm:scale-100"><BrandMark/></div></div>
      <div className="hidden text-xs font-medium text-[var(--muted)] md:block">Academic workspace <span className="mx-2 text-[var(--line)]">/</span><span className="capitalize text-[var(--text)]">{profile.role}</span></div>
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3"><PWAInstallButton/><Link href="/notifications" aria-label="Notifications" className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-2)]"><Bell size={18}/></Link><div className="hidden h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--green-soft)] text-xs font-bold text-[var(--green-strong)] sm:grid">{profile.full_name.slice(0,1).toUpperCase()}</div><div className="hidden max-w-36 text-right lg:block"><div className="truncate text-[11px] font-semibold">{profile.full_name}</div><div className="text-[10px] capitalize text-[var(--muted)]">{profile.role}</div></div></div>
    </header>

    {mobileOpen && <div className="fixed inset-0 z-50 md:hidden">
      <button type="button" tabIndex={-1} aria-label="Close navigation" className="absolute inset-0 h-full w-full bg-black/45" onClick={closeMobileNav}/>
      <aside id="mobile-sidebar" ref={drawerRef} role="dialog" aria-modal="true" aria-label="CampusClass navigation" className="absolute inset-y-0 left-0 flex h-full max-h-[100dvh] w-[min(340px,90vw)] min-w-0 flex-col overflow-hidden border-r border-[var(--line)] bg-[var(--surface)] px-4 pt-[max(16px,env(safe-area-inset-top))] shadow-2xl sm:px-5">
        <div className="mb-4 flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] pb-4"><BrandMark/><button ref={closeButtonRef} type="button" className="btn-secondary !h-10 !w-10 shrink-0 !p-2" onClick={closeMobileNav} aria-label="Close navigation"><X size={18}/></button></div>
        <div className="mb-4 shrink-0 rounded-xl bg-[var(--surface-2)] px-3 py-2"><div className="truncate text-xs font-semibold">{profile.full_name}</div><div className="mt-1 text-[10px] capitalize text-[var(--muted)]">{profile.role} workspace</div></div>
        <nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-4 pr-1 touch-pan-y" aria-label="Mobile sidebar navigation"><NavLinks navSections={navSections} pathname={pathname} close={closeMobileNav} language={language}/></nav>
        <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
          {languageToggle}
          {appearanceToggle}
          {signOutButton}
        </div>
      </aside>
    </div>}

    <main id="main-content" className="app-content min-h-[100dvh] min-w-0 overflow-x-hidden pt-[66px] md:pl-[252px]"><div className="app-page-container mx-auto w-full min-w-0 max-w-[1500px] px-3 py-5 sm:px-5 sm:py-8 md:px-8 md:py-10">{children}</div></main>
    <nav className="mobile-nav fixed right-0 bottom-0 left-0 z-30 items-stretch justify-around border-t border-[var(--line)] bg-[var(--surface)]/95 px-1 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur md:hidden" aria-label="Quick navigation">
      {allItems.slice(0,5).map((item) => { const Icon = (iconMap as Record<string, typeof LayoutDashboard>)[item.icon] || Plus; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[9px] font-semibold ${active ? "text-[var(--green-strong)]" : "text-[var(--muted)]"}`}><Icon size={18} className="shrink-0"/><span className="w-full truncate text-center">{translateUi(item.label, language)}</span></Link>; })}
    </nav>
  </div>;
}
