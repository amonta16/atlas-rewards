"use client";
/**
 * CampaignsStudio — CP-160 · manager tab for email + in-app campaigns
 *
 * UNDER CONSTRUCTION: the whole surface is here so managers can see what's
 * coming and start thinking in campaigns — audience, template, message,
 * schedule — but nothing is sent yet. Every action ends in the "coming soon"
 * sheet. Wiring plan (next checkpoint): campaigns table + audience RPCs
 * (the same segments Insights already computes), Resend for email, the
 * existing notifications fan-out for in-app + push, per-campaign opens /
 * taps / redemptions.
 */
import { useMemo, useState } from "react";
import {
  Megaphone, Mail, Smartphone, Users, Sparkles, Cake, Clock, Crown, CalendarDays,
  Send, Eye, Hammer, ChevronRight, Check, Wand2, Image as ImageIcon, Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types/database";

type Channel = "email" | "app";
type Audience = { id: string; label: string; blurb: string; icon: React.ReactNode; est: string };
type Template = { id: string; name: string; blurb: string; icon: React.ReactNode; subject: string; body: string; cta: string };

const AUDIENCES: Audience[] = [
  { id: "all",      label: "Everyone",             blurb: "Every member with an email on file.",              icon: <Users className="h-4 w-4" />,        est: "all members" },
  { id: "lapsed",   label: "Haven't visited in 30d", blurb: "Win-back — the people you're about to lose.",     icon: <Clock className="h-4 w-4" />,        est: "auto-segmented" },
  { id: "close",    label: "Close to a reward",     blurb: "Within 25% of their next reward.",                 icon: <Gift className="h-4 w-4" />,         est: "auto-segmented" },
  { id: "birthday", label: "Birthdays this month",  blurb: "Everyone with a birthday in the next 30 days.",    icon: <Cake className="h-4 w-4" />,         est: "auto-segmented" },
  { id: "members",  label: "Paid members",          blurb: "Your VIPs — perks, early access, renewals.",       icon: <Crown className="h-4 w-4" />,        est: "auto-segmented" },
  { id: "bookers",  label: "Booked before",         blurb: "Anyone who has reserved a cage, room or lane.",    icon: <CalendarDays className="h-4 w-4" />, est: "auto-segmented" },
];

const TEMPLATES: Template[] = [
  { id: "weekend", name: "Weekend push",   blurb: "Fill slow hours with a time-boxed deal.",        icon: <Sparkles className="h-4 w-4" />,
    subject: "This weekend only: double points at {{business}}", body: "Come in Saturday or Sunday and every dollar earns 2× points. Show this at the counter — no code needed.", cta: "Book my spot" },
  { id: "winback", name: "We miss you",    blurb: "A gentle nudge + a reason to come back.",         icon: <Clock className="h-4 w-4" />,
    subject: "It's been a minute, {{first_name}} 👋", body: "Your {{points}} points are still here. Come back this week and we'll add a bonus spin on the prize wheel.", cta: "See my rewards" },
  { id: "event",   name: "Event / party",  blurb: "Announce a night, a league, a party special.",   icon: <CalendarDays className="h-4 w-4" />,
    subject: "You're invited: {{event_name}}", body: "Save the date — {{event_date}}. Members get first pick of party rooms and a free hour of cage time with any booking.", cta: "Reserve now" },
  { id: "member",  name: "Membership drive", blurb: "Sell the plan to your best non-members.",      icon: <Crown className="h-4 w-4" />,
    subject: "{{first_name}}, you'd already be ahead as a member", body: "Based on your visits, the {{membership_name}} would have saved you money last month. Join today and your first month includes a free party-room hour.", cta: "Join now" },
];

export function CampaignsStudio({ business }: { business: Business }) {
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;
  const [channel, setChannel] = useState<Channel>("email");
  const [audience, setAudience] = useState<string>("all");
  const [template, setTemplate] = useState<Template | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("Open the app");
  const [sheet, setSheet] = useState<null | "send" | "test" | "schedule">(null);

  const aud = useMemo(() => AUDIENCES.find(a => a.id === audience)!, [audience]);
  const fill = (t: string) => t
    .replace(/\{\{business\}\}/g, business.name)
    .replace(/\{\{first_name\}\}/g, "Alex")
    .replace(/\{\{points\}\}/g, "1,240")
    .replace(/\{\{membership_name\}\}/g, "VIP membership")
    .replace(/\{\{event_name\}\}/g, "Friday Night Lights")
    .replace(/\{\{event_date\}\}/g, "Fri, Oct 10 · 7pm");

  function pick(t: Template) {
    setTemplate(t); setSubject(t.subject); setBody(t.body); setCta(t.cta);
  }

  return (
    <div className="space-y-5">
      {/* Header + construction banner */}
      <div className="rounded-3xl p-5 text-white relative overflow-hidden shadow-xl"
        style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}>
        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-white/15 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0"><Megaphone className="h-6 w-6" /></div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-extrabold leading-tight">Campaigns</h2>
            <p className="text-sm text-white/85 mt-1 max-w-xl">
              Email your members, or drop it straight into their app as a notification. Every member already has an account,
              so a campaign lands in the same place their points do — no unsubscribes to a stranger&apos;s inbox.
            </p>
          </div>
        </div>
        <div className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-amber-300 text-zinc-900 px-3 h-8 text-[11px] font-black uppercase tracking-wider">
          <Hammer className="h-3.5 w-3.5" /> Under construction — design preview, nothing sends yet
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
        {/* ── Composer ── */}
        <div className="space-y-4 min-w-0">
          {/* 1 · Channel */}
          <Section n={1} title="Where it goes">
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "email", label: "Email", blurb: "Full layout, photo, button. Best for promos.", icon: <Mail className="h-4 w-4" /> },
                { id: "app",   label: "In-app + push", blurb: "Short, instant. Best for tonight-only deals.", icon: <Smartphone className="h-4 w-4" /> },
              ] as { id: Channel; label: string; blurb: string; icon: React.ReactNode }[]).map(c => {
                const on = channel === c.id;
                return (
                  <button key={c.id} type="button" onClick={() => setChannel(c.id)}
                    className={cn("rounded-2xl border p-3 text-left transition", on ? "text-white border-transparent shadow-md" : "bg-white hover:bg-zinc-50")}
                    style={on ? { background: primary } : undefined}>
                    <div className="flex items-center gap-2 font-bold text-sm">{c.icon}{c.label}{on && <Check className="h-3.5 w-3.5 ml-auto" />}</div>
                    <div className={cn("text-[11px] mt-1", on ? "text-white/85" : "text-zinc-500")}>{c.blurb}</div>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* 2 · Audience */}
          <Section n={2} title="Who gets it" sub="Segments come straight from your Insights data — no lists to upload.">
            <div className="grid sm:grid-cols-2 gap-2">
              {AUDIENCES.map(a => {
                const on = audience === a.id;
                return (
                  <button key={a.id} type="button" onClick={() => setAudience(a.id)}
                    className={cn("rounded-2xl border p-3 text-left flex items-start gap-3 transition", on ? "border-transparent ring-2" : "bg-white hover:bg-zinc-50")}
                    style={on ? { background: `${primary}0f`, ["--tw-ring-color" as any]: primary } : undefined}>
                    <span className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ background: on ? primary : "#a1a1aa" }}>{a.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{a.label}</span>
                      <span className="block text-[11px] text-zinc-500 leading-snug">{a.blurb}</span>
                      <span className="block text-[10px] font-semibold mt-1" style={{ color: primary }}>{a.est}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* 3 · Template */}
          <Section n={3} title="Start from a template" sub="Pick one, then make it yours. {{first_name}}, {{points}} and {{business}} fill in per member.">
            <div className="grid sm:grid-cols-2 gap-2">
              {TEMPLATES.map(t => {
                const on = template?.id === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => pick(t)}
                    className={cn("rounded-2xl border p-3 text-left flex items-center gap-3 transition", on ? "border-transparent ring-2" : "bg-white hover:bg-zinc-50")}
                    style={on ? { background: `${primary}0f`, ["--tw-ring-color" as any]: primary } : undefined}>
                    <span className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${primary}14`, color: primary }}>{t.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{t.name}</span>
                      <span className="block text-[11px] text-zinc-500 leading-snug">{t.blurb}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          </Section>

          {/* 4 · Message */}
          <Section n={4} title="Your message">
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{channel === "email" ? "Subject line" : "Notification title"}</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder={channel === "email" ? "This weekend only…" : "Tonight: double points"} className="mt-1 font-semibold" maxLength={channel === "email" ? 90 : 50} />
              </div>
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Body</Label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={channel === "email" ? 5 : 3}
                  placeholder="What's the offer, when does it end, what should they do?"
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2" style={{ ["--tw-ring-color" as any]: primary }} />
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-500">
                  <Wand2 className="h-3.5 w-3.5" /> Atlas can draft this from your offer + audience (coming with sending).
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Button text</Label>
                  <Input value={cta} onChange={e => setCta(e.target.value)} className="mt-1" maxLength={30} />
                </div>
                {channel === "email" && (
                  <div>
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Hero photo</Label>
                    <div className="mt-1 h-10 rounded-xl border border-dashed flex items-center justify-center gap-2 text-[12px] text-zinc-500 bg-zinc-50">
                      <ImageIcon className="h-4 w-4" /> Photo picker (coming soon)
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setSheet("test")} variant="outline" className="h-11 rounded-xl"><Eye className="h-4 w-4 mr-1.5" /> Send me a test</Button>
            <Button onClick={() => setSheet("schedule")} variant="outline" className="h-11 rounded-xl"><Clock className="h-4 w-4 mr-1.5" /> Schedule</Button>
            <Button onClick={() => setSheet("send")} className="h-11 rounded-xl text-white ml-auto" style={{ background: primary }}><Send className="h-4 w-4 mr-1.5" /> Send to {aud.label.toLowerCase()}</Button>
          </div>
        </div>

        {/* ── Live preview ── */}
        <div className="lg:sticky lg:top-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2"><Eye className="h-3.5 w-3.5" /> Preview · {channel === "email" ? "email" : "phone"}</div>
          {channel === "email" ? (
            <div className="rounded-3xl border bg-white overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b bg-zinc-50 text-[11px]">
                <div className="text-zinc-500">From <b className="text-zinc-800">{business.name}</b> via Atlas</div>
                <div className="font-bold text-zinc-900 mt-0.5 truncate">{subject ? fill(subject) : "Your subject line"}</div>
              </div>
              <div className="h-36 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
                {business.logo_url
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={business.logo_url} alt="" className="h-16 w-16 rounded-2xl bg-white object-contain p-1.5 shadow-lg" />
                  : <Megaphone className="h-10 w-10 text-white/80" />}
              </div>
              <div className="p-5">
                <div className="text-lg font-extrabold leading-tight text-zinc-900">{subject ? fill(subject) : "Your headline"}</div>
                <p className="text-sm text-zinc-600 mt-2 leading-relaxed whitespace-pre-wrap">{body ? fill(body) : "Your message shows up here as you type."}</p>
                <span className="mt-4 inline-flex items-center justify-center rounded-xl px-4 h-10 text-sm font-bold text-white" style={{ background: primary }}>{cta || "Open the app"}</span>
                <div className="mt-5 pt-4 border-t text-[10px] text-zinc-400">You&apos;re getting this because you&apos;re a {business.name} member on Atlas. Manage preferences in the app.</div>
              </div>
            </div>
          ) : (
            <div className="rounded-[2rem] border-[6px] border-zinc-900 bg-zinc-100 p-3 shadow-xl max-w-[300px] mx-auto">
              <div className="text-center text-[10px] font-semibold text-zinc-400 mb-2">now</div>
              <div className="rounded-2xl bg-white/95 backdrop-blur p-3 shadow flex gap-3">
                {business.logo_url
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={business.logo_url} alt="" className="h-9 w-9 rounded-lg object-contain bg-white ring-1 ring-black/5" />
                  : <span className="h-9 w-9 rounded-lg" style={{ background: primary }} />}
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-zinc-900 truncate">{subject ? fill(subject) : business.name}</div>
                  <div className="text-[11px] text-zinc-600 line-clamp-3 leading-snug">{body ? fill(body) : "Your notification text."}</div>
                </div>
              </div>
              <div className="mt-24 h-1 w-24 mx-auto rounded-full bg-zinc-900" />
            </div>
          )}
          <div className="rounded-2xl border bg-white p-3 text-[11px] text-zinc-600 leading-snug">
            <b className="text-zinc-800">Results you&apos;ll see here:</b> delivered · opened · tapped · visits within 7 days · points redeemed — per campaign, so you know which ones paid for themselves.
          </div>
        </div>
      </div>

      {/* Coming-soon sheet */}
      {sheet && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setSheet(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="h-12 w-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center"><Hammer className="h-6 w-6" /></div>
            <h3 className="text-lg font-extrabold mt-3">
              {sheet === "send" ? "Sending is almost ready" : sheet === "test" ? "Test sends are almost ready" : "Scheduling is almost ready"}
            </h3>
            <p className="text-sm text-zinc-600 mt-1 leading-relaxed">
              This tab is a working preview so you can plan campaigns now. Delivery (email via Atlas, in-app + push through the
              notifications you already use), audience counts and results are the next checkpoint. Your draft stays here on this device.
            </p>
            <Button onClick={() => setSheet(null)} className="mt-4 w-full h-11 rounded-xl text-white" style={{ background: primary }}>Got it</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-start gap-3 mb-3">
        <span className="h-6 w-6 rounded-full bg-zinc-900 text-white text-[11px] font-black flex items-center justify-center shrink-0">{n}</span>
        <div>
          <div className="font-bold text-sm">{title}</div>
          {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}
