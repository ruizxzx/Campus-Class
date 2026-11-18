"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

export function PWAInstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    setInstalled(media.matches || Boolean(document.referrer.includes("android-app://")));
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // The app remains usable if service-worker registration is unavailable.
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) {
      const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (iOS) toast.message("Install CampusClass", { description: "Tap Share, then choose Add to Home Screen." });
      else toast.message("Install CampusClass", { description: "Use your browser menu and choose Install app or Add to Home screen." });
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setPromptEvent(null);
  }

  if (installed) return null;
  return (
    <button type="button" onClick={() => void install()} className="btn-secondary !h-10 !w-10 shrink-0 items-center gap-1.5 !p-2 text-[10px] sm:!w-auto sm:!px-3" aria-label="Install CampusClass app">
      <Download size={14}/>
      <span className="hidden sm:inline">Install app</span>
    </button>
  );
}
