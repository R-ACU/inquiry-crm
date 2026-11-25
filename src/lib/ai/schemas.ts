import { z } from "zod";
import { EVENT_TYPES, type EventType } from "@/lib/domain/status";

export interface AssistantInput {
  id: string;
  title: string;
  message: string;
  event_type: EventType | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  guest_count: number | null;
  budget_cents: number | null;
  location: string | null;
  contact_name: string;
  company: string | null;
}

/** What the model must return. Anything else is rejected before it reaches a person. */
export const draftOutputSchema = z.object({
  summary: z.string().min(20).max(600),
  questions: z.array(z.string().min(8).max(220)).min(1).max(3),
});

export const classificationOutputSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
});

export interface AssistantDraft {
  summary: string;
  questions: string[];
  suggestedEventType: EventType | null;
  model: string;
}
