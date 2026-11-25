import type { Metadata } from "next";
import { Suspense } from "react";
import { loadAssignees, loadBoard } from "@/lib/data/views";
import { Board, BoardSkeleton } from "@/components/board/board";
import { pick } from "@/lib/i18n";

const T = pick({
  de: { title: "Anfragen" },
  en: { title: "Inquiries" },
});

export const metadata: Metadata = { title: T.title };

export default function InquiriesPage() {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <Board inquiries={loadBoard()} team={loadAssignees()} />
    </Suspense>
  );
}
