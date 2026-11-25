"use client";

import { RotateCcw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconCircle } from "@/components/ui/page-header";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    title: "Die Seite konnte nicht geladen werden",
    text: "Die Verbindung zur Datenbank ist gerade gestört. Deine Daten sind nicht betroffen.",
    retry: "Erneut laden",
  },
  en: {
    title: "The page could not be loaded",
    text: "The connection to the database is down for the moment. Your data is not affected.",
    retry: "Reload",
  },
});

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-card bg-surface px-8 py-12 text-center shadow-card">
      <IconCircle icon={Unplug} tone="plain" />
      <h1 className="heading mt-4 text-xl">{T.title}</h1>
      <p className="mt-2 text-sm text-muted">{T.text}</p>
      <Button className="mt-6" variant="primary" icon={<RotateCcw aria-hidden />} onClick={reset}>
        {T.retry}
      </Button>
    </div>
  );
}
