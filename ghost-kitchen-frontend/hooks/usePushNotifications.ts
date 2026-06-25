"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

// Converts the VAPID public key (base64url, as returned by the backend and
// by `web-push generate-vapid-keys`) into the Uint8Array shape
// pushManager.subscribe's applicationServerKey expects — the Push API does
// not accept a raw base64url string.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export type PushPermissionState = "unsupported" | "default" | "granted" | "denied";

// Registers /sw.js once on mount (idempotent — re-registering an identical
// SW is a no-op per the spec) and exposes a single `subscribe()` action the
// UI calls on an explicit user action (a button), never automatically — a
// permission prompt firing on page load with no context is a common reason
// users instinctively deny it.
export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>("default");
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PushPermissionState);
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures (e.g. served over non-HTTPS in some browsers,
      // or blocked by a restrictive embedded webview) degrade silently —
      // push is additive on top of the existing Socket.IO updates, never
      // required for the app to function.
    });
  }, []);

  const subscribe = useCallback(async () => {
    if (permission === "unsupported") return false;
    setIsSubscribing(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);
      if (result !== "granted") return false;

      const { data } = await api.get("/push/vapid-public-key");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey) as BufferSource,
      });

      await api.post("/push/subscribe", { subscription: subscription.toJSON() });
      return true;
    } catch {
      return false;
    } finally {
      setIsSubscribing(false);
    }
  }, [permission]);

  return { permission, isSubscribing, subscribe };
}
