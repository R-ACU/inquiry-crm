import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { IconCircle } from "@/components/ui/page-header";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    title: "Nicht gefunden",
    text: "Diese Anfrage gibt es nicht, oder sie ist dir nicht zugewiesen.",
    back: "Zu den Anfragen",
  },
  en: {
    title: "Not found",
    text: "This inquiry does not exist, or it is not assigned to you.",
    back: "Back to inquiries",
  },
});

/**
 * Shown for unknown ids and for inquiries the user may not see. RLS returns
 * nothing in both cases, so the page cannot tell them apart, and it should
 * not: the answer must not reveal whether an id exists.
 */
export default function InquiryNotFound() {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-card bg-surface px-8 py-12 text-center shadow-card">
      <IconCircle icon={FileQuestion} tone="plain" />
      <h1 className="heading mt-4 text-xl">{T.title}</h1>
      <p className="mt-2 text-sm text-muted">{T.text}</p>
      <Link href="/inquiries" className={buttonClasses("secondary", "md", "mt-6")}>
        {T.back}
      </Link>
    </div>
  );
}
