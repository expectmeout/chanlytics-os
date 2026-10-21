import "server-only";

/**
 * Requests (decision 0066): what the data-deletion page promises, kept with its clock. A person on the Console's staff
 * files a request as it came in to the inbox, then marks each step as it is done, then closes it; each is an act, with
 * its reason, in the Admin log. The delete itself is still `tooling/scripts/ops/delete-tenant.mjs`: this keeps the
 * promise's clock and its steps, and never deletes anything.
 *
 * Cross-workspace: requests about any workspace, and about one already deleted; only backOffice(ctx) reaches them.
 */
import { fileRequest, listRequests, requestById, setRequestSteps, tenantBySlug } from "@chanlytics/db";
import {
  AppError,
  CONSOLE_WORDS,
  DAY_MS,
  MIN_MS,
  REQUEST_KINDS,
  REQUEST_STEP_KEYS,
  requestDueAt,
  requestStepChange,
  type ConsoleWhy,
  type PrivacyRequestDto,
  type RequestKind,
  type RequestStep,
} from "@chanlytics/contracts";
import { takeAct } from "./acts";
import type { BackOffice } from "./platform";

type RequestRow = {
  id: string;
  number: number;
  kind: string;
  tenant_id: string | null;
  slug: string;
  name: string;
  asked_by: string;
  asked_at: string;
  ticket: string | null;
  note: string | null;
  due_at: string;
  steps: unknown;
  closed_at: string | null;
  created_at: string;
};

/** The steps as kept: each a step this product names, with when it was done. */
function stepsOf(raw: unknown): Partial<Record<RequestStep, string>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<RequestStep, string>> = {};
  for (const [k, v] of Object.entries(raw)) {
    if ((REQUEST_STEP_KEYS as readonly string[]).includes(k) && typeof v === "string") out[k as RequestStep] = v;
  }
  return out;
}

function requestDto(r: RequestRow): PrivacyRequestDto {
  return {
    id: r.id,
    number: r.number,
    kind: (REQUEST_KINDS as readonly string[]).includes(r.kind) ? (r.kind as RequestKind) : "delete_workspace",
    tenant_id: r.tenant_id,
    slug: r.slug,
    name: r.name,
    asked_by: r.asked_by,
    asked_at: r.asked_at,
    ticket: r.ticket,
    note: r.note,
    due_at: r.due_at,
    steps: stepsOf(r.steps),
    closed_at: r.closed_at,
    created_at: r.created_at,
  };
}

/** The open requests, and those closed in the last thirty days. */
export async function consoleRequests(office: BackOffice): Promise<PrivacyRequestDto[]> {
  const { data, error } = await listRequests(office.db, new Date(Date.now() - 30 * DAY_MS).toISOString(), 200);
  if (error) throw new AppError("internal", "The requests could not be read just now. Try again in a moment.", 503);
  return (data ?? []).map(requestDto);
}

/** A request filed as it came in: its workspace by address, its clock from when they asked. */
export async function consoleFileRequest(
  office: BackOffice,
  input: { kind: RequestKind; workspace: string; asked_by: string; asked_at: string; why: ConsoleWhy },
): Promise<PrivacyRequestDto> {
  const found = await tenantBySlug(office.db, input.workspace);
  if (found.error) throw new AppError("internal", "That could not be checked just now. Try again in a moment.", 503);
  const tenant = found.data;
  if (!tenant)
    throw new AppError("validation", CONSOLE_WORDS.noSuchWorkspace, 400, {
      fields: { workspace: CONSOLE_WORDS.noSuchWorkspace },
    });
  if (Date.parse(input.asked_at) > Date.now() + 5 * MIN_MS)
    throw new AppError("validation", "They cannot have asked in the future.", 400, {
      fields: { asked_at: "Not in the future." },
    });
  const id = crypto.randomUUID();
  return takeAct(
    office,
    { act: "request_file", why: input.why, tenantId: tenant.id, target: "request", targetId: id },
    async () => {
      const { data, error } = await fileRequest(office.db, {
        id,
        kind: input.kind,
        tenant_id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        asked_by: input.asked_by,
        asked_at: input.asked_at,
        ticket: input.why.ticket,
        note: input.why.note,
        due_at: requestDueAt(input.asked_at),
        created_by: office.userId,
      });
      if (error || !data)
        throw new AppError("internal", "That could not be recorded, so it was not done. Try again in a moment.", 503);
      return requestDto(data);
    },
  );
}

/** One step marked done or not done, or the request closed, as its own act. */
export async function consoleRequestStep(
  office: BackOffice,
  input: { id: string; step: RequestStep | "close"; done: boolean; why: ConsoleWhy },
): Promise<PrivacyRequestDto> {
  const found = await requestById(office.db, input.id);
  if (found.error) throw new AppError("internal", "That could not be read just now. Try again in a moment.", 503);
  if (!found.data) throw new AppError("not_found", "No such request.", 404);
  const current = requestDto(found.data);
  // The steps as stored, which the write is made over: a step someone else marked meanwhile is not erased.
  const was = found.data.steps;
  const on = {
    act: input.step === "close" ? ("request_close" as const) : ("request_step" as const),
    why: input.why,
    tenantId: current.tenant_id,
    target: "request" as const,
    targetId: current.id,
  };
  return takeAct(office, on, async () => {
    const change = requestStepChange(current, input.step, input.done, new Date().toISOString());
    if ("refused" in change) throw new AppError("conflict", change.refused, 409);
    const { data, error } = await setRequestSteps(office.db, current.id, was, change.steps, change.closedAt);
    if (error)
      throw new AppError("internal", "That could not be recorded, so it was not done. Try again in a moment.", 503);
    const row = data?.[0];
    if (!row)
      throw new AppError("conflict", "Someone else changed or closed this request just now. Read it again first.", 409);
    return requestDto(row);
  });
}
