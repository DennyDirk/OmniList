import { z } from "zod";
import { channelConnectionSchema } from "./schemas";

export const assessmentSchema = z.object({
  productId: z.string(),
  channelId: z.enum(["ebay", "etsy", "shopify"]),
  connectionId: z.string().optional(),
  connectionRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  status: z.enum(["ready", "needs_attention", "not_checked", "not_supported"]),
  score: z.number(),
  issues: z.array(z.object({ code: z.string(), field: z.string(),
    severity: z.enum(["blocking", "warning", "suggestion"]), message: z.string() })),
  checkedAt: z.string().datetime(),
  revision: z.string().min(1)
});
export type UnifiedAssessment = z.infer<typeof assessmentSchema>;

export const readinessResponseSchema = z.object({
  productId: z.string().min(1),
  productRevision: z.string().regex(/^[a-f0-9]{64}$/),
  connections: z.array(channelConnectionSchema),
  items: z.array(assessmentSchema)
});

export function canPublishAssessment(assessment: UnifiedAssessment): boolean {
  return assessment.status === "ready" && !assessment.issues.some(issue => issue.severity === "blocking");
}
