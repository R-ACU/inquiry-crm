import { describe, expect, it } from "vitest";
import { describeIssues, intakeSchema, toIngestPayload } from "@/lib/domain/intake";

const valid = {
  name: "  Greta Sommer ",
  email: "Greta.Sommer@Post.example",
  title: "Gartenfest im Juli",
  message: "Wir planen ein Gartenfest mit Grill.",
  eventType: "private",
  eventDate: "2027-07-17",
  startTime: "15:00",
  endTime: "22:00",
  guestCount: 45,
  budgetEur: 2000.5,
  location: "Garten",
  source: "web_form",
};

describe("intakeSchema", () => {
  it("accepts a complete payload and normalises it", () => {
    const parsed = intakeSchema.parse(valid);
    expect(parsed.name).toBe("Greta Sommer");
    expect(parsed.email).toBe("greta.sommer@post.example");
    expect(toIngestPayload(parsed)).toMatchObject({
      email: "greta.sommer@post.example",
      budget_cents: 200050,
      event_type: "private",
      start_time: "15:00",
      phone: null,
      source: "web_form",
    });
  });

  it("needs only name, email and title", () => {
    const parsed = intakeSchema.parse({ name: "A", email: "a@b.example", title: "Feier" });
    expect(parsed.source).toBe("api");
    expect(parsed.message).toBe("");
    expect(toIngestPayload(parsed).budget_cents).toBeNull();
  });

  it("rejects unknown fields instead of dropping them silently", () => {
    const result = intakeSchema.safeParse({ ...valid, assignedTo: "someone" });
    expect(result.success).toBe(false);
  });

  it("rejects a client trying to set internal fields", () => {
    expect(intakeSchema.safeParse({ ...valid, status: "won" }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...valid, source: "manual" }).success).toBe(false);
  });

  it.each([
    ["invalid email", { email: "not-an-email" }, "email"],
    ["impossible date", { eventDate: "2027-02-30" }, "eventDate"],
    ["end before start", { startTime: "20:00", endTime: "19:00" }, "endTime"],
    ["time without date", { eventDate: undefined }, "eventDate"],
    ["negative guests", { guestCount: -1 }, "guestCount"],
    ["fractional guests", { guestCount: 2.5 }, "guestCount"],
    ["three decimals", { budgetEur: 10.123 }, "budgetEur"],
    ["too long title", { title: "x".repeat(161) }, "title"],
    ["empty name", { name: "   " }, "name"],
  ])("rejects %s", (_label, override, field) => {
    const result = intakeSchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(describeIssues(result.error).map((i) => i.field)).toContain(field);
    }
  });
});

describe("unconfirmedIntakeDetails", () => {
  const contact = { full_name: "Tobias Krüger", company: "Nordlicht Software GmbH", phone: "040 555 0101" };

  it("lists what the sender typed differently from the known contact", async () => {
    const { unconfirmedIntakeDetails } = await import("@/lib/domain/intake");
    expect(
      unconfirmedIntakeDetails({ name: "Angreifer", company: "Nordlicht Software GmbH", phone: "0000 000", email: "x@y.example" }, contact),
    ).toEqual([
      { label: "Name", value: "Angreifer" },
      { label: "Telefon", value: "0000 000" },
    ]);
  });

  it("ignores case, spacing and phone formatting", async () => {
    const { unconfirmedIntakeDetails } = await import("@/lib/domain/intake");
    expect(unconfirmedIntakeDetails({ name: " tobias krüger ", phone: "040-555-0101" }, contact)).toEqual([]);
    expect(unconfirmedIntakeDetails(null, contact)).toEqual([]);
    expect(unconfirmedIntakeDetails(["kein", "Objekt"], contact)).toEqual([]);
  });
});
