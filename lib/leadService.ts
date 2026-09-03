import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";
import type { CrmLeadInsert, CrmLead } from "@/types/lead";

const CONTEXT = "leadService";
const TABLE = "crm_leads";

// ── Create ────────────────────────────────────────────

/**
 * Insert a single lead into crm_leads.
 * Returns the inserted row or null on failure.
 */
export async function createLead(
  lead: CrmLeadInsert
): Promise<CrmLead | null> {
  try {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from(TABLE)
      .insert(lead)
      .select()
      .single();

    if (error) {
      logger.error(CONTEXT, "Insert failed", error);
      return null;
    }

    logger.info(CONTEXT, `Lead created – ${data.id}`, {
      source: data.source,
      email: data.email,
    });

    return data as CrmLead;
  } catch (err) {
    logger.error(CONTEXT, "Unexpected error in createLead", err);
    return null;
  }
}

// ── Read ──────────────────────────────────────────────

export async function getLeadById(id: string): Promise<CrmLead | null> {
  try {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      logger.error(CONTEXT, "getLeadById failed", error);
      return null;
    }

    return data as CrmLead;
  } catch (err) {
    logger.error(CONTEXT, "Unexpected error in getLeadById", err);
    return null;
  }
}

export async function getLeadsBySource(
  source: string,
  limit = 50
): Promise<CrmLead[]> {
  try {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("source", source)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(CONTEXT, "getLeadsBySource failed", error);
      return [];
    }

    return (data ?? []) as CrmLead[];
  } catch (err) {
    logger.error(CONTEXT, "Unexpected error in getLeadsBySource", err);
    return [];
  }
}

// ── Update ────────────────────────────────────────────

export async function updateLead(
  id: string,
  updates: Partial<CrmLeadInsert>
): Promise<CrmLead | null> {
  try {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logger.error(CONTEXT, "Update failed", error);
      return null;
    }

    logger.info(CONTEXT, `Lead updated – ${id}`);
    return data as CrmLead;
  } catch (err) {
    logger.error(CONTEXT, "Unexpected error in updateLead", err);
    return null;
  }
}

// ── Upsert (by email) ────────────────────────────────

/**
 * Insert a lead or update the existing row if the email
 * already exists (requires a unique constraint on email
 * in your Supabase table, or use onConflict).
 */
export async function upsertLeadByEmail(
  lead: CrmLeadInsert
): Promise<CrmLead | null> {
  try {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from(TABLE)
      .upsert(lead, { onConflict: "email" })
      .select()
      .single();

    if (error) {
      logger.error(CONTEXT, "Upsert failed", error);
      // Fallback: plain insert
      return createLead(lead);
    }

    logger.info(CONTEXT, `Lead upserted – ${data.id}`);
    return data as CrmLead;
  } catch (err) {
    logger.error(CONTEXT, "Unexpected error in upsertLeadByEmail", err);
    return null;
  }
}