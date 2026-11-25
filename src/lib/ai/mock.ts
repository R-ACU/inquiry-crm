import fixturesDe from "../../../fixtures/ai/drafts.json";
import fixturesEn from "../../../fixtures/ai/drafts.en.json";
import { LOCALE, pick } from "@/lib/i18n";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/domain/status";
import { formatEuro } from "@/lib/domain/money";
import { formatEventDate } from "@/lib/domain/time";
import { draftOutputSchema, classificationOutputSchema, type AssistantDraft, type AssistantInput } from "./schemas";

export const MOCK_MODEL = "mock";

const fixtures: Record<string, unknown> = LOCALE === "en" ? fixturesEn : fixturesDe;

const T = pick({
  de: {
    wedding: /hochzeit|heirat|trauung/,
    conference: /tagung|konferenz|kongress|messe|seminar|vernissage|werkschau/,
    private: /geburtstag|taufe|jubiläum privat|silvester|nachbar|familie/,
    corporate: /firma|firmen|team|kunden|mitarbeit|belegschaft|kanzlei|praxis|gmbh|büro/,
    quoted: (title: string) => `„${title}“`,
    forGuests: (n: number) => `für etwa ${n} Personen`,
    onDate: (date: string) => `am ${date}`,
    noBudget: " Ein Budget ist nicht genannt.",
    budget: (amount: string) => ` Budget: ${amount}.`,
    location: (place: string) => ` Ort: ${place}.`,
    askGuests: "Mit wie vielen Gästen rechnen Sie ungefähr?",
    askTime: "Zu welcher Uhrzeit soll das Essen beginnen, und wie lange dauert die Veranstaltung?",
    askLocation: "Wo findet die Veranstaltung statt, und gibt es dort eine Küche oder Strom für Warmhaltegeräte?",
    askBudget: "Mit welchem Budget pro Person planen Sie ungefähr?",
    askAllergies: "Gibt es Allergien, Unverträglichkeiten oder besondere Ernährungsformen unter den Gästen?",
  },
  en: {
    wedding: /wedding|marriage|\bbride\b|\bgroom\b/,
    conference: /conference|seminar|trade fair|exhibition|congress|symposium|summit|vernissage|\bexpo\b/,
    private: /birthday|christening|baptism|private anniversary|new year|neighbou?r|family/,
    corporate: /company|\bteam\b|client|customer|\bstaff\b|employee|\boffice\b|\bltd\b|\blimited\b|practice|\bfirm\b/,
    quoted: (title: string) => `“${title}”`,
    forGuests: (n: number) => `for about ${n} guests`,
    onDate: (date: string) => `on ${date}`,
    noBudget: " No budget is given.",
    budget: (amount: string) => ` Budget: ${amount}.`,
    location: (place: string) => ` Venue: ${place}.`,
    askGuests: "Roughly how many guests are you expecting?",
    askTime: "What time should the meal start, and how long will the event run?",
    askLocation: "Where is the event taking place, and is there a kitchen or power for warming equipment?",
    askBudget: "Roughly what budget per person are you planning with?",
    askAllergies: "Are there any allergies, intolerances or special diets among the guests?",
  },
});

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
  if (T.wedding.test(t)) return "wedding";
  if (T.conference.test(t)) return "conference";
  if (T.private.test(t)) return "private";
  if (T.corporate.test(t)) return "corporate";
  return "other";
}

function ruleBasedDraft(input: AssistantInput): AssistantDraft {
  const eventType = input.event_type ?? guessEventType(`${input.title} ${input.message}`);
  const parts = [`${EVENT_TYPE_LABELS[eventType]} ${T.quoted(input.title)}`];
  if (input.guest_count) parts.push(T.forGuests(input.guest_count));
  if (input.event_date) parts.push(T.onDate(formatEventDate(input.event_date)));
  let summary = `${parts.join(" ")}.`;
  summary += input.budget_cents === null ? T.noBudget : T.budget(formatEuro(input.budget_cents));
  if (input.location) summary += T.location(input.location);

  const questions: string[] = [];
  if (!input.guest_count) questions.push(T.askGuests);
  if (!input.start_time) questions.push(T.askTime);
  if (!input.location) questions.push(T.askLocation);
  if (input.budget_cents === null) questions.push(T.askBudget);
  questions.push(T.askAllergies);

  const draft = draftOutputSchema.parse({ summary, questions: questions.slice(0, 3) });
  return { ...draft, suggestedEventType: eventType, model: MOCK_MODEL };
}
