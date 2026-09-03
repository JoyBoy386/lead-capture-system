import { z } from "zod";
import type {
  MetaWebhookBody,
  LinkedInLeadPayload,
  ChatbotLeadPayload,
} from "@/types/lead";

// ── Meta ──────────────────────────────────────────────

const metaFieldDataSchema = z.object({
  name: z.string(),
  values: z.array(z.string()),
});

const metaLeadPayloadSchema = z.object({
  leadgen_id: z.string().min(1),
  form_id: z.string().optional(),
  page_id: z.string().optional(),
  field_data: z.array(metaFieldDataSchema),
});

const metaChangeSchema = z.object({
  field: z.string(),
  value: metaLeadPayloadSchema,
});

const metaEntrySchema = z.object({
  id: z.string(),
  time: z.number(),
  changes: z.array(metaChangeSchema).min(1),
});

export const metaWebhookBodySchema: z.ZodType<MetaWebhookBody> = z.object({
  object: z.string(),
  entry: z.array(metaEntrySchema).min(1),
});

// ── LinkedIn ──────────────────────────────────────────

export const linkedInLeadSchema: z.ZodType<LinkedInLeadPayload> = z
  .object({
    name: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    emailAddress: z.string().email().optional(),
    phone: z.string().optional(),
    phoneNumber: z.string().optional(),
    company: z.string().optional(),
    companyName: z.string().optional(),
    jobTitle: z.string().optional(),
    title: z.string().optional(),
  })
  .passthrough();

// ── Chatbot ───────────────────────────────────────────

export const chatbotLeadSchema: z.ZodType<ChatbotLeadPayload> = z
  .object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    interest: z.string().optional(),
    chat_topic: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();