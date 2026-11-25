import type { Metadata } from "next";
import { Suspense } from "react";
import { requireMember } from "@/lib/auth/dal";
import { listBoardInquiries, listTeam } from "@/lib/data/queries";
import { Board, BoardSkeleton } from "@/components/board/board";

export const metadata: Metadata = { title: "Anfragen" };

export default function InquiriesPage() {
  return (
    <div>
      <Suspense fallback={<BoardSkeleton />}>
        <BoardLoader />
      </Suspense>
    </div>
  );
}

async function BoardLoader() {
  const member = await requireMember();
  const [inquiries, team] = await Promise.all([
    listBoardInquiries(),
    member.role === "owner" ? listTeam() : Promise.resolve([]),
  ]);
  return (
    <Board
      initialInquiries={inquiries}
      viewer={{ id: member.id, role: member.role, firstName: member.fullName.split(" ")[0] }}
      team={team.map((p) => ({ id: p.id, fullName: p.full_name }))}
    />
  );
}
