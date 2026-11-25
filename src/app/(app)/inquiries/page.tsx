import type { Metadata } from "next";
import { Suspense } from "react";
import { loadAssignees, loadBoard } from "@/lib/data/views";
import { Board, BoardSkeleton } from "@/components/board/board";

export const metadata: Metadata = { title: "Anfragen" };

export default function InquiriesPage() {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <Board inquiries={loadBoard()} team={loadAssignees()} />
    </Suspense>
  );
}
