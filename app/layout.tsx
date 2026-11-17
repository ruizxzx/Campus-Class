import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CampusClass — Academic workspace", template: "%s · CampusClass" },
  description: "A private academic workspace for colleges, faculty and students.",
  applicationName: "CampusClass",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><ThemeProvider>{children}<Toaster position="top-right" richColors closeButton/></ThemeProvider></body></html>;
}
