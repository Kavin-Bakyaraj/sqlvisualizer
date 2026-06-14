"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { performLayout } from "@/lib/layout.worker";
import type { LayoutSettings } from "@/lib/layout.worker";

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
  const isWorkerActiveRef = useRef(false);

  useEffect(() => {
    try {
      const worker = new Worker(
        new URL("../lib/layout.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;

      // Ping the worker to check if it compiles and runs correctly
      const handlePingResponse = (e: MessageEvent) => {
        if (e.data && e.data.type === 'pong') {
          isWorkerActiveRef.current = true;
          worker.removeEventListener('message', handlePingResponse);
        }
      };
      worker.addEventListener('message', handlePingResponse);
      worker.postMessage({ type: 'ping' });

      // Fallback in 8000ms if worker doesn't respond (Next.js dev compilation can be slow)
      const pingTimeout = window.setTimeout(() => {
        if (!isWorkerActiveRef.current) {
          console.warn("Layout worker failed to respond to ping. Falling back to main thread.");
          worker.terminate();
          workerRef.current = null;
        }
      }, 8000);

      return () => {
        window.clearTimeout(pingTimeout);
        worker.removeEventListener('message', handlePingResponse);
        worker.terminate();
        workerRef.current = null;
        isWorkerActiveRef.current = false;
      };
    } catch (error) {
      console.warn("Layout worker unavailable, using main thread layout:", error);
      isWorkerActiveRef.current = false;
    }
  }, []);

  const layoutInWorker = useCallback((nodes: Node[], edges: Edge[], settings: LayoutSettings) => {
    const worker = workerRef.current;

    if (!worker || !isWorkerActiveRef.current) {
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
      worker.postMessage({ id, nodes, edges, settings });
    });
  }, []);

  const layout = useCallback(
    async (nodes: Node[], edges: Edge[], settings: LayoutSettings) => {
      setIsLayouting(true);

      try {
        const workerResult = layoutInWorker(nodes, edges, settings);

        if (workerResult) {
          return await workerResult;
        }

        return await performLayout(nodes, edges, settings);
      } catch (error) {
        console.warn("Layout worker failed, using main thread layout:", error);
        return performLayout(nodes, edges, settings);
      } finally {
        setIsLayouting(false);
      }
    },
    [layoutInWorker],
  );

  return { layout, isLayouting };
}

