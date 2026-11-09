import { heldTenantId } from "@chanlytics/contracts";
import "server-only";

/**
 * Requests (decision 0066): what the data-deletion page promises, kept with its clock. A person on the Console's staff
 * files a request as it came in to the inbox, then marks each step as it is done, then closes it; each is an act, with
 * its reason, in the Admin log. The delete itself is still `tooling/scripts/ops/delete-tenant.mjs`: this keeps the
 * promise's clock and its steps, and never deletes anything.
 *
 * Cross-workspace: requests about any workspace, and about one already deleted; only backOffice(ctx) reaches them.
 */
import { requestFile, listRequests, requestById, setRequestSteps, findTenantBySlug } from "@chanlytics/db/console";
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
  isOneOf,
} from "@chanlytics/contracts";
import { takeAct } from "./acts";
import type { BackOffice } from "../shared/back-office";
import { NOT_RECORDED } from "@/server/console/words";
import type { TenantId } from "@chanlytics/contracts";

type RequestRow = {
  id: string;
  number: number;
  kind: string;
  tenant_id: TenantId | null;
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
function requestStepsOf(raw: unknown): Partial<Record<RequestStep, string>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<RequestStep, string>> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isOneOf(REQUEST_STEP_KEYS, k) && typeof v === "string") out[k] = v;
  }
  return out;
}

function requestDto(request: RequestRow): PrivacyRequestDto {
  return {
    id: request.id,
    number: request.number,
    kind: isOneOf(REQUEST_KINDS, request.kind) ? request.kind : "delete_workspace",
    tenant_id: request.tenant_id,
    slug: request.slug,
    name: request.name,
    asked_by: request.asked_by,
    asked_at: request.asked_at,
    ticket: request.ticket,
    note: request.note,
    due_at: request.due_at,
    steps: requestStepsOf(request.steps),
    closed_at: request.closed_at,
    created_at: request.created_at,
  };
}

/** The open requests, and those closed in the last thirty days. */
export async function listConsoleRequests(office: BackOffice): Promise<PrivacyRequestDto[]> {
  const { data, error } = await listRequests(office.db, new Date(Date.now() - 30 * DAY_MS).toISOString(), 200);
  if (error) throw new AppError("unavailable", "The requests could not be read just now. Try again in a moment.");
  return (data ?? []).map(requestDto);
}

/** A request filed as it came in: its workspace by address, its clock from when they asked. */
export async function fileConsoleRequest(
  office: BackOffice,
  input: { kind: RequestKind; workspace: string; asked_by: string; asked_at: string; why: ConsoleWhy },
): Promise<PrivacyRequestDto> {
  const found = await findTenantBySlug(office.db, input.workspace);
  if (found.error) throw new AppError("unavailable", "That could not be checked just now. Try again in a moment.");
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
      const { data, error } = await requestFile(office.db, {
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
      if (error || !data) throw new AppError("unavailable", NOT_RECORDED);
      return requestDto(data);
    },
  );
}

/** One step marked done or not done, or the request closed, as its own act. */
export async function stepConsoleRequest(
  office: BackOffice,
  input: { id: string; step: RequestStep | "close"; done: boolean; why: ConsoleWhy },
): Promise<PrivacyRequestDto> {
  const found = await requestById(office.db, input.id);
  if (found.error) throw new AppError("unavailable", "That could not be read just now. Try again in a moment.");
  if (!found.data) throw new AppError("not_found", "No such request.", 404);
  const current = requestDto(found.data);
  // The steps as stored, which the write is made over: a step someone else marked meanwhile is not erased.
  const was = found.data.steps;
  const on = {
    act: input.step === "close" ? ("request_close" as const) : ("request_step" as const),
    why: input.why,
    tenantId: current.tenant_id === null ? null : heldTenantId(current.tenant_id),
    target: "request" as const,
    targetId: current.id,
  };
  return takeAct(office, on, async () => {
    const change = requestStepChange(current, input.step, input.done, new Date().toISOString());
    if ("refused" in change) throw new AppError("conflict", change.refused, 409);
    const { data, error } = await setRequestSteps(office.db, current.id, was, change.steps, change.closedAt);
    if (error) throw new AppError("unavailable", NOT_RECORDED);
    const row = data?.[0];
    if (!row)
      throw new AppError("conflict", "Someone else changed or closed this request just now. Read it again first.", 409);
    return requestDto(row);
  });
}
