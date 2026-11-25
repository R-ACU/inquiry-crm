"use client";

import { use, useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { BoardInquiry } from "@/lib/data/queries";
import type { ViewName } from "@/lib/data/views";

/*
 * Client cache of the main views. A view seen once in this tab appears again
 * at once with the data it had, and refreshes itself quietly in the
 * background when that data is older than the stale time (30 s, see
 * Providers). The cache lives in the member's QueryClient, which the app
 * layout creates anew for every signed-in member, and a sign-out reloads the
 * page, so no cache entry outlives the session it was loaded in.
 */

/** Visible inquiries: the board, the search palette and the notifications share this entry. */
export const BOARD_KEY = ["board"] as const;

export const VIEW_KEYS = {
  overview: ["view", "overview"],
  contacts: ["view", "contacts"],
  assignees: ["view", "assignees"],
  team: ["view", "team"],
} as const satisfies Record<ViewName, QueryKey>;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  // The session has ended (expired, or signed out in another tab): load the sign-in page
  // afresh, so the views of this session do not stay in the tab. A router push would keep them.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full page load on purpose
  if (response.status === 401) window.location.assign("/login");
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
  return ((await response.json()) as { data: T }).data;
}

export function fetchBoard(): Promise<BoardInquiry[]> {
  return getJson("/api/inquiries");
}

export function fetchView<T>(view: ViewName): Promise<T> {
  return getJson(`/api/views/${view}`);
}

const subscribeNothing = () => () => {};

/**
 * Data for one view. The page passes the server's promise: on the first
 * visit the view waits for it (the page's Suspense fallback covers that),
 * every later visit renders the cached entry immediately and lets the cache
 * refetch in the background. While hydrating, the view renders exactly what
 * the server rendered, never a newer cache entry.
 */
export function useViewData<T>(key: QueryKey, fromServer: Promise<T>, fetcher: () => Promise<T>): T {
  const queryClient = useQueryClient();
  const hydrating = useSyncExternalStore(subscribeNothing, () => false, () => true);
  const cached = hydrating ? undefined : queryClient.getQueryData<T>(key);
  const loaded = cached === undefined ? use(fromServer) : undefined;
  const { data } = useQuery<T>({ queryKey: key, queryFn: fetcher, initialData: loaded });
  if (hydrating) return loaded as T;
  return (data ?? cached ?? loaded) as T;
}

const seenViews = new WeakMap<QueryClient, Set<string>>();

/**
 * True while a view appears for the first time for this member in this tab,
 * false when it is rebuilt later (React keeps only the last three pages
 * alive). Drives entrance animations, see components/ui/entrance.ts.
 */
export function useFirstAppearance(view: string): boolean {
  const queryClient = useQueryClient();
  let seen = seenViews.get(queryClient);
  if (!seen) {
    seen = new Set();
    seenViews.set(queryClient, seen);
  }
  const [first] = useState(() => !seen.has(view));
  useEffect(() => {
    seen.add(view);
  }, [seen, view]);
  return first;
}

/**
 * After a change: every cached view refetches now, also the ones that are
 * hidden, so a view shows the change as soon as it appears again.
 */
export function refreshViews(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ refetchType: "all" });
}
