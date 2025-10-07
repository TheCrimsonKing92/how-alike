"use client";
import React from "react";
import { getDetector } from "@/models/facemesh-adapter";

export default function DevPrewarm() {
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    type IdleCb = (deadline?: unknown) => void;
    const requestIdle: (cb: IdleCb) => number =
      (window as unknown as { requestIdleCallback?: (cb: IdleCb) => number }).requestIdleCallback ??
      ((cb: IdleCb) => window.setTimeout(() => cb(), 300));
    const cancelIdle: (id: number) => void =
      (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback ??
      ((id: number) => window.clearTimeout(id));

    const id = requestIdle(async () => {
      try {
        await getDetector();
      } catch {
        // ignore — health route and analyze will surface errors if needed
      }
    });
    return () => {
      cancelIdle(id);
    };
  }, []);
  return null;
}
