import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { IconCircle } from "@/components/ui/page-header";

/**
 * Shown for unknown ids and for inquiries the user may not see. RLS returns
 * nothing in both cases, so the page cannot tell them apart, and it should
 * not: the answer must not reveal whether an id exists.
 */
export default function InquiryNotFound() {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-card bg-surface px-8 py-12 text-center shadow-card">
      <IconCircle icon={FileQuestion} tone="plain" />
      <h1 className="heading mt-4 text-xl">Nicht gefunden</h1>
      <p className="mt-2 text-sm text-muted">Diese Anfrage gibt es nicht, oder sie ist dir nicht zugewiesen.</p>
      <Link href="/inquiries" className={buttonClasses("secondary", "md", "mt-6")}>
        Zu den Anfragen
      </Link>
    </div>
  );
}
