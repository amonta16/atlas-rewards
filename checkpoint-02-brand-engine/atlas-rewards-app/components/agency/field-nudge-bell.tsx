"use client";
/**
 * FieldNudgeBell — CP-63 Phase 2
 *
 * The reps' notification bell inside the Field App. Shows daily motivational
 * nudges (admin_notifications), an unread badge, and a one-tap "turn on push
 * for this phone" so the morning nudge also lands as a phone notification.
 */
import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Check, X, Loader2, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ensurePushSubscription } from "@/lib/notifications/push-client";
import { useToast } from "@/components/ui/toast";

type Note = { id: string; title: string; body: string | null; read_at: string | null; created_at: string };

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function FieldNudgeBell() {
  const { toast } = useToast();
  const [items, setItems] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushOn, setPushOn] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("admin_notifications")
      .select("id, title, body, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    setItems((data ?? []) as Note[]);
  }, []);

  useEffect(() => {
    load();
    if (typeof window !== "undefined") setPushOn(Notification?.permission === "granted");
  }, [load]);

  const unread = items.filter(i => !i.read_at).length;

  async function openPanel() {
    setOpen(true);
    if (unread > 0) {
      const supabase = createClient();
      // RLS restricts this update to the caller's own rows.
      await supabase.from("admin_notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
      setItems(prev => prev.map(i => (i.read_at ? i : { ...i, read_at: new Date().toISOString() })));
    }
  }

  async function enablePush() {
    setPushBusy(true);
    try {
      await ensurePushSubscription(null); // null = agency/global tag
      setPushOn(Notification?.permission === "granted");
      if (Notification?.permission === "granted") toast.success("Push on for this phone 🔔");
      else toast.error("Push permission was blocked");
    } catch {
      toast.error("Couldn't enable push here");
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <>
      <button onClick={openPanel}
        className="relative h-9 w-9 rounded-xl bg-white/5 ring-1 ring-white/10 flex items-center justify-center text-cyan-200">
        {unread > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-cyan-400 text-slate-900 text-[10px] font-black flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center" onClick={() => setOpen(false)}>
          <div className="mt-16 w-[92%] max-w-sm rounded-3xl bg-[#08192e] ring-1 ring-cyan-300/20 text-white overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
              <h3 className="font-bold flex items-center gap-2"><Bell className="h-4 w-4 text-cyan-300" /> Nudges</h3>
              <button onClick={() => setOpen(false)} className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>

            {!pushOn && (
              <button onClick={enablePush} disabled={pushBusy}
                className="w-full px-4 py-3 flex items-center gap-2 text-left bg-cyan-400/10 text-cyan-100 text-sm font-semibold border-b border-white/10">
                {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                Turn on push for this phone
              </button>
            )}

            <div className="max-h-[60vh] overflow-y-auto divide-y divide-white/5">
              {items.length === 0 && (
                <div className="px-4 py-10 text-center text-cyan-100/40 text-sm">No nudges yet. They land here each morning.</div>
              )}
              {items.map(n => (
                <div key={n.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-widest font-bold text-cyan-300/60">{n.title}</span>
                    <span className="text-[11px] text-cyan-100/30">{ago(n.created_at)}</span>
                  </div>
                  <p className="text-sm text-cyan-50/90 mt-0.5">{n.body}</p>
                </div>
              ))}
            </div>

            {pushOn && (
              <div className="px-4 py-2.5 text-[11px] text-emerald-300/70 flex items-center gap-1.5 border-t border-white/10">
                <Check className="h-3.5 w-3.5" /> Push is on for this phone
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
