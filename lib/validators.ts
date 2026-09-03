import { z } from "zod";

// ── Meta / Facebook Schemas ───────────────────────────
export const metaFieldDataSchema = z.object({
  name: z.string(),
  values: z.array(z.string()),
});

export const metaLeadValueSchema = z.object({
  leadgen_id: z.string(),
  form_id: z.string().optional(),
  page_id: z.string().optional(),
  adgroup_id: z.string().optional(),
  ad_id: z.string().optional(),
  created_time: z.number().optional(),
  // CRITICAL: field_data must be optional because the initial webhook doesn't send it!
  field_data: z.array(metaFieldDataSchema).optional(), 
});

export const metaWebhookChangeSchema = z.object({
  field: z.string(),
  value: metaLeadValueSchema,
});

export const metaWebhookEntrySchema = z.object({
  id: z.string(),
  time: z.number(),
  changes: z.array(metaWebhookChangeSchema),
});

export const metaWebhookBodySchema = z.object({
  object: z.string(),
  entry: z.array(metaWebhookEntrySchema),
});