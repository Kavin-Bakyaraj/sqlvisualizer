"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { performLayout } from "@/lib/layout.worker";

const LAYOUT_TIMEOUT_MS = 10000;

type LayoutResponse = {
  id: number;
  nodes: Node[];
  error?: string;
};

export function useLayout() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [isLayouting, setIsLayouting] = useState(false);

  useEffect(() => {
    try {
      workerRef.current = new Worker(
        new URL("../lib/layout.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch (error) {
      console.warn("Layout worker unavailable, using main thread layout:", error);
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const layoutInWorker = useCallback((nodes: Node[], edges: Edge[]) => {
    const worker = workerRef.current;

    if (!worker) {
      return null;
    }

    const id = ++requestIdRef.current;

    return new Promise<Node[]>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Layout worker timed out"));
      }, LAYOUT_TIMEOUT_MS);

      const cleanup = () => {
        window.clearTimeout(timeout);
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
        worker.removeEventListener("messageerror", handleMessageError);
      };

      const handleMessage = (event: MessageEvent<LayoutResponse>) => {
        if (event.data.id !== id) {
          return;
        }

        cleanup();

        if (event.data.error) {
          reject(new Error(event.data.error));
          return;
        }

        resolve(event.data.nodes);
      };

      const handleError = (event: ErrorEvent) => {
        cleanup();
        reject(event.error || new Error(event.message || "Layout worker failed"));
      };

      const handleMessageError = () => {
        cleanup();
        reject(new Error("Layout worker returned an unreadable response"));
      };

      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      worker.addEventListener("messageerror", handleMessageError);
      worker.postMessage({ id, nodes, edges });
    });
  }, []);

  const layout = useCallback(
    async (nodes: Node[], edges: Edge[]) => {
      setIsLayouting(true);

      try {
        const workerResult = layoutInWorker(nodes, edges);

        if (workerResult) {
          return await workerResult;
        }

        return await performLayout(nodes, edges);
      } catch (error) {
        console.warn("Layout worker failed, using main thread layout:", error);
        return performLayout(nodes, edges);
      } finally {
        setIsLayouting(false);
      }
    },
    [layoutInWorker],
  );

  return { layout, isLayouting };
}
