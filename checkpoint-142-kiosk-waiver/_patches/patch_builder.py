import io, sys
p = "components/agency/waivers-manager.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
CRLF = "\r\n" in raw
s = raw.replace("\r\n", "\n"); orig = s

def sub(old, new, label):
    global s
    if old not in s: sys.exit("MISS: " + label)
    if s.count(old) != 1: sys.exit("AMBIGUOUS: " + label)
    s = s.replace(old, new)

# 1 — type gains the flag
sub('''type Waiver = { id: string; title: string; is_active: boolean; required_for_signup: boolean; current_version_id: string | null; created_at: string };''',
    '''type Waiver = { id: string; title: string; is_active: boolean; required_for_signup: boolean; current_version_id: string | null; created_at: string; kiosk_enabled: boolean };''',
    "type")

# 2 — the kiosk row on each waiver card
sub('''                        {w.required_for_signup && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Required for every new member</span>}''',
'''                        {w.required_for_signup && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Required for every new member</span>}
                        {w.kiosk_enabled && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Front-desk kiosk on</span>}''',
    "badge")

assert s != orig
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n","\r\n") if CRLF else s)
print("patched", p)
