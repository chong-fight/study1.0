"use client";

import { useEffect } from "react";

export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      );
      if ("caches" in window) {
        void caches.keys().then((keys) =>
          Promise.all(keys.map((key) => caches.delete(key))),
        );
      }
      return;
    }
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) window.location.reload();
    });
    navigator.serviceWorker
      .register(`${basePath}/sw.js`, { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        // The application remains usable online if PWA registration is unavailable.
      });
  }, []);

  return null;
}
