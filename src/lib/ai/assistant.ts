import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { EventType } from "@/lib/domain/status";
import { renderInquiryForModel, SUMMARY_SYSTEM_PROMPT, CLASSIFY_SYSTEM_PROMPT } from "./prompts";
import { mockDraft } from "./mock";
import { draftOutputSchema, classificationOutputSchema, type AssistantDraft, type AssistantInput } from "./schemas";

export type { AssistantDraft, AssistantInput } from "./schemas";

/** Model for the German summary and follow-up questions. */
export const TEXT_MODEL = "claude-sonnet-5-5";
/** Model for sorting an inquiry into an event type. */
export const CLASSIFY_MODEL = "claude-haiku-5-5";

export interface InquiryAssistant {
  readonly mode: "mock" | "anthropic";
  draft(input: AssistantInput): Promise<AssistantDraft>;
}

export type AssistantErrorCode = "not_configured" | "refused" | "invalid_output" | "upstream";

export class AssistantError extends Error {
  constructor(
    readonly code: AssistantErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Real mode. Two independent calls run in parallel: Sonnet writes the
 * summary and questions, Haiku sorts the inquiry into an event type. Both
 * use structured outputs, so the response is parsed and validated against
 * a Zod schema; the model has no tools and cannot change any data.
 */
export function createAnthropicAssistant(client: Anthropic): InquiryAssistant {
  async function summarize(input: AssistantInput) {
    const response = await client.beta.messages.parse({
      model: TEXT_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(draftOutputSchema) },
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: renderInquiryForModel(input) }],
    });
    if (response.stop_reason === "refusal") {
      throw new AssistantError("refused", "The model declined to summarise this inquiry.");
    }
    if (!response.parsed_output) {
      throw new AssistantError("invalid_output", "The model response did not match the expected format.");
    }
    return { ...response.parsed_output, model: response.model };
  }

  async function classify(input: AssistantInput): Promise<EventType | null> {
    const response = await client.messages.parse({
      model: CLASSIFY_MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(classificationOutputSchema) },
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: renderInquiryForModel(input) }],
    });
    // Classification is a hint. A refusal or unusable answer leaves it empty
    // instead of failing the whole draft.
    if (response.stop_reason === "refusal") return null;
    return response.parsed_output?.eventType ?? null;
  }

  return {
    mode: "anthropic",
    async draft(input) {
      try {
        const [summary, eventType] = await Promise.all([summarize(input), classify(input)]);
        // Re-validate: structured outputs constrain the format, the schema also enforces lengths.
        const checked = draftOutputSchema.safeParse(summary);
        if (!checked.success) {
          throw new AssistantError("invalid_output", "The model response did not match the expected format.");
        }
        return {
          summary: checked.data.summary,
          questions: checked.data.questions,
          suggestedEventType: eventType,
          model: summary.model,
        };
      } catch (error) {
        if (error instanceof AssistantError) throw error;
        if (error instanceof Anthropic.APIError) {
          throw new AssistantError("upstream", `Claude API error ${error.status ?? "?"}`);
        }
        throw error;
      }
    },
  };
}

export function createMockAssistant(): InquiryAssistant {
  return {
    mode: "mock",
    async draft(input) {
      return mockDraft(input);
    },
  };
}

/**
 * Picks the implementation from the server environment. Mock mode is the
 * default, so a missing variable never causes paid API calls.
 */
export function assistantFromEnv(env: NodeJS.ProcessEnv = process.env): InquiryAssistant {
  if (env.AI_MODE !== "anthropic") return createMockAssistant();
  if (!env.ANTHROPIC_API_KEY) {
    throw new AssistantError("not_configured", "AI_MODE=anthropic requires ANTHROPIC_API_KEY.");
  }
  return createAnthropicAssistant(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 45_000, maxRetries: 1 }));
}
