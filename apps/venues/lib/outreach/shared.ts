/**
 * lib/outreach/shared.ts — CP-250 · types, labels and the merge-tag renderer (safe on client and server).
 */

export type LeadStatus =
  | "new" | "no_email" | "review" | "queued" | "contacted" | "done"
  | "replied" | "booked" | "not_interested" | "bounced" | "unsubscribed" | "stopped";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New", no_email: "No email", review: "In review", queued: "Queued", contacted: "Contacted", done: "No reply",
  replied: "Replied", booked: "Booked", not_interested: "Not interested", bounced: "Bounced", unsubscribed: "Unsubscribed", stopped: "Stopped",
};
export const STATUS_TINT: Record<LeadStatus, string> = {
  new: "bg-slate-100 text-slate-700", no_email: "bg-amber-50 text-amber-800", review: "bg-sky-50 text-sky-800",
  queued: "bg-sky-50 text-sky-800", contacted: "bg-indigo-50 text-indigo-800", done: "bg-slate-100 text-slate-600",
  replied: "bg-emerald-50 text-emerald-800", booked: "bg-emerald-100 text-emerald-900", not_interested: "bg-rose-50 text-rose-800",
  bounced: "bg-rose-50 text-rose-800", unsubscribed: "bg-rose-50 text-rose-800", stopped: "bg-slate-100 text-slate-500",
};
/** Statuses where the sequence is still running (or about to). */
export const ACTIVE: LeadStatus[] = ["new", "review", "queued", "contacted"];
/** Statuses a person sets by hand from the lead drawer. */
export const MANUAL_STATUSES: LeadStatus[] = ["replied", "booked", "not_interested", "stopped"];

export type ReplyClass = "interested" | "not_now" | "not_interested" | "unsubscribe" | "out_of_office" | "bounce" | "other";
export const REPLY_LABEL: Record<ReplyClass, string> = {
  interested: "Interested", not_now: "Not now", not_interested: "Not interested", unsubscribe: "Unsubscribe",
  out_of_office: "Out of office", bounce: "Bounce", other: "Other",
};

export type Lead = {
  id: string; campaign_id: string | null; source: "places" | "csv" | "manual"; place_id: string | null;
  business_name: string; address: string | null; city: string | null; state: string | null; phone: string | null;
  website: string | null; domain: string | null; rating: number | null; reviews: number | null;
  email: string | null; email_source: string | null; email_mx_ok: boolean | null; emails_found: string[];
  first_name: string | null; site_notes: string | null; timezone: string; status: LeadStatus; step: number;
  next_at: string | null; stopped_reason: string | null; last_reply_at: string | null; reply_class: string | null;
  notes: string | null; error: string | null; enriched_at: string | null; created_at: string; updated_at: string;
};
export type Message = {
  id: string; lead_id: string; step: number; subject: string; body: string; ai: boolean; ai_detail: string | null;
  status: "draft" | "approved" | "sending" | "sent" | "skipped" | "failed" | "cancelled";
  message_id: string | null; error: string | null; approved_at: string | null; sent_at: string | null; created_at: string;
};
export type Reply = {
  id: string; lead_id: string | null; mail_uid: string; kind: "reply" | "bounce" | "auto"; class: ReplyClass | null;
  from_email: string | null; subject: string | null; body: string | null; received_at: string; handled: boolean;
};
export type Step = { step: number; name: string; delay_days: number; subject: string; body: string; ai: boolean; enabled: boolean };
export type Campaign = { id: string; name: string; area: string | null; paused: boolean; created_at: string };
export type Settings = {
  daily_cap: number; send_days: number[]; window_start: number; window_end: number;
  gap_min_minutes: number; gap_max_minutes: number; approve_followups: boolean;
  paused: boolean; paused_reason: string | null; from_name: string; signature: string;
  next_send_after: string | null; last_tick_at: string | null; last_tick_note: string | null;
};

export const DEFAULT_SETTINGS: Settings = {
  daily_cap: 5, send_days: [1, 2, 3, 4, 5], window_start: 8, window_end: 16, gap_min_minutes: 4, gap_max_minutes: 12,
  approve_followups: false, paused: false, paused_reason: null, from_name: "Andrew Montano",
  signature: "Andrew Montano\nAtlas Engine · atlas-engine.app", next_send_after: null, last_tick_at: null, last_tick_note: null,
};

/** The warm-up ramp the Settings tab recommends for a brand-new domain (per mailbox, per day). */
export const RAMP = [
  { week: "Week 1", cap: 5 }, { week: "Week 2", cap: 10 }, { week: "Week 3", cap: 15 }, { week: "Week 4+", cap: 20 },
];
export const MAX_CAP = 30;

export const MERGE_TAGS = ["{first_name}", "{spa_name}", "{city}", "{preview_link}", "{book_link}"] as const;

export type MergeValues = { first_name: string; spa_name: string; city: string; preview_link: string; book_link: string };

export function fillTags(text: string, v: MergeValues): string {
  return text.replace(/\{(first_name|spa_name|city|preview_link|book_link)\}/g, (_, k: keyof MergeValues) => v[k] ?? "");
}

/** "Hi there," reads better than "Hi ," — and the spa name beats "there" when we have no person. */
export function greetingName(lead: Pick<Lead, "first_name" | "business_name">): string {
  return lead.first_name?.trim() || "there";
}

/** The footer every email ends with: signature, postal address (CAN-SPAM), plain-words opt-out. */
export function footer(signature: string, postal: string | null, unsubscribe: string): string {
  return [
    signature.trim(),
    postal ? postal : "[postal address missing: set MAIL_POSTAL_ADDRESS]",
    "",
    `Not for you? Reply "no thanks" or use this link and I won't email again: ${unsubscribe}`,
  ].join("\n");
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const h = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    return h.replace(/^www\./, "") || null;
  } catch { return null; }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Minimal CSV for the import: quoted fields, commas and newlines in quotes. First row = headers. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().replace(/^﻿/, "").toLowerCase().replace(/[\s-]+/g, "_"));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
