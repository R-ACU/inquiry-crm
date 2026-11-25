import { Suspense } from "react";
import { requireMember } from "@/lib/auth/dal";
import { Providers } from "@/components/shell/providers";
import { AppHeader } from "@/components/shell/app-header";
import { Brand } from "@/components/brand";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Providers>
      <div className="flex min-h-dvh flex-col">
        <Suspense fallback={<HeaderSkeleton />}>
          <MemberHeader />
        </Suspense>
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 pt-4 pb-28 md:px-8 md:pt-6 md:pb-14">{children}</main>
      </div>
    </Providers>
  );
}

async function MemberHeader() {
  const member = await requireMember();
  return <AppHeader member={{ id: member.id, fullName: member.fullName, email: member.email, role: member.role }} />;
}

function HeaderSkeleton() {
  return (
    <header className="sticky top-0 z-30 bg-canvas">
      <div className="mx-auto flex h-[72px] max-w-[1680px] items-center gap-5 px-4 md:px-8">
        <Brand subtitle={false} />
        <div className="hidden gap-1.5 md:flex">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-9 w-28 rounded-full" />
          ))}
        </div>
        <div className="skeleton ml-auto h-9 w-64 rounded-full" />
      </div>
    </header>
  );
}
