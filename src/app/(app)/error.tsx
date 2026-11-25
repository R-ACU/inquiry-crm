"use client";

import { RotateCcw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconCircle } from "@/components/ui/page-header";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-card bg-surface px-8 py-12 text-center shadow-card">
      <IconCircle icon={Unplug} tone="plain" />
      <h1 className="heading mt-4 text-xl">Die Seite konnte nicht geladen werden</h1>
      <p className="mt-2 text-sm text-muted">Die Verbindung zur Datenbank ist gerade gestört. Deine Daten sind nicht betroffen.</p>
      <Button className="mt-6" variant="primary" icon={<RotateCcw aria-hidden />} onClick={reset}>
        Erneut laden
      </Button>
    </div>
  );
}
