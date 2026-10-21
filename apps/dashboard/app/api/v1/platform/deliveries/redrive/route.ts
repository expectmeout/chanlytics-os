import { write, platform } from "@/server/route";
import { DeliveryRedriveSchema } from "@chanlytics/contracts";
import { healthRedrive } from "@/server/platform/health";

/**
 * POST /api/v1/platform/deliveries/redrive — {subscriber, why}: Deliver again (decision 0068). Every failed or paused
 * delivery of one subscriber scheduled again, each once (event_deliveries_redrive, 00334), once what broke it is
 * mended. Health's Background work draws it beside the subscriber's failures; the Admin log has who, why and how many.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_delivery_redrive",
  act: "delivery_redrive",
  input: DeliveryRedriveSchema,
  handle: async ({ office, input }) => healthRedrive(office, input.subscriber, input.why),
});
