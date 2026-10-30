"use client";
/**
 * NotificationBroadcast — CP-32
 *
 * Manager-side composer for sending a one-off in-app notification to
 * every enrolled member of this business. Used for things like manual
 * "doors close at 4pm today" alerts and the "customer offers" section
 * of Andrew's notifications spec — i.e. the things that aren't already
 * automated based on per-user data.
 *
 * Per-user automated notifications (streaks, daily check, review
 * status, automated offers, reward expirations) are fan-out triggers
 * in the CP-32 SQL migration — not composed here.
 *
 * Rendered in a panel on the Manager dashboard's News tab and is also
 * available from the new Notifications tab in the manager dashboard.
 */
import { useState } from "react";
import { Send, MessageSquareHeart, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

export function NotificationBroadcast({
  businessId, primary,
}: { businessId: string; primary: string }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkPath, setLinkPath] = useState("/app/rewards");
  const [busy, setBusy] = useState(false);
  const [lastRecipients, setLastRecipients] = useState<number | null>(null);

  async function send() {
    if (!title.trim()) { toast.error("Add a title"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          title: title.trim(),
          body: body.trim() || null,
          link_path: linkPath || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "broadcast failed");
      setLastRecipients(json.recipients ?? 0);
      toast.success(`Sent to ${json.recipients} members ✨`);
      setTitle(""); setBody("");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not broadcast");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border bg-white p-5 lg:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquareHeart className="h-4 w-4 text-rose-500" />
        <h3 className="font-bold">Send to all members</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Drops an in-app notification (and a push notification, if they've opted in) to every enrolled member.
        Use for one-off things — holiday hours, surprise drops, manual offer announcements.
        Per-user notifications (streaks, reviews, automated offers) are sent automatically.
      </p>

      <div className="space-y-3">
        <div>
          <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Title</Label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Surprise drop — $5 off today only ✨"
            maxLength={80}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Message</Label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Anyone who scans before 6pm gets a bonus 100 pts. See you at the front desk."
            maxLength={240}
            rows={3}
            className="mt-1 w-full rounded-md border bg-white p-3 text-sm"
          />
          <div className="text-[10px] text-zinc-400 mt-1 text-right">{body.length}/240</div>
        </div>
        <div>
          <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Open to</Label>
          <select
            value={linkPath}
            onChange={e => setLinkPath(e.target.value)}
            className="mt-1 w-full h-10 rounded-md border bg-white px-3 text-sm"
          >
            <option value="/app">Home</option>
            <option value="/app/rewards">Rewards</option>
            <option value="/app/scan">Scan</option>
            <option value="/app/profile">Profile</option>
          </select>
        </div>

        <Button
          onClick={send}
          disabled={busy || !title.trim()}
          className="w-full mt-2 text-white"
          style={{ background: primary }}
        >
          {busy
            ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending…</>
            : <><Send className="h-4 w-4 mr-1.5" /> Send to everyone</>}
        </Button>

        {lastRecipients !== null && (
          <div className="text-xs text-emerald-700 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Last send: {lastRecipients} members reached
          </div>
        )}
      </div>
    </div>
  );
}
