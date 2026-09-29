import { finiteOrNull, trimmedOrNull, recordOrNull } from "@chanlytics/contracts";
import { providerFetch } from "../provider-fetch";
/**
 * The lead finder's provider, over its HTTP API (https://docs.apify.com/api/v2).
 *
 * No SDK: six documented calls, each pinned to its shape, with fetch handed in
 * so every test runs without a network (google-places.ts's pattern). The token
 * travels in a header, never in a URL. A 429 or a 5xx, or no answer at all,
 * throws ApifyRetryable, and the jobs ledger's own waits retry the job
 * (RETRY_WAITS_MS); any other 4xx throws ApifyRefused, which is an answer.
 * Items are read with a field projection and never `clean` or `skipEmpty`:
 * both drop items, and an offset must always mean the same item.
 *
 * Nothing here is shown to an owner, so the vendor's name is fine in code and
 * never in a word the product says.
 */

export const APIFY_BASE = "https://api.apify.com/v2";
export const APIFY_TIMEOUT_MS = 20_000;
/** The run endings an ad-hoc webhook fires on (https://docs.apify.com/integrations/webhooks/events). */
export const APIFY_RUN_END_EVENTS = [
  "ACTOR.RUN.SUCCEEDED",
  "ACTOR.RUN.FAILED",
  "ACTOR.RUN.TIMED_OUT",
  "ACTOR.RUN.ABORTED",
] as const;

/** Waiting may help: the provider is busy, broken, or did not answer at all (status null). */
export class ApifyRetryable extends Error {
  constructor(
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "ApifyRetryable";
  }
}
/** An answer: the request itself is wrong, or the account may not do this. Waiting changes nothing. */
export class ApifyRefused extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApifyRefused";
  }
}

