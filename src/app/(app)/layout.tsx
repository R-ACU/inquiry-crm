import { Suspense } from "react";
import { requireMember } from "@/lib/auth/dal";
import { Providers } from "@/components/shell/providers";
import { AppHeader } from "@/components/shell/app-header";
import { Brand } from "@/components/brand";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <MemberShell>{children}</MemberShell>
    </Suspense>
  );
}

/**
 * The app for one signed-in member. Everything on the client below (query
 * cache, kept views, form drafts) is keyed by member and role: a different
 * sign-in in the same tab starts empty instead of showing what the previous
 * person had loaded.
 */
async function MemberShell({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  const shell = { id: member.id, fullName: member.fullName, email: member.email, role: member.role };
  return (
    <Providers key={`${member.id}:${member.role}`} member={shell}>
      <div className="flex min-h-dvh flex-col">
        <AppHeader member={shell} />
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 pt-4 pb-28 md:px-8 md:pt-6 md:pb-14">{children}</main>
      </div>
    </Providers>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 bg-canvas">
        <div className="mx-auto flex h-[72px] max-w-[1680px] items-center gap-5 px-4 md:px-8">
          <Brand subtitle={false} />
          <div aria-hidden className="loading-delayed hidden gap-1.5 md:flex">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-9 w-28 rounded-full" />
            ))}
          </div>
          <div aria-hidden className="loading-delayed ml-auto">
            <div className="skeleton h-9 w-64 rounded-full" />
          </div>
        </div>
      </header>
    </div>
  );
}
