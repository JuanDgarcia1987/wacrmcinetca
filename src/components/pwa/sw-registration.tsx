"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for PWA functionality.
 * Only runs in production (or when explicitly enabled) to avoid
 * interfering with development hot-reloading.
 */
export function SWRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // In development, skip SW registration to avoid caching issues with HMR
    const isDev = process.env.NODE_ENV === "development";
    if (isDev && !window.location.search.includes("sw=true")) return;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Check for updates periodically
        let refreshInterval: NodeJS.Timeout;
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                // New version available - could show a toast to refresh
                console.log("[SW] New version available, please refresh");
                // Optionally dispatch custom event for UI to show refresh prompt
                window.dispatchEvent(new CustomEvent("sw:update-available"));
              }
            });
          }
        });

        // Check for updates every 30 minutes
        refreshInterval = setInterval(() => {
          registration.update().catch(() => { /* ignore */ });
        }, 30 * 60 * 1000);

        return () => clearInterval(refreshInterval);
      } catch (err) {
        console.error("[SW] Registration failed:", err);
      }
    };

    registerSW();
  }, []);

  return null;
}

/**
 * Hook to listen for SW updates and prompt user to refresh.
 * Use in a top-level component if you want update notifications.
 */
export function useSWUpdate() {
  useEffect(() => {
    const handleUpdate = () => {
      if (confirm("Hay una nueva versión disponible. ¿Recargar?")) {
        window.location.reload();
      }
    };
    window.addEventListener("sw:update-available", handleUpdate);
    return () => window.removeEventListener("sw:update-available", handleUpdate);
  }, []);
}