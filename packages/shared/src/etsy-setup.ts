import { z } from "zod";

const id = z.string().regex(/^[1-9]\d*$/);
export const etsySetupOptionsSchema = z.object({
  connectionId: z.string().min(1), shopId: id, checkedAt: z.string().datetime(),
  shippingProfiles: z.array(z.object({ id, title: z.string().min(1) })).max(1000),
  returnPolicies: z.array(z.object({ id, acceptsReturns: z.boolean(), acceptsExchanges: z.boolean(),
    returnDeadline: z.number().int().nonnegative().nullable() })).max(1000),
  processingProfiles: z.array(z.object({ id, state: z.enum(["ready_to_ship", "made_to_order"]),
    label: z.string().min(1) })).max(1000)
});
export type EtsySetupOptions = z.infer<typeof etsySetupOptionsSchema>;
