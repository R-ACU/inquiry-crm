import type { Metadata } from "next";
import Image from "next/image";
import { CalendarDays, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeNote } from "@/components/theme/theme-client";
import venue from "@/assets/login-venue.webp";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

const PHOTO_ALT = "Langer, heller Festsaal mit gedeckten Tafeln, Holzbalken und Lichterketten";

function PhotoCredit({ className }: { className?: string }) {
  return (
    <a
      href="https://commons.wikimedia.org/wiki/File:Wedding_reception_tables_and_benches_(Unsplash).jpg"
      target="_blank"
      rel="noopener noreferrer"
      className={`glass rounded-full px-3 py-1 text-[11px] text-glass-fg transition-opacity hover:opacity-80 ${className ?? ""}`}
    >
      Foto: Sweet Ice Cream Photography, CC0
    </a>
  );
}

/**
 * Sign-in: the form on a calm surface, the business on the photo. The small
 * inquiry card on the glass is illustration written here, not data.
 */
export default function LoginPage() {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <main className="flex flex-col px-6 py-6 sm:px-12 lg:py-8">
        <div className="flex items-center justify-between gap-4">
          <Brand />
          <ThemeNote />
        </div>

        {/* Phone and tablet: the photo as a banner above the form. */}
        <div className="relative mt-6 h-44 overflow-hidden rounded-2xl sm:h-56 lg:hidden">
          <Image src={venue} alt={PHOTO_ALT} fill priority placeholder="blur" sizes="(max-width: 1023px) 100vw, 0px" className="object-cover" />
          <PhotoCredit className="absolute right-3 bottom-3" />
        </div>

        <div className="animate-rise-in mx-auto flex w-full max-w-[22.5rem] flex-1 flex-col justify-center py-12">
          <h1 className="display-title text-[30px] leading-tight">Willkommen zurück</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">Melde dich mit dem Zugang an, den du von deinem Betrieb bekommen hast.</p>
          <LoginForm />
          <p className="mt-6 text-[13px] leading-relaxed text-muted">
            Zugänge legt die Inhaberin oder der Inhaber an. Passwort vergessen? Dort hilft man dir weiter.
          </p>
        </div>

        <footer className="text-xs text-faint">Demo mit erfundenen Daten. Lindgrün ist kein echter Betrieb.</footer>
      </main>

      <aside className="relative m-3 ml-0 hidden overflow-hidden rounded-[28px] lg:block">
        <Image src={venue} alt={PHOTO_ALT} fill priority placeholder="blur" sizes="(min-width: 1024px) 58vw, 0px" className="object-cover object-[50%_55%]" />
        <PhotoCredit className="absolute top-5 right-5" />

        <div className="absolute inset-x-8 bottom-8 flex flex-col items-start gap-4 xl:inset-x-10 xl:bottom-10">
          {/* A sample inquiry, as it would arrive. */}
          <div className="glass animate-rise-in flex items-center gap-3.5 rounded-2xl py-3 pr-5 pl-3 [animation-delay:160ms]">
            <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-primary text-on-primary">
              <span className="text-[15px] leading-none font-semibold">14</span>
              <span className="mt-0.5 text-[10px] leading-none font-medium">Jun</span>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-glass-fg">Sommerfest im Innenhof</span>
              <span className="mt-0.5 flex items-center gap-3 text-xs text-glass-muted">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" aria-hidden />
                  120 Gäste
                </span>
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5" aria-hidden />
                  Angebot bis Freitag
                </span>
              </span>
            </span>
          </div>

          <div className="glass animate-rise-in max-w-xl rounded-3xl p-7 [animation-delay:80ms] xl:p-8">
            <p className="display-title text-[28px] leading-[1.15] text-glass-fg xl:text-[32px]">Jede Anfrage im Blick, vom ersten Kontakt bis zur Zusage.</p>
            <p className="mt-3 text-[15px] leading-relaxed text-glass-muted">
              Termine, Gästezahl und Budget an einem Ort. Der Assistent schreibt Entwürfe, entscheiden tut ein Mensch.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