export interface ApifyRun {
  id: string;
  status: string;
  datasetId: string | null;
  usageTotalUsd: number | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ApifyClient {
  startRun(
    actor: string,
    input: unknown,
    opts: {
      build: string;
      timeoutSecs: number;
      memoryMb?: number;
      maxTotalChargeUsd: number;
      webhooks: { eventTypes: string[]; requestUrl: string }[];
    },
  ): Promise<{ id: string; datasetId: string }>;
  getRun(id: string): Promise<ApifyRun>;
  listActorRuns(
    actor: string,
    sinceIso: string,
  ): Promise<{ id: string; status: string; startedAt: string; datasetId: string | null }[]>;
  /** The input a run was started with, read from its own key-value store: how the sweep tells our run from anyone else's. */
  runInput(id: string): Promise<unknown>;
  listItems(
    datasetId: string,
    offset: number,
    limit: number,
    fields: string[],
  ): Promise<{ items: unknown[]; total: number | null }>;
  abortRun(id: string): Promise<void>;
  eventPrices(actor: string): Promise<Record<string, number>>;
}

/** `username/name` as the API spells it in a path. */
const actorPath = (actor: string): string => encodeURIComponent(actor.replace("/", "~"));

function runOf(data: unknown): ApifyRun {
  const d = recordOrNull(data);
  const id = trimmedOrNull(d?.id);
  const status = trimmedOrNull(d?.status);
  if (!d || !id || !status) throw new ApifyRefused(200, "the provider answered without a run");
  return {
    id,
    status,
    datasetId: trimmedOrNull(d.defaultDatasetId),
    usageTotalUsd: finiteOrNull(d.usageTotalUsd),
    startedAt: trimmedOrNull(d.startedAt),
    finishedAt: trimmedOrNull(d.finishedAt),
  };
}

export function apifyClient(fetchImpl: typeof fetch, token: string): ApifyClient {
  const headers = (json: boolean): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    ...(json ? { "content-type": "application/json" } : {}),
  });

  /** One round trip: JSON out on 2xx; retryable on 429, 5xx or no answer; refused on any other 4xx, unless `allow` says that status is an answer. */
  async function call(
    url: string,
    init: RequestInit,
    allow: (status: number) => boolean = () => false,
  ): Promise<{ body: unknown; headers: Headers }> {
    const res = await providerFetch(
      "apify",
      url,
      { method: init.method, headers: init.headers, body: init.body, timeoutMs: APIFY_TIMEOUT_MS },
      { fetch: fetchImpl },
    );
    if (res.status === 0 || !res.headers) throw new ApifyRetryable(null, `the provider did not answer: ${res.error}`);
    const text = res.text;
    if (res.status >= 200 && res.status < 300) {
      try {
        return { body: text ? JSON.parse(text) : null, headers: res.headers };
      } catch {
        throw new ApifyRefused(res.status, "the provider answered with something that is not JSON");
      }
    }
    if (allow(res.status)) return { body: null, headers: res.headers };
    let type = `http ${res.status}`;
    try {
      type = trimmedOrNull(recordOrNull(recordOrNull(JSON.parse(text))?.error)?.type) ?? type;
    } catch {
      /* the status is the message */
    }
    if (res.status === 429 || res.status >= 500) throw new ApifyRetryable(res.status, `the provider is busy: ${type}`);
    throw new ApifyRefused(res.status, `the provider refused: ${type}`);
  }

  return {
    async startRun(actor, input, opts) {
      const webhooks = Buffer.from(JSON.stringify(opts.webhooks), "utf8").toString("base64");
      const q = new URLSearchParams({
        build: opts.build,
        timeout: String(opts.timeoutSecs),
        maxTotalChargeUsd: String(opts.maxTotalChargeUsd),
        webhooks,
      });
      if (opts.memoryMb) q.set("memory", String(opts.memoryMb));
      const { body } = await call(`${APIFY_BASE}/actors/${actorPath(actor)}/runs?${q}`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify(input),
      });
      const run = runOf(recordOrNull(body)?.data);
      if (!run.datasetId) throw new ApifyRefused(201, "the provider started a run with no dataset");
      return { id: run.id, datasetId: run.datasetId };
    },
    async getRun(id) {
      const { body } = await call(`${APIFY_BASE}/actor-runs/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: headers(false),
      });
      return runOf(recordOrNull(body)?.data);
    },
    async listActorRuns(actor, sinceIso) {
      const q = new URLSearchParams({ desc: "1", limit: "100" });
      const { body } = await call(`${APIFY_BASE}/actors/${actorPath(actor)}/runs?${q}`, {
        method: "GET",
        headers: headers(false),
      });
      const items = recordOrNull(recordOrNull(body)?.data)?.items;
      const out: { id: string; status: string; startedAt: string; datasetId: string | null }[] = [];
      for (const it of Array.isArray(items) ? items : []) {
        const o = recordOrNull(it);
        const id = trimmedOrNull(o?.id);
        const status = trimmedOrNull(o?.status);
        const startedAt = trimmedOrNull(o?.startedAt);
        if (!o || !id || !status || !startedAt || startedAt < sinceIso) continue;
        out.push({ id, status, startedAt, datasetId: trimmedOrNull(o.defaultDatasetId) });
      }
      return out;
    },
    async runInput(id) {
      const { body } = await call(`${APIFY_BASE}/actor-runs/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: headers(false),
      });
      const store = trimmedOrNull(recordOrNull(recordOrNull(body)?.data)?.defaultKeyValueStoreId);
      if (!store) return null;
      const rec = await call(
        `${APIFY_BASE}/key-value-stores/${encodeURIComponent(store)}/records/INPUT`,
        { method: "GET", headers: headers(false) },
        (s) => s === 404,
      );
      return rec.body;
    },
    async listItems(datasetId, offset, limit, fields) {
      // Never clean or skipEmpty: both drop items, and an offset must always mean the same item.
      const q = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        fields: fields.join(","),
        format: "json",
      });
      const { body, headers: h } = await call(`${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?${q}`, {
        method: "GET",
        headers: headers(false),
      });
      if (!Array.isArray(body)) throw new ApifyRefused(200, "the provider answered items that are not a list");
      const total = Number(h.get("x-apify-pagination-total"));
      return {
        items: body,
        total: Number.isFinite(total) && h.get("x-apify-pagination-total") !== null ? total : null,
      };
    },
    async abortRun(id) {
      // A run already finished is left as it is: the 4xx that says so is an answer, not a fault.
      await call(
        `${APIFY_BASE}/actor-runs/${encodeURIComponent(id)}/abort`,
        { method: "POST", headers: headers(false) },
        (s) => s >= 400 && s < 500 && s !== 401 && s !== 403 && s !== 429,
      );
    },
    async eventPrices(actor) {
      const { body } = await call(`${APIFY_BASE}/actors/${actorPath(actor)}`, {
        method: "GET",
        headers: headers(false),
      });
      const d = recordOrNull(recordOrNull(body)?.data);
      const infos = Array.isArray(d?.pricingInfos) ? (d.pricingInfos as unknown[]) : [];
      const events =
        recordOrNull(recordOrNull(recordOrNull(infos[infos.length - 1])?.pricingPerEvent)?.actorChargeEvents) ?? {};
      const out: Record<string, number> = {};
      for (const [name, e] of Object.entries(events)) {
        const price =
          finiteOrNull(
            recordOrNull(recordOrNull(recordOrNull(e)?.eventTieredPricingUsd)?.BRONZE)?.tieredEventPriceUsd,
          ) ?? finiteOrNull(recordOrNull(e)?.eventPriceUsd);
        if (price !== null) out[name] = price;
      }
      return out;
    },
  };
}
