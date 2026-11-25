import fixtures from "../../../fixtures/ai/drafts.json";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/domain/status";
import { formatEuro } from "@/lib/domain/money";
import { formatEventDate } from "@/lib/domain/time";
import { draftOutputSchema, classificationOutputSchema, type AssistantDraft, type AssistantInput } from "./schemas";

export const MOCK_MODEL = "mock";

type FixtureEntry = { summary: string; questions: string[]; eventType: EventType };

/**
 * Fixed answers for selected seed inquiries live in fixtures/ai/drafts.json
 * and pass through the same schema as real model output. Every other
 * inquiry gets a deterministic draft built from its structured fields, so
 * the preview and the tests never depend on a network call.
 */
export function mockDraft(input: AssistantInput): AssistantDraft {
  const fixture = (fixtures as Record<string, FixtureEntry>)[input.id];
  if (fixture) {
    const draft = draftOutputSchema.parse(fixture);
    const { eventType } = classificationOutputSchema.parse(fixture);
    return { ...draft, suggestedEventType: eventType, model: MOCK_MODEL };
  }
  return ruleBasedDraft(input);
}

function guessEventType(text: string): EventType {
  const t = text.toLowerCase();
  if (/hochzeit|heirat|trauung/.test(t)) return "wedding";
  if (/tagung|konferenz|kongress|messe|seminar|vernissage|werkschau/.test(t)) return "conference";
  if (/geburtstag|taufe|jubiläum privat|silvester|nachbar|familie/.test(t)) return "private";
  if (/firma|firmen|team|kunden|mitarbeit|belegschaft|kanzlei|praxis|gmbh|büro/.test(t)) return "corporate";
  return "other";
}

function ruleBasedDraft(input: AssistantInput): AssistantDraft {
  const eventType = input.event_type ?? guessEventType(`${input.title} ${input.message}`);
  const parts = [`${EVENT_TYPE_LABELS[eventType]} „${input.title}“`];
  if (input.guest_count) parts.push(`für etwa ${input.guest_count} Personen`);
  if (input.event_date) parts.push(`am ${formatEventDate(input.event_date)}`);
  let summary = `${parts.join(" ")}.`;
  summary += input.budget_cents === null ? " Ein Budget ist nicht genannt." : ` Budget: ${formatEuro(input.budget_cents)}.`;
  if (input.location) summary += ` Ort: ${input.location}.`;

  const questions: string[] = [];
  if (!input.guest_count) questions.push("Mit wie vielen Gästen rechnen Sie ungefähr?");
  if (!input.start_time) questions.push("Zu welcher Uhrzeit soll das Essen beginnen, und wie lange dauert die Veranstaltung?");
  if (!input.location) questions.push("Wo findet die Veranstaltung statt, und gibt es dort eine Küche oder Strom für Warmhaltegeräte?");
  if (input.budget_cents === null) questions.push("Mit welchem Budget pro Person planen Sie ungefähr?");
  questions.push("Gibt es Allergien, Unverträglichkeiten oder besondere Ernährungsformen unter den Gästen?");

  const draft = draftOutputSchema.parse({ summary, questions: questions.slice(0, 3) });
  return { ...draft, suggestedEventType: eventType, model: MOCK_MODEL };
}
