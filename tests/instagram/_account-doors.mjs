/**
 * The two doors an Instagram account's row is written through (00677, decision 0143), over a database in memory: what
 * `instagram_account_connect` and `instagram_account_disconnect` do, with the Vault beside them, for the suites that run
 * the edge's connect and disconnect (instagram-connect, meta-connect). The real functions are proved on a real database
 * by an-instagram-account-moves.db.test.mjs, case for case with what is modelled here.
 */
import { randomUUID } from "node:crypto";

/** What a row keeps of a token it no longer holds: nothing. */
const OF_THE_TOKEN = new Set([
  "scopes",
  "token_checked_at",
  "token_lapsed_at",
  "token_refreshed_at",
  "token_expires_at",
]);

/** A row let go: off, holding no account and no token, its config keeping the handle with the account, when and who. */
function letGo(row, vault, by) {
  const kept = Object.entries(row.config ?? {}).filter(([name]) => !OF_THE_TOKEN.has(name));
  row.config = {
    ...Object.fromEntries(kept),
    account_id: row.external_id,
    disconnected_at: new Date().toISOString(),
    ...(by ? { disconnected_by: by } : {}),
  };
  row.status = "disabled";
  row.external_id = `let-go:${row.id}`;
  row.credentials_ref = null;
  delete vault[row.id];
}

/**
 * The doors over `tables.tenant_channels`, `tables.events` and `vault` (a record of each channel's kept secret by its
 * id). `vaultFails` is asked at each write of a secret: a Vault that refuses raises, and the connect it was part of
 * changes nothing and says nothing.
 */
export function accountDoors(tables, vault, { vaultFails = () => false } = {}) {
  const instagram = () => tables.tenant_channels.filter((row) => row.kind === "instagram");
  /** A door's own event, on the ledger with its write. */
  const say = (tenantId, kind, channelId, data) =>
    (tables.events ??= []).push({
      id: randomUUID(),
      tenant_id: tenantId,
      kind,
      category: "system",
      subject_type: "channel",
      subject_id: channelId,
      data,
      created_at: new Date().toISOString(),
    });
  const keep = (channelId, secret) => {
    if (vaultFails()) throw Object.assign(new Error("vault is read-only"), { code: "XX000" });
    vault[channelId] = secret;
    const row = tables.tenant_channels.find((r) => r.id === channelId);
    if (row) row.credentials_ref = `wa-creds-${channelId}`;
    return null;
  };
  return {
    get_channel_credentials: ({ p_channel_id }) => vault[p_channel_id] ?? null,
    put_channel_credentials: ({ p_channel_id, p_secret }) => keep(p_channel_id, p_secret),
    instagram_account_disconnect: ({ p_tenant_id, p_channel_id, p_by }) => {
      const row = instagram().find((r) => r.id === p_channel_id && r.tenant_id === p_tenant_id);
      if (!row) return { outcome: "gone" };
      if (row.external_id === `let-go:${row.id}`) return { outcome: "already" };
      const held = { account_id: row.external_id, was: row.status };
      const ended = {
        kind: "instagram",
        login: row.config?.login ?? "instagram",
        account_id: row.external_id,
        username: row.config?.username ?? null,
        by: p_by ?? null,
      };
      letGo(row, vault, p_by ?? null);
      // A connection ended is said; a row that was off already had none to end.
      if (held.was === "active") say(p_tenant_id, "channel.disconnected", row.id, ended);
      return { outcome: "let_go", ...held };
    },
    instagram_account_connect: ({ p_tenant_id, p_account_id, p_config, p_secret }) => {
      if (!/^\d{5,32}$/.test(p_account_id ?? ""))
        throw Object.assign(new Error("instagram_account_connect: not an account id"), { code: "22023" });
      const other = instagram().find((r) => r.external_id === p_account_id && r.tenant_id !== p_tenant_id);
      if (other?.status === "active") return { outcome: "taken", held_by: other.tenant_id };
      const another = instagram().find(
        (r) => r.tenant_id === p_tenant_id && r.status === "active" && r.external_id !== p_account_id,
      );
      if (another) return { outcome: "another_here", username: another.config?.username ?? null };
      const mine = instagram().filter((r) => r.tenant_id === p_tenant_id);
      const own =
        mine.find((r) => r.external_id === p_account_id) ??
        mine.find((r) => r.external_id === `let-go:${r.id}` && r.config?.account_id === p_account_id);
      // The Vault is asked before anything is changed here: a refusal leaves every row as it was, as the door's one
      // transaction does.
      if (vaultFails()) throw Object.assign(new Error("vault is read-only"), { code: "XX000" });
      if (other) letGo(other, vault, null);
      const row = own ?? {
        id: randomUUID(),
        tenant_id: p_tenant_id,
        kind: "instagram",
        number_e164: null,
        waba_id: null,
        created_at: new Date().toISOString(),
      };
      if (!own) tables.tenant_channels.push(row);
      Object.assign(row, { external_id: p_account_id, config: p_config, status: "active" });
      keep(row.id, p_secret);
      say(p_tenant_id, "channel.connected", row.id, {
        kind: "instagram",
        account_id: p_account_id,
        username: p_config?.username ?? null,
        by: p_config?.connected_by ?? null,
        ...("login" in (p_config ?? {}) ? { login: p_config.login } : {}),
      });
      return { outcome: "connected", channel_id: row.id, was: own ? "own" : "new" };
    },
  };
}
