import type { Metadata } from "next";
import { Suspense } from "react";
import { loadContacts } from "@/lib/data/views";
import { ContactsView } from "@/components/contacts-table";

export const metadata: Metadata = { title: "Kontakte" };

export default function ContactsPage() {
  return (
    <Suspense fallback={<ContactsSkeleton />}>
      <ContactsView contacts={loadContacts()} />
    </Suspense>
  );
}

function ContactsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Kontakte werden geladen" className="loading-delayed">
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
