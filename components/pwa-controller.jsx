"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";

export function PwaController() {
  const { t } = useLanguage();
  const [installPrompt, setInstallPrompt] = useState(null);
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [showIosInstallHelp, setShowIosInstallHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function handleBeforeInstallPrompt(event) {
      if (isStandalonePwa()) return;
      event.preventDefault();
      setInstallPrompt(event);
      setShowIosInstallHelp(false);
    }

    function handleAppInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
      window.setTimeout(() => setInstalled(false), 3500);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    setShowIosInstallHelp(isIosDevice() && !isStandalonePwa());

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !isSecurePwaContext()
    ) {
      return undefined;
    }

    let mounted = true;

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then((registration) => {
          if (!mounted) return;
          if (registration.waiting) {
            setWaitingWorker(registration.waiting);
          }

          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                setWaitingWorker(worker);
              }
            });
          });
        })
        .catch(() => {});
    }, { once: true });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });

    return () => {
      mounted = false;
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
  }

  function updateApp() {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    setWaitingWorker(null);
  }

  function dismissInstallPrompt() {
    setInstallPrompt(null);
    setShowIosInstallHelp(false);
  }

  if (!installPrompt && !waitingWorker && !installed && !showIosInstallHelp) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-border bg-card p-3 text-card-foreground shadow-xl sm:left-auto sm:right-4 sm:w-96">
      {waitingWorker ? (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t("updateAvailable")}</div>
            <div className="text-xs text-muted-foreground">{t("refreshLatestApp")}</div>
          </div>
          <Button size="sm" onClick={updateApp}>
            <RefreshCw className="h-4 w-4" />
            {t("update")}
          </Button>
        </div>
      ) : installed ? (
        <div className="text-sm font-semibold">{t("installedHappyBoat")}</div>
      ) : showIosInstallHelp ? (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t("installHappyBoat")}</div>
            <div className="text-xs text-muted-foreground">{t("installIosPrompt")}</div>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            onClick={dismissInstallPrompt}
            aria-label={t("dismissInstallPrompt")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t("installHappyBoat")}</div>
            <div className="text-xs text-muted-foreground">{t("installPhonePrompt")}</div>
          </div>
          <Button size="sm" onClick={installApp}>
            <Download className="h-4 w-4" />
            {t("install")}
          </Button>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            onClick={dismissInstallPrompt}
            aria-label={t("dismissInstallPrompt")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function isSecurePwaContext() {
  return window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
}

function isStandalonePwa() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}
