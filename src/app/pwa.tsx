"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Registers the service worker, and surfaces the two moments the user cares
 * about: "you can install this" and "a new version is ready".
 */
export default function PWA() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    const watchForUpdate = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener("statechange", () => {
          // A worker that installs while one is already in control is an update.
          if (next.state === "installed" && navigator.serviceWorker.controller) setWaiting(next);
        });
      });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return;
        watchForUpdate(reg);
        // Catch a version published while the tab stayed open.
        poll = setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch(() => {});

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    const sync = () => setOffline(!navigator.onLine);

    sync();
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (!offline && !waiting && !installPrompt) return null;

  return (
    <div className="pwa-bar" role="status" aria-live="polite">
      {offline && (
        <span className="pwa-pill pwa-pill-offline">
          <span className="pwa-dot" aria-hidden="true" />
          Offline — deck generation is paused
        </span>
      )}
      {waiting && (
        <button type="button" className="pwa-pill pwa-pill-action" onClick={() => waiting.postMessage("SKIP_WAITING")}>
          Update available — reload
        </button>
      )}
      {installPrompt && !offline && (
        <button type="button" className="pwa-pill pwa-pill-action" onClick={install}>
          Install app
        </button>
      )}
    </div>
  );
}
