/**
 * Rows as the database holds them, for the ten tables the suite's fixtures seed most (messages, tenants, tenant_config,
 * conversations, events, contacts, tenant_channels, lines, memberships, billing_accounts): every column the table has,
 * each the database's own default or a made-up value, so a fixture names only what its test is about.
 *
 *   const t = rows.tenant({ timezone: "America/Chicago" });
 *   const k = rows.contact({ tenant_id: t.id, phone_e164: "+13055550101" });
 *   fakeDb({ tenants: [t], contacts: [k] });
 *
 * Typed from the schema (_schema.mjs, generated from the migrations), at the moment a row is made: a key the table does
 * not have is refused by name, a NOT NULL column the factory gives no value is refused by name (a migration that adds
 * one breaks the factory, not forty fixtures), and a row the database would refuse (a value outside a CHECK's set) is
 * refused as the double refuses it. A column the factory leaves alone and the table lets be null is null, as a fresh
 * row's is. Ids are made-up uuids, fresh per row; the instant is a fixed made-up one, so two runs make the same rows.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { schemaOf, refusedRow } from "./_schema.mjs";

const SCHEMA = await schemaOf();

/** The made-up workspace a factory's row belongs to when its test names none. */
export const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** The made-up instant every stamp a factory writes is at. */
export const AT = "2026-09-29T12:00:00.000Z";

let made = 0;
/** A fresh made-up uuid, one per call, the same sequence every run. */
export const uuid = () => `00000000-0000-4000-8000-${String(++made).padStart(12, "0")}`;

/** What each table holds when a writer names nothing: the migrations' defaults, and a made-up value where there is none. */
const DEFAULTS = {
  tenants: () => {
    const id = uuid();
    return {
      id,
      name: "Example Studio",
      slug: `example-${id.slice(-6)}`,
      locale: "en",
      status: "active",
      timezone: "America/New_York",
      created_at: AT,
      updated_at: AT,
    };
  },
  tenant_config: () => ({ tenant_id: TENANT, config: {}, version: 1, updated_at: AT }),
  contacts: () => ({
    id: uuid(),
    tenant_id: TENANT,
    consent: "unknown",
    dnc: false,
    email_marketing: "unknown",
    marketing_consent: "unknown",
    first_seen_at: AT,
    last_seen_at: AT,
    created_at: AT,
    updated_at: AT,
  }),
  conversations: () => ({
    id: uuid(),
    tenant_id: TENANT,
    contact_id: uuid(),
    state: "open",
    created_at: AT,
    updated_at: AT,
  }),
  messages: () => ({
    id: uuid(),
    tenant_id: TENANT,
    conversation_id: uuid(),
    channel: "whatsapp",
    direction: "inbound",
    sender: "customer",
    type: "text",
    status: "received",
    meta: {},
    created_at: AT,
  }),
  events: () => ({
    id: uuid(),
    tenant_id: TENANT,
    kind: "system.example",
    category: "system",
    data: {},
    version: 1,
    created_at: AT,
  }),
  tenant_channels: () => ({
    id: uuid(),
    tenant_id: TENANT,
    kind: "whatsapp",
    external_id: "100000000000001",
    status: "active",
    config: {},
    created_at: AT,
    updated_at: AT,
  }),
  lines: () => ({
    id: uuid(),
    tenant_id: TENANT,
    provider: "dry",
    kind: "chanlytics",
    voice_state: "none",
    sms_state: "none",
    whatsapp_state: "none",
    forwarding_state: "none",
    port_state: "none",
    reg_mock: false,
    reg_sole_prop: false,
    facts: {},
    state_since: AT,
    created_at: AT,
    updated_at: AT,
  }),
  memberships: () => ({ id: uuid(), tenant_id: TENANT, user_id: uuid(), role: "owner", views: {}, created_at: AT }),
  billing_accounts: () => ({
    tenant_id: TENANT,
    mode: "stripe",
    status: "none",
    cancel_at_period_end: false,
    facts: {},
    created_at: AT,
    updated_at: AT,
  }),
};

/** One row of `table`: the factory's defaults under the test's own values, every other column null. */
function rowOf(table, overrides) {
  const cols = SCHEMA.relations[table].columns;
  for (const k of Object.keys(overrides))
    if (!cols[k]) throw new Error(`rows: ${table} has no column ${k} (packages/db/src/database.types.ts)`);
  const defaults = DEFAULTS[table]();
  const row = {};
  for (const [col, c] of Object.entries(cols)) {
    const v = col in overrides ? overrides[col] : col in defaults ? defaults[col] : c.nullable ? null : undefined;
    if (v === undefined)
      throw new Error(`rows: ${table}.${col} is NOT NULL and the factory names no value for it (_rows.mjs DEFAULTS)`);
    row[col] = v;
  }
  const refused = refusedRow(SCHEMA, table, row, { insert: true });
  if (refused) throw new Error(`rows: the database would refuse this ${table} row: ${refused.message}`);
  return row;
}

/** A row for each of the ten tables, the test's own values over the database's. */
export const rows = {
  tenant: (o = {}) => rowOf("tenants", o),
  config: (o = {}) => rowOf("tenant_config", o),
  contact: (o = {}) => rowOf("contacts", o),
  conversation: (o = {}) => rowOf("conversations", o),
  message: (o = {}) => rowOf("messages", o),
  event: (o = {}) => rowOf("events", o),
  channel: (o = {}) => rowOf("tenant_channels", o),
  line: (o = {}) => rowOf("lines", o),
  membership: (o = {}) => rowOf("memberships", o),
  billing: (o = {}) => rowOf("billing_accounts", o),
};
