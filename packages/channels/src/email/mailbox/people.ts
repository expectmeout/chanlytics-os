/**
 * The people a connected mailbox's grant knows (decision 0073, R19): the owner's contacts (Google's People API, Graph's
 * contacts); never Google's "other contacts", everyone the owner ever wrote to. Each a name, the
 * addresses and the numbers as the provider holds them; the edge brings them into People as a client list's are, never
 * a yes. A page at a time; every call returns what it came to and never throws (provider-fetch.ts).
 */
import { fetchFromProvider, type ProviderReply } from "../../shared/provider-fetch";
import { MAILBOX_READ_MS } from "./read";
import { GRAPH_API } from "./graph";
import { recordOrNull } from "@chanlytics/contracts";

const PEOPLE_API = "https://people.googleapis.com/v1";
/** People a page: Google's most is a thousand, Graph's contacts a hundred is plenty for a part. */
const PEOPLE_PAGE = "1000";
const CONTACTS_PAGE = 100;

type Deps = Parameters<typeof fetchFromProvider>[3];

/** One person a mailbox knows: what they are called, and every address and number the provider holds for them. */
export interface KnownPerson {
  name: string | null;
  emails: string[];
  phones: string[];
}

/** A page of people, and where the next one starts (null at the last). */
export type PeoplePage = { ok: true; people: KnownPerson[]; next: string | null } | { ok: false; reply: ProviderReply };

/** Google's person resource, read: the first name it has, every address and number. */
function googlePersonOf(params: {
  names?: Array<{ displayName?: unknown }>;
  emailAddresses?: Array<{ value?: unknown }>;
  phoneNumbers?: Array<{ value?: unknown; canonicalForm?: unknown }>;
}): KnownPerson {
  const name = (params.names ?? [])
    .map((n) => n.displayName)
    .find((n): n is string => typeof n === "string" && !!n.trim());
  return {
    name: name?.trim() ?? null,
    emails: (params.emailAddresses ?? []).flatMap((e) =>
      typeof e.value === "string" ? [e.value.trim().toLowerCase()] : [],
    ),
    // Google's canonical form is E.164 where it could make one; the number as typed where it could not.
    phones: (params.phoneNumbers ?? []).flatMap((n) =>
      typeof n.canonicalForm === "string" ? [n.canonicalForm] : typeof n.value === "string" ? [n.value] : [],
    ),
  };
}

async function googlePage(token: string, url: string, field: string, deps?: Deps): Promise<PeoplePage> {
  const response = await fetchFromProvider(
    "google",
    url,
    { headers: { Authorization: `Bearer ${token}` }, timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (response.outcome !== "ok") return { ok: false, reply: response };
  const json = recordOrNull(response.json);
  const list = Array.isArray(json?.[field]) ? (json[field] as Parameters<typeof googlePersonOf>[0][]) : [];
  return {
    ok: true,
    people: list.map(googlePersonOf),
    next: typeof json?.nextPageToken === "string" ? json.nextPageToken : null,
  };
}

/** The owner's own Google contacts (contacts.readonly), a page at a time. */
export function listGoogleContacts(token: string, pageToken: string | null, deps?: Deps): Promise<PeoplePage> {
  const q = new URLSearchParams({ personFields: "names,emailAddresses,phoneNumbers", pageSize: PEOPLE_PAGE });
  if (pageToken) q.set("pageToken", pageToken);
  return googlePage(token, `${PEOPLE_API}/people/me/connections?${q.toString()}`, "connections", deps);
}

/** The owner's Outlook contacts (Contacts.Read), a page at a time; `link` is the page Graph named next. */
export async function listGraphContacts(token: string, link: string | null, deps?: Deps): Promise<PeoplePage> {
  const url =
    link ??
    `${GRAPH_API}/me/contacts?$select=displayName,emailAddresses,mobilePhone,businessPhones,homePhones&$top=${CONTACTS_PAGE}`;
  const response = await fetchFromProvider(
    "microsoft",
    url,
    { headers: { Authorization: `Bearer ${token}` }, timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (response.outcome !== "ok") return { ok: false, reply: response };
  const json = response.json as {
    value?: Array<{
      displayName?: unknown;
      emailAddresses?: Array<{ address?: unknown }>;
      mobilePhone?: unknown;
      businessPhones?: unknown[];
      homePhones?: unknown[];
    }>;
    "@odata.nextLink"?: unknown;
  } | null;
  const words = (v: unknown): string[] => (typeof v === "string" && v.trim() ? [v.trim()] : []);
  return {
    ok: true,
    people: (json?.value ?? []).map((c) => ({
      name: typeof c.displayName === "string" && c.displayName.trim() ? c.displayName.trim() : null,
      emails: (c.emailAddresses ?? []).flatMap((e) => words(e.address).map((a) => a.toLowerCase())),
      phones: [
        ...words(c.mobilePhone),
        ...(c.businessPhones ?? []).flatMap(words),
        ...(c.homePhones ?? []).flatMap(words),
      ],
    })),
    next: typeof json?.["@odata.nextLink"] === "string" ? json["@odata.nextLink"] : null,
  };
}
