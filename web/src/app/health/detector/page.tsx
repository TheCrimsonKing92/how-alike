"use client";
import React from "react";
import { getDetector } from "@/models/detector";

export default function DetectorHealth() {
  const [status, setStatus] = React.useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = React.useState<string>("");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const shallow = params.get("shallow") === "1";
        const adapter = params.get("adapter");
        if (shallow) {
          const tf = await import("@tensorflow/tfjs-core");
          try {
            await import("@tensorflow/tfjs-backend-webgl");
            await tf.setBackend("webgl");
          } catch {
            await import("@tensorflow/tfjs-backend-cpu");
            await tf.setBackend("cpu");
          }
          const mod = await import("@tensorflow-models/face-landmarks-detection");
          // Touch the enum to ensure module resolution
          void mod.SupportedModels.MediaPipeFaceMesh;
        } else {
          if (adapter === "parsing") {
            const mod = await import("@/models/parsing-adapter");
            await mod.parsingAdapter.getDetector();
          } else {
            await getDetector();
          }
        }
        if (!alive) return;
        setStatus("ok");
      } catch (e: unknown) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : String(e);
        setMessage(msg);
        setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (status === "loading") return <p>loading</p>;
  if (status === "error") return <p>error: {message}</p>;
  return <p>ok</p>;
}
