/**
 * Lead-magnet audit, step 4 · the preview desk's patient import (apps/medspa/lib/patient-csv.ts).
 * It runs in the owner's browser on whatever their booking software exports, so the parser has to
 * survive quotes, commas in names, CRLF, BOM-less tabs and odd column titles.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRows, parseCsv, MAX_ROWS } from "../../medspa/lib/patient-csv";

const MENU = [
  { id: "tox", name: "Botox", recall_weeks: 12 },
  { id: "hf", name: "HydraFacial", recall_weeks: 4 },
  { id: "consult", name: "Consultation", recall_weeks: null },
];

test("parseCsv: quotes, escaped quotes, commas and newlines inside quotes, CRLF", () => {
  const rows = parseCsv('Name,Notes\r\n"Smith, Jane","said ""hi""\nthen left"\r\nBo,x\r\n');
  assert.deepEqual(rows, [["Name", "Notes"], ["Smith, Jane", 'said "hi"\nthen left'], ["Bo", "x"]]);
});

test("parseCsv: tab- and semicolon-separated exports, blank lines skipped", () => {
  assert.deepEqual(parseCsv("First\tLast\n\nAna\tLee\n"), [["First", "Last"], ["Ana", "Lee"]]);
  assert.deepEqual(parseCsv("Name;Phone\nAna;805-555-0101"), [["Name", "Phone"], ["Ana", "805-555-0101"]]);
});

test("mapRows: finds columns by name, normalizes phones and emails", () => {
  const rows = parseCsv([
    "First Name,Last Name,Mobile Phone,E-mail,Last Visit Date,Last Service,Total Visits",
    "Ana,Lee,+1 (805) 555-0101,ANA@Example.com,2026-08-01,Botox,7",
    "Bo,,805.555.0102,,,,",
    ",,,,2026-01-02,Botox,3", // no name, phone or email: skipped (fully blank rows never reach mapRows)
  ].join("\n"));
  const m = mapRows(rows, MENU);
  assert.equal(m.members.length, 2);
  assert.equal(m.skipped, 1);
  assert.deepEqual(m.found.sort(), ["email", "first", "last", "phone", "treatment", "visit", "visits"].sort());
  const [ana, bo] = m.members;
  assert.equal(ana.full_name, "Ana Lee");
  assert.equal(ana.phone, "8055550101");
  assert.equal(ana.email, "ana@example.com");
  assert.equal(ana.visit_count, 7);
  assert.equal(bo.full_name, "Bo");
  assert.equal(bo.visit_count, 0);
});

test("mapRows: a last treatment with 'due again' weeks puts the patient on Patients due", () => {
  const rows = parseCsv("Patient Name,Phone,Last Appointment,Treatment\nAna Lee,8055550101,2026-08-01,Botox 20 units\nBo Kim,8055550102,2026-09-01,Consultation");
  const m = mapRows(rows, MENU);
  assert.equal(m.due.length, 1);
  assert.equal(m.due[0].full_name, "Ana Lee");
  assert.equal(m.due[0].treatment_name, "Botox");
  const weeks = (new Date(m.due[0].due_at).getTime() - new Date(m.due[0].performed_at).getTime()) / (7 * 864e5);
  assert.equal(Math.round(weeks), 12);
});

test("mapRows: future and unreadable dates are ignored; huge files are capped", () => {
  const rows = parseCsv("Name,Last Visit\nAna,not a date\nBo,2999-01-01");
  const m = mapRows(rows, MENU);
  assert.equal(m.members[0].joined_at, null);
  assert.equal(m.members[1].joined_at, null);

  const big = [["Name"], ...Array.from({ length: MAX_ROWS + 25 }, (_, i) => [`P${i}`])];
  const capped = mapRows(big, MENU);
  assert.equal(capped.members.length, MAX_ROWS);
  assert.equal(capped.skipped, 25);
});
