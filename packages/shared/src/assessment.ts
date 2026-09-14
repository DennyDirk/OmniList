import { z } from "zod";

export const assessmentSchema = z.object({
  productId: z.string(),
  channelId: z.enum(["ebay", "etsy", "shopify"]),
  connectionId: z.string().optional(),
  status: z.enum(["ready", "needs_attention", "not_checked", "not_supported"]),
  score: z.number(),
  issues: z.array(z.object({ code: z.string(), field: z.string(),
    severity: z.enum(["blocking", "warning", "suggestion"]), message: z.string() })),
  checkedAt: z.string().datetime(),
  revision: z.string().min(1)
});
export type UnifiedAssessment = z.infer<typeof assessmentSchema>;

export function canPublishAssessment(assessment: UnifiedAssessment): boolean {
  return assessment.status === "ready" && !assessment.issues.some(issue => issue.severity === "blocking");
}
