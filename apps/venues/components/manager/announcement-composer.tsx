"use client";
/**
 * AnnouncementComposer — CP-86
 *
 * Manager-only card on the Front desk tab: post ONE simple announcement
 * ("Tuesday we're closing early") that customers see as a dismissible
 * banner in their app until it expires or is cleared. Optionally fires a
 * push notification + in-app bell row the moment it's posted (via
 * /api/notifications/announce-message).
 *
 * Deliberately dead simple: one live message per business — posting a new
 * one replaces the old one. Not rendered at all for business_staff (the
 * parent gates on role), and the SQL RPCs are manager-gated too.
 */
import { useEffect, useState } from "react";
import { Megaphone, Loader2, Trash2, Send, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

type Announcement = {
  business_id: string;
  message: string;
  expires_at: string | null;
  updated_at: string;
};

// How long the banner stays up. "0" = until manually cleared.
const DURATIONS: { days: number; label: string }[] = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 0, label: "Until cleared" },
];

export function AnnouncementComposer({
  businessId, primary,
}: { businessId: string; primary: string }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState<Announcement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState<number>(3);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("business_announcements")
      .select("business_id, message, expires_at, updated_at")
      .eq("business_id", businessId)
      .maybeSingle();
    const row = data as Announcement | null;
    // An expired announcement reads as "none".
    if (row && row.expires_at && new Date(row.expires_at) < new Date()) {
      setCurrent(null);
    } else {
      setCurrent(row ?? null);
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function post() {
    const msg = message.trim();
    if (!msg) { toast.error("Type the announcement first"); return; }
    setBusy(true);
    const supabase = createClient();
    const expiresAt = days > 0
      ? new Date(Date.now() + days * 86_400_000).toISOString()
      : null;
    const { error } = await supabase.rpc("set_business_announcement", {
      p_business_id: businessId,
      p_message: msg,
      p_expires_at: expiresAt,
    });
    if (error) {
      setBusy(false);
      toast.error(
        /set_business_announcement/.test(error.message)
          ? "Apply the CP-86 SQL migration in Supabase first."
          : error.message,
      );
      return;
    }

    // Optional push + bell row — fire-and-forget; the banner is live already.
    if (notify) {
      fetch("/api/notifications/announce-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, message: msg }),
      }).catch(() => { /* banner is the safety net */ });
    }

    setBusy(false);
    setMessage("");
    toast.success(notify ? "Announcement posted + customers notified 📣" : "Announcement posted 📣");
    load();
  }

  async function clear() {
    if (!confirm("Take down the current announcement?")) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("clear_business_announcement", {
      p_business_id: businessId,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Announcement cleared");
    load();
  }

  return (
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <Megaphone className="h-4 w-4" style={{ color: primary }} />
        <div>
          <h3 className="font-semibold text-sm">Announcement</h3>
          <p className="text-[11px] text-muted-foreground">
            One short message customers see as a banner in the app — "Closing
            early Tuesday", "New hours", anything. Managers only.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Live announcement */}
        {loaded && current && (
          <div
            className="rounded-xl px-3.5 py-3 flex items-start gap-2.5"
            style={{ background: `${primary}0d`, border: `1px solid ${primary}33` }}
          >
            <Megaphone className="h-4 w-4 mt-0.5 shrink-0" style={{ color: primary }} />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest font-black" style={{ color: primary }}>
                Live now
              </div>
              <div className="text-sm font-semibold text-zinc-800 mt-0.5">{current.message}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                {current.expires_at
                  ? <>Clears {new Date(current.expires_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</>
                  : "Stays up until you clear it"}
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-rose-600 shrink-0" onClick={clear} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Composer */}
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={280}
          rows={2}
          placeholder={current ? "Replace it with a new message…" : 'e.g. "Heads up — we\'re closing at 5pm this Tuesday."'}
          className="w-full rounded-xl border bg-white p-3 text-sm"
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Shows for</Label>
            <div className="flex rounded-full bg-zinc-100 p-0.5">
              {DURATIONS.map(d => (
                <button
                  key={d.days}
                  type="button"
                  onClick={() => setDays(d.days)}
                  className={
                    "px-2.5 py-1 rounded-full text-[11px] font-bold transition " +
                    (days === d.days ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-800")
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-[10px] text-zinc-400 tabular-nums">{message.length}/280</div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[12px] font-semibold text-zinc-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notify}
              onChange={e => setNotify(e.target.checked)}
              className="h-4 w-4 rounded accent-current"
              style={{ color: primary }}
            />
            <BellRing className="h-3.5 w-3.5" style={{ color: primary }} />
            Also send a push notification
          </label>
          <Button
            onClick={post}
            disabled={busy || !message.trim()}
            className="text-white font-bold"
            style={{ background: primary }}
          >
            {busy
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><Send className="h-4 w-4 mr-1.5" /> {current ? "Replace announcement" : "Post announcement"}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
