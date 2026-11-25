import "server-only";
import { getMember } from "@/lib/auth/dal";
import { serverEnv } from "@/lib/env";
import { toStatusChange, type OverviewInquiry, type StatusChange } from "@/lib/domain/overview";
import { listApiKeys, listBoardInquiries, listContactsWithStats, listOverviewData, listTeam } from "./queries";

/*
 * The data of each main view, in one place for the page render and for
 * /api/views/:view, which the client cache calls to refresh a view in the
 * background. Every loader runs with the signed-in user's session, so RLS
 * decides what comes back. Owner-only data also checks the role here, so a
 * staff member's request does not even reach the query.
 */

export async function loadOverview(): Promise<{ inquiries: OverviewInquiry[]; changes: StatusChange[]; now: number }> {
  const { inquiries, events, now } = await listOverviewData();
  const changes = events.map(toStatusChange).filter((c): c is StatusChange => c !== null);
  return { inquiries: inquiries as OverviewInquiry[], changes, now };
}

export const loadContacts = listContactsWithStats;

export const loadBoard = listBoardInquiries;

/** People an owner can filter the board by. Staff members filter nothing, so they get an empty list. */
export async function loadAssignees(): Promise<{ id: string; fullName: string }[]> {
  const member = await getMember();
  if (member?.role !== "owner") return [];
  return (await listTeam()).map((p) => ({ id: p.id, fullName: p.full_name }));
}

/** Team and API keys; null for anyone but an owner. */
export async function loadTeam() {
  const member = await getMember();
  if (member?.role !== "owner") return null;
  const [team, keys] = await Promise.all([listTeam(), listApiKeys()]);
  return {
    team: team.map((p) => ({ id: p.id, fullName: p.full_name, role: p.role })),
    keys,
    endpoint: `${serverEnv.appUrl.replace(/\/$/, "")}/api/v1/inquiries`,
  };
}

export type OverviewData = Awaited<ReturnType<typeof loadOverview>>;
export type ContactsData = Awaited<ReturnType<typeof loadContacts>>;
export type AssigneesData = Awaited<ReturnType<typeof loadAssignees>>;
export type TeamData = Awaited<ReturnType<typeof loadTeam>>;

export const VIEW_LOADERS = {
  overview: loadOverview,
  contacts: loadContacts,
  assignees: loadAssignees,
  team: loadTeam,
} as const;

export type ViewName = keyof typeof VIEW_LOADERS;

export function isViewName(value: string): value is ViewName {
  return Object.hasOwn(VIEW_LOADERS, value);
}
