import io, sys
p = "components/brand-editor/brand-editor.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
CRLF = "\r\n" in raw
s = raw.replace("\r\n", "\n")
orig = s

old = """                <Field label="Hours (optional)">
                  <Input
                    value={b.contact_info?.hours ?? ""}
                    onChange={e => update("contact_info", { ...(b.contact_info ?? {}), hours: e.target.value })}
                    placeholder="Opens at 9:00 AM"
                  />
                </Field>"""

new = """                <Field label="Hours (optional)">
                  <Input
                    value={b.contact_info?.hours ?? ""}
                    onChange={e => update("contact_info", { ...(b.contact_info ?? {}), hours: e.target.value })}
                    placeholder="Opens at 9:00 AM"
                  />
                </Field>
                {/* CP-140: the local clock. Anything with a deadline — prize
                    wheel windows today — expires at the end of the day HERE,
                    not at the end of the day in UTC (which is late afternoon
                    in California). Pacific by default. */}
                <Field label="Local timezone (used for prize + offer deadlines)">
                  <select
                    value={b.contact_info?.timezone ?? "America/Los_Angeles"}
                    onChange={e => update("contact_info", { ...(b.contact_info ?? {}), timezone: e.target.value })}
                    className="w-full rounded-md border border-input bg-background h-10 px-3 text-sm"
                  >
                    <option value="America/Los_Angeles">Pacific — Los Angeles</option>
                    <option value="America/Phoenix">Arizona — Phoenix (no DST)</option>
                    <option value="America/Denver">Mountain — Denver</option>
                    <option value="America/Chicago">Central — Chicago</option>
                    <option value="America/New_York">Eastern — New York</option>
                    <option value="America/Anchorage">Alaska — Anchorage</option>
                    <option value="Pacific/Honolulu">Hawaii — Honolulu</option>
                  </select>
                </Field>"""

if old not in s or s.count(old) != 1:
    sys.exit("MISS/AMBIGUOUS: hours field")
s = s.replace(old, new)

assert s != orig
out = s.replace("\n", "\r\n") if CRLF else s
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("patched", p)
