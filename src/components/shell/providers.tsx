"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionProvider } from "@/components/theme/motion-provider";

interface Toast {
  id: number;
  tone: "success" | "error";
  message: string;
}

const ToastContext = createContext<(tone: Toast["tone"], message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
      }),
  );
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-2), { id, tone, message }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 5000);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
      <TooltipProvider>
      <ToastContext value={push}>
        {children}
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className="animate-rise-in pointer-events-auto flex w-full items-start gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-pop"
            >
              {toast.tone === "error" ? (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              ) : (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              )}
              <p className="flex-1 text-fg">{toast.message}</p>
              <button
                type="button"
                aria-label="Hinweis schließen"
                onClick={() => setToasts((list) => list.filter((t) => t.id !== toast.id))}
                className="press rounded-full p-0.5 text-faint hover:bg-hover hover:text-fg"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </ToastContext>
      </TooltipProvider>
      </MotionProvider>
    </QueryClientProvider>
  );
}
