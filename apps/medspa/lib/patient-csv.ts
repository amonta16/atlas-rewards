/**
 * lib/patient-csv.ts — lead-magnet audit, step 4 · reading a patient export (CSV/TSV) in the browser.
 *
 * Column titles vary by booking system (Boulevard, Vagaro, Mangomint, Zenoti, a spreadsheet), so
 * columns are found by name: full name or first + last, phone, email, last visit date, last
 * treatment, visit count. A last treatment that matches a menu item with "due again" weeks puts
 * the patient on Patients due. Pure functions, no React: tested in apps/venues/tests.
 */
import type { DeskMember, DueRow, Treatment } from "./desk-api";

export const MAX_ROWS = 5000;

/** RFC 4180-ish: quotes, escaped quotes, commas/newlines inside quotes, CRLF. Tab or ; separated files too. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const COLS: Record<"name" | "first" | "last" | "phone" | "email" | "visit" | "treatment" | "visits", RegExp> = {
  name: /^(full ?name|name|patient( name)?|client( name)?|customer( name)?)$/,
  first: /^(first( name)?|given( name)?|fname)$/,
  last: /^(last( name)?|surname|family( name)?|lname)$/,
  phone: /(phone|mobile|cell|tel)/,
  email: /e-?mail/,
  visit: /(last (visit|appointment|appt|service)( date)?|last seen|visit date|date of (last )?(visit|service)|^date$)/,
  treatment: /(last (treatment|service|procedure)$|^(treatment|service|procedure)( name)?$)/,
  visits: /(visit count|total visits|^visits$|# ?of visits|number of visits)/,
};

export type Mapped = { members: DeskMember[]; due: DueRow[]; skipped: number; found: string[] };

export function mapRows(rows: string[][], treatments: Treatment[]): Mapped {
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase().replace(/[_.]+/g, " "));
  const col = (k: keyof typeof COLS) => head.findIndex((h) => COLS[k].test(h));
  const ix = { name: col("name"), first: col("first"), last: col("last"), phone: col("phone"), email: col("email"), visit: col("visit"), treatment: col("treatment"), visits: col("visits") };
  const found = (Object.keys(ix) as (keyof typeof ix)[]).filter((k) => ix[k] >= 0);
  const members: DeskMember[] = [];
  const due: DueRow[] = [];
  let skipped = 0;
  const now = Date.now();
  for (const r of rows.slice(1, MAX_ROWS + 1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const name = get(ix.name) || [get(ix.first), get(ix.last)].filter(Boolean).join(" ");
    const phone = get(ix.phone).replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    const email = get(ix.email).toLowerCase();
    if (!name && !phone && !email) { skipped++; continue; }
    const n = members.length;
    const visitAt = get(ix.visit) ? new Date(get(ix.visit)) : null;
    const lastVisit = visitAt && !Number.isNaN(visitAt.getTime()) && visitAt.getTime() < now + 864e5 ? visitAt.toISOString() : null;
    const visits = parseInt(get(ix.visits), 10);
    const m: DeskMember = {
      membership_id: `imp${n}`, user_id: `impu${n}`, full_name: name || null, email: email || null, phone: phone.length === 10 ? phone : null,
      points_balance: 0, tier: null, joined_at: lastVisit, visit_count: Number.isFinite(visits) ? visits : lastVisit ? 1 : 0,
    };
    members.push(m);
    // Due: their last treatment's recall window, from the menu ("due again" weeks).
    const tName = get(ix.treatment);
    if (lastVisit && tName) {
      const t = treatments.find((x) => x.recall_weeks && (x.name.toLowerCase().includes(tName.toLowerCase()) || tName.toLowerCase().includes(x.name.toLowerCase().split(/[\s(]/)[0] ?? "~")));
      if (t?.recall_weeks) {
        const dueAt = new Date(new Date(lastVisit).getTime() + t.recall_weeks * 7 * 864e5).toISOString();
        due.push({ ...m, treatment_name: t.name, performed_at: lastVisit, due_at: dueAt, has_upcoming_booking: false } as DueRow);
      }
    }
  }
  if (rows.length - 1 > MAX_ROWS) skipped += rows.length - 1 - MAX_ROWS;
  due.sort((a, b) => a.due_at.localeCompare(b.due_at));
  return { members, due, skipped, found };
}
