import type { BoardInquiry } from "@/lib/data/queries";

/** One client cache entry for the visible inquiries: the board, the search palette and the notifications share it. */
export const BOARD_KEY = ["board"] as const;

export async function fetchBoard(): Promise<BoardInquiry[]> {
  const response = await fetch("/api/inquiries", { cache: "no-store" });
  if (!response.ok) throw new Error("board fetch failed");
  return ((await response.json()) as { data: BoardInquiry[] }).data;
}
