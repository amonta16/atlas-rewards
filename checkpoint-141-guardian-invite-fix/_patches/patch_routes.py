import io, sys

def patch(p, pairs):
    raw = io.open(p, encoding="utf-8", newline="").read()
    CRLF = "\r\n" in raw
    s = raw.replace("\r\n", "\n"); orig = s
    for old, new, label in pairs:
        if old not in s: sys.exit(f"MISS {p}: {label}")
        if s.count(old) != 1: sys.exit(f"AMBIGUOUS {p}: {label}")
        s = s.replace(old, new)
    assert s != orig
    io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n","\r\n") if CRLF else s)
    print("patched", p)

patch("app/api/waivers/guardian-invite/route.ts", [(
'''  return NextResponse.json({ ok: sent });
}''',
'''  // CP-141: this used to return 200 with { ok: false } when the mail never
  // went out, and the client only checks res.ok — so a minor saw "Sent to
  // your parent" and then waited forever for an email that was never sent.
  // A failure to send is a failure of the request. The guardian request row
  // stays pending either way, so the front desk can still sign them in and
  // the member can retry.
  if (!sent.ok) {
    return NextResponse.json(
      { ok: false, reason: sent.reason ?? "send_failed" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}''', "guardian 502")])

patch("app/api/waivers/email-copy/route.ts", [(
'''  return NextResponse.json({ ok: sent });
}''',
'''  // Best-effort by design (the client fires and forgets), but report the
  // real outcome so the reason shows up in logs — CP-141.
  return NextResponse.json({ ok: sent.ok, reason: sent.reason });
}''', "email-copy result")])
