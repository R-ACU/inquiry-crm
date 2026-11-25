"use client";

import { useLayoutEffect, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, KeyRound, ShieldCheck, Terminal } from "lucide-react";
import { createApiKey, revokeApiKey } from "@/lib/actions/team";
import { formatTimestamp } from "@/lib/domain/time";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { Panel } from "@/components/ui/page-header";
import { useToast } from "@/components/shell/providers";
import { VIEW_KEYS, refreshViews } from "@/lib/client/views";
import type { TeamData } from "@/lib/data/views";
import { cn } from "@/lib/cn";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  rate_limit_per_minute: number;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      className={className}
      icon={copied ? <Check className="text-accent" aria-hidden /> : <Copy aria-hidden />}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Kopiert" : label}
    </Button>
  );
}

function KeyRow({ apiKey }: { apiKey: ApiKeyRow }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const toast = useToast();
  const revoked = Boolean(apiKey.revoked_at);

  return (
    <motion.li layout="position" className="flex flex-col gap-3 rounded-inner bg-raised p-4 sm:flex-row sm:items-center">
      <span className={cn("hidden size-10 shrink-0 items-center justify-center rounded-full sm:inline-flex", revoked ? "bg-surface text-muted" : "bg-accent-soft text-accent-fg")}>
        <KeyRound className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", revoked && "text-muted line-through decoration-line-strong")}>{apiKey.name}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
          <code className="font-sans">{apiKey.key_prefix}_…</code>
          <span>{apiKey.rate_limit_per_minute} pro Minute</span>
          <span>{apiKey.last_used_at ? `zuletzt ${formatTimestamp(apiKey.last_used_at)}` : "noch nie benutzt"}</span>
        </p>
      </div>
      <AnimatePresence initial={false}>
        {revoked ? (
          <motion.span key="revoked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-full bg-surface px-3 py-1 text-xs text-muted">
            Widerrufen {formatTimestamp(apiKey.revoked_at!)}
          </motion.span>
        ) : confirming ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", duration: 0.26, bounce: 0.1 }}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-xs text-muted">Systeme mit diesem Schlüssel werden sofort abgewiesen.</span>
            <Button
              size="sm"
              variant="danger"
              pending={pending}
              className="bg-surface"
              onClick={() =>
                startTransition(async () => {
                  const result = await revokeApiKey(apiKey.id);
                  setConfirming(false);
                  if (!result.ok) return toast("error", result.error);
                  toast("success", `Schlüssel ${apiKey.name} widerrufen.`);
                  const now = new Date().toISOString();
                  queryClient.setQueryData<TeamData>(VIEW_KEYS.team, (data) =>
                    data ? { ...data, keys: data.keys.map((k) => (k.id === apiKey.id ? { ...k, revoked_at: now } : k)) } : data,
                  );
                  await refreshViews(queryClient);
                })
              }
            >
              Widerrufen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Abbrechen
            </Button>
          </motion.div>
        ) : (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
              Widerrufen
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function ApiKeys({ keys, endpoint, className }: { keys: ApiKeyRow[]; endpoint: string; className?: string }) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const toast = useToast();
  // The new key is shown once. Leaving the page hides it for good, even though the page itself stays alive for a quick return.
  useLayoutEffect(() => () => setCreated(null), []);

  const example = `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${created?.key ?? "<SCHLÜSSEL>"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Greta Sommer",
    "email": "greta@post.example",
    "title": "Gartenfest im Juli",
    "eventDate": "2027-07-17",
    "guestCount": 45,
    "budgetEur": 2000,
    "source": "web_form"
  }'`;

  return (
    <Panel
      id="keys-heading"
      title="API-Schlüssel"
      icon={KeyRound}
      description={
        <>
          Damit schicken das Webformular oder andere Systeme Anfragen an <code className="font-sans text-fg">POST /api/v1/inquiries</code>.
        </>
      }
      className={className}
    >
      <p className="flex items-start gap-2.5 rounded-inner bg-raised px-4 py-3 text-[13px] leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-fg" aria-hidden />
        Der Schlüssel wird nur beim Anlegen angezeigt. Gespeichert wird ein Fingerabdruck, aus dem er sich nicht zurückgewinnen lässt. Er gehört auf einen Server, nie in den Quelltext einer Webseite.
      </p>

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await createApiKey(name);
            if (!result.ok) return toast("error", result.error);
            setCreated({ key: result.data!.key, name });
            setName("");
            await refreshViews(queryClient);
          });
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Name des Schlüssels</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Wofür, zum Beispiel Webformular"
            className={cn(inputClasses, "h-11 rounded-full px-5")}
          />
        </label>
        <Button type="submit" variant="primary" size="lg" pending={pending} disabled={!name.trim()}>
          Schlüssel anlegen
        </Button>
      </form>

      <AnimatePresence>
        {created && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", duration: 0.34, bounce: 0.14 }}
            className="mt-4 rounded-inner bg-accent-soft p-5"
          >
            <p className="text-sm font-medium text-fg">Schlüssel für {created.name} jetzt kopieren</p>
            <p className="mt-0.5 text-[13px] text-muted">Er wird nicht noch einmal angezeigt.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code data-testid="new-api-key" className="min-w-0 flex-1 rounded-2xl bg-surface px-4 py-2.5 text-[13px] break-all">
                {created.key}
              </code>
              <CopyButton text={created.key} label="Kopieren" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {keys.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {keys.map((apiKey) => (
            <KeyRow key={apiKey.id} apiKey={apiKey} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-inner bg-raised px-4 py-6 text-center text-[13px] text-muted">
          Noch kein Schlüssel. Lege einen an, sobald ein Formular oder System Anfragen schicken soll.
        </p>
      )}

      {/* The example as a dark card inside the card, in both modes. */}
      <div className="dark mt-5 rounded-inner bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
            <Terminal className="size-4 text-accent-fg" aria-hidden />
            Beispielaufruf
          </p>
          <CopyButton text={example} label="Befehl kopieren" className="bg-raised" />
        </div>
        <pre className="mt-3 overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted">{example}</pre>
      </div>
    </Panel>
  );
}
