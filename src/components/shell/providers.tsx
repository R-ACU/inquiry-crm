"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionProvider } from "@/components/theme/motion-provider";
import { pick } from "@/lib/i18n";

const T = pick({
  de: { dismiss: "Hinweis schließen" },
  en: { dismiss: "Dismiss notice" },
});

interface Toast {
  id: number;
  tone: "success" | "error";
  message: string;
}

const ToastContext = createContext<(tone: Toast["tone"], message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export interface ShellMember {
  id: string;
  fullName: string;
  email: string;
  role: "owner" | "staff";
}

const MemberContext = createContext<ShellMember | null>(null);

/** The signed-in member, for client views. Shapes the UI only; RLS checks every query. */
export function useMember(): ShellMember {
  const member = useContext(MemberContext);
  if (!member) throw new Error("useMember is only available inside the app shell");
  return member;
}

/**
 * Client state of one signed-in member: the query cache, toasts and the
 * member itself. The app layout keys it by member, so another sign-in in the
 * same tab starts from an empty cache.
 */
export function Providers({ member, children }: { member: ShellMember; children: ReactNode }) {
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
      <MemberContext value={member}>
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
                aria-label={T.dismiss}
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
      </MemberContext>
    </QueryClientProvider>
  );
}
