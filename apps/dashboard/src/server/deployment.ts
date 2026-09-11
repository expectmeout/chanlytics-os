import "server-only";

export type DeploymentEnv = "production" | "preview" | "development";

export interface Deployment {
  env: DeploymentEnv;
  /**
   * Whether this deployment may reach the real providers through the edge:
   * buy a number, file a registration, connect a WhatsApp number, sync
   * templates, open Checkout, speak into a live call, run the model.
   */
  providersLive: boolean;
}

/**
 * What this deployment may do, decided once and read everywhere.
 *
 * Twelve server functions each asked whether VERCEL_ENV was "production"
 * before touching a provider, so Connections, Ask and templates could not be
 * rehearsed anywhere else, and a new guard was one more copy of the
 * question. Production reaches the real providers. A preview or a laptop
 * reaches them only when EDGE_PROVIDERS=live says its EDGE_URL points at an
 * edge that holds sandbox keys; otherwise every such call answers "not
 * here" (reason: "preview"). An unset VERCEL_ENV is a laptop, never
 * production: the guard once fired only when the variable was set, and
 * plain local dev mirrored pauses into the live store.
 */
export function deploymentFrom(env: Record<string, string | undefined>): Deployment {
  const name: DeploymentEnv = env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview" ? env.VERCEL_ENV : "development";
  return { env: name, providersLive: name === "production" || env.EDGE_PROVIDERS === "live" };
}

export const deployment: Deployment = deploymentFrom({ VERCEL_ENV: process.env.VERCEL_ENV, EDGE_PROVIDERS: process.env.EDGE_PROVIDERS });
