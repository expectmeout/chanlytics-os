/**
 * What a workspace's delete cannot reach, read off its rows (tooling/scripts/ops/delete-tenant.mjs): each entry is
 * something that keeps running, and in two cases keeps being billed, after every row is gone. The script refuses an
 * apply while there is any, and says what to release first.
 *
 * Plain Node, as the script is: it imports nothing of the app's.
 */

/** A phone line: its Twilio subaccount, its number still billed, its trunk, its messaging service, its secret. */
const lineWords = (line) =>
  `the phone line ${line.e164 ?? "(no number)"} — Twilio subaccount ${line.subaccount_sid ?? "—"}, ` +
  `number ${line.number_sid ?? "—"}${line.trunk_sid ? `, trunk ${line.trunk_sid}` : ""}` +
  `${line.messaging_service_sid ? `, messaging service ${line.messaging_service_sid}` : ""}` +
  `${line.brand_sid ? `, and a registered A2P brand` : ""}` +
  ` — plus its line-creds Vault secret. Release the number and close the subaccount first, or move the line to another workspace.` +
  (line.voice_state === "answering" ? "\n      IT IS ANSWERING CALLS RIGHT NOW." : "");

/** The sentences, one for each thing the workspace's rows say it still holds at a provider. `rows` is by table. */
export function strandedOf(rows) {
  const of = (table) => rows.get(table) ?? [];
  const out = of("lines").map(lineWords);
  for (const b of of("billing_accounts")) {
    if (b.stripe_subscription_id || b.stripe_customer_id) {
      out.push(
        `a Stripe ${b.status === "trialing" ? "trial" : b.status} — customer ${b.stripe_customer_id ?? "—"}` +
          `${b.stripe_subscription_id ? `, subscription ${b.stripe_subscription_id}` : ""}. Cancel it in Stripe first.`,
      );
    }
  }
  for (const g of of("google_connections")) {
    out.push(
      `a Google Business Profile grant for ${g.google_email ?? "an account"}, and its google-creds Vault secret. Disconnect it in the product first, which hands the grant back to Google.`,
    );
  }
  for (const m of of("mailbox_connections")) {
    if (m.state !== "removed")
      out.push(
        `a connected mailbox, ${m.address}: its grant at ${m.provider === "microsoft" ? "Microsoft" : "Google"}, its watch there, and its mailbox-creds Vault secret. Remove it on Connections first, which hands the grant back and drops the secret.`,
      );
  }
  // A footage source's connection (00639): its grant at Google, the push channels its watched folders opened there,
  // and its Vault secret. One its organisation blocked was never granted and holds none of them.
  for (const s of of("source_connections")) {
    if (s.health !== "blocked_by_admin")
      out.push(
        `a connected footage account, ${s.email ?? "an account"}: its grant at Google, its watched folders' push channels there, and its Vault secret. Disconnect it on Connections first, which stops the channels and drops the secret.`,
      );
  }
  // An owner's ad account (00648): its grant at the platform and its Vault secret, until the platform has confirmed
  // that access is withdrawn. Ads left running there keep running, and are the owner's to stop on the platform.
  for (const a of of("ad_accounts")) {
    if (!a.withdrawn_at)
      out.push(
        `a connected ad account, ${a.name ?? a.external_id ?? "still to be chosen"}: its grant at its platform, and its ad-creds Vault secret. Disconnect it on Connections first, which asks the platform to withdraw access and drops the secret.`,
      );
  }
  for (const c of of("tenant_channels")) {
    if (c.status === "active")
      out.push(
        `an active channel binding ${c.external_id ?? "(no id)"} at its provider, and its channel-credentials Vault secret.`,
      );
  }
  // The receptionist's agent and its LLM at Retell (00476): made by a rehearsal before any number, so a workspace with no
  // line can still have one. Its row goes with the cascade; the agent does not.
  for (const a of of("voice_agents")) {
    out.push(`a Retell agent ${a.agent_id}${a.llm_id ? ` and its LLM ${a.llm_id}` : ""}. Delete them at Retell.`);
  }
  return out;
}
