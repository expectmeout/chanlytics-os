import type { ProvisionLinePorts } from "./ports";

/**
 * line_provision: a line's provisioning, on the ledger (00109). The durable
 * part is the ledger's — claimed under a lease, resumed by the heartbeat when
 * a worker dies, tried up to its ceiling and then given up loudly — and the
 * saga is the edge's, reading its own receipts so a second run repeats
 * nothing. A saga that stopped fails the job with the step it stopped at, so
 * the next try resumes there.
 */
export async function provisionLine(
  ports: ProvisionLinePorts,
  cmd: { payload: Record<string, unknown> },
): Promise<void> {
  const lineId = typeof cmd.payload.line_id === "string" ? cmd.payload.line_id : "";
  const by = cmd.payload.by === "sweep" || cmd.payload.by === "support" ? cmd.payload.by : "owner";
  if (!lineId) throw new Error("line_provision: payload.line_id is required");
  if (!ports.provision) throw new Error("line_provision: this runtime holds no line provider");
  const r = await ports.provision(lineId, by);
  if (!r.ok) throw new Error(`line_provision: stopped at ${r.step ?? "?"}: ${r.error ?? "unknown"}`);
}
