import type { Metadata } from "next";
import { Suspense } from "react";
import { requireMember } from "@/lib/auth/dal";
import { listContactsWithStats } from "@/lib/data/queries";
import { ContactsTable } from "@/components/contacts-table";

export const metadata: Metadata = { title: "Kontakte" };

export default function ContactsPage() {
  return (
    <div>
      <Suspense fallback={<ContactsSkeleton />}>
        <ContactsLoader />
      </Suspense>
    </div>
  );
}

async function ContactsLoader() {
  const member = await requireMember();
  const contacts = await listContactsWithStats();
  return <ContactsTable contacts={contacts} owner={member.role === "owner"} />;
}

function ContactsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Kontakte werden geladen">
      <div className="skeleton h-8 w-36" />
      <div className="skeleton mt-3 h-4 w-72 max-w-full" />
      <div className="mt-8 flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-12" />
        ))}
      </div>
    </div>
  );
}
