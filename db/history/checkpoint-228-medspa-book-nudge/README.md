# CP-228 · "Book after purchase" journey (med spa)

Adds a 15th journey to the med spa automation suite (CP-217):

- **Trigger:** a patient's membership becomes active, or they pay for a treatment **package** (skincare and gift cards don't count).
- **Day 1** push: "Book your first visit" (membership) or "Ready to book {{item}}?" (package). **Day 4** push: "Still need a time?"
- **Stops** as soon as they book (booking.created) or come in (visit.completed).
- Links to `/app/book`; the med spa app sends that to the clinic's booking options, the venue app opens its Book screen.

Run in Supabase → SQL editor, in order: `01_entry_kind.sql`, then `02_catalog.sql`. Both are safe to re-run.

Nothing sends until a clinic has the journey installed: admin → Automations → the clinic → install / turn on "Book after purchase" (or re-run the suite install for that clinic). Existing journeys are unchanged (the generator reproduces the live CP-217 catalog byte for byte before this addition).

`gen/suite_defs.py` is the CP-217 generator plus this journey; regenerate with `python3 gen/suite_defs.py > 02_catalog.sql`.
