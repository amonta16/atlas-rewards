"use client";
/**
 * headquarters-client.tsx — CP-111
 *
 * The Founder Headquarters — the operational command center. Answers,
 * top to bottom: what needs attention today, when we're going out to
 * sell, what we committed to, and whether we're moving toward revenue.
 *
 * All numbers in the "This Week" strip are computed from live data the
 * server fetched (and kept fresh as widgets edit their rows) — nothing
 * is fabricated.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock, Route, PhoneOutgoing, ListChecks, TrendingUp, Hourglass,
} from "lucide-react";
import type {
  FounderMeeting, FieldSalesEvent, FounderActionItem, SalesActivityDay, AgencyAdminLite,
} from "@/lib/types/database";
import { dollars, timeLabel, countdownLabel, dateLabel } from "@/lib/founder-hq";
import { HQ } from "./hq-ui";
import { MeetingsWidget } from "./meetings-widget";
import { SalesCalendar } from "./sales-calendar";
import { ActionItems } from "./action-items";
import { SalesActivity } from "./sales-activity";

export function HeadquartersClient({
  friendlyName, todayIso, admins, recordingsUrl,
  initialMeetings, initialEvents, initialItems, initialActivity,
  liveMrrCents, weightedPipelineCents, followupsDue,
}: {
  friendlyName: string;
  todayIso: string;
  admins: AgencyAdminLite[];
  recordingsUrl: string | null;
  initialMeetings: FounderMeeting[];
  initialEvents: FieldSalesEvent[];
  initialItems: FounderActionItem[];
  initialActivity: SalesActivityDay[];
  liveMrrCents: number;
  weightedPipelineCents: number;
  followupsDue: number;
}) {
  // Live copies so the This-Week strip updates as widgets edit rows.
  const [meetings, setMeetings] = useState(initialMeetings);
  const [events, setEvents] = useState(initialEvents);
  const [items, setItems] = useState(initialItems);

  const nextMeeting = useMemo(() => {
    const upcoming = meetings
      .filter(m => m.status === "upcoming" && m.meeting_date >= todayIso)
      .sort((a, b) => (a.meeting_date + a.start_time).localeCompare(b.meeting_date + b.start_time));
    return upcoming.find(m => m.priority === "high") ?? upcoming[0] ?? null;
  }, [meetings, todayIso]);

  const nextSalesDay = useMemo(() =>
    events
      .filter(e => e.status === "planned" && e.event_date >= todayIso)
      .sort((a, b) => (a.event_date + (a.start_time ?? "")).localeCompare(b.event_date + (b.start_time ?? "")))[0] ?? null,
    [events, todayIso]);

  const openItems = useMemo(() => items.filter(i => i.status !== "completed"), [items]);
  const overdueItems = useMemo(
    () => openItems.filter(i => (i.due_date && i.due_date < todayIso) || i.status === "blocked"),
    [openItems, todayIso]);

  return (
    <div className="min-h-screen" style={{ background: HQ.canvas }}>
      {/* Header */}
      <header className="relative px-4 sm:px-8 pt-10 pb-6 overflow-hidden">
        <div className="pointer-events-none absolute -top-24 right-10 h-64 w-64 rounded-full blur-3xl opacity-25"
          style={{ background: "#22d3ee" }} />
        <div className="pointer-events-none absolute -top-10 -left-10 h-48 w-48 rounded-full blur-3xl opacity-20"
          style={{ background: "#1d6fa5" }} />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-[0.3em] font-extrabold text-sky-300/70">Atlas Engine · Headquarters</div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mt-1 drop-shadow">
            Welcome to HQ, {friendlyName}
          </h1>
          <p className="text-sm text-sky-200/60 mt-1">
            Priorities, sales days, commitments — and how close we are to revenue.
          </p>
        </div>

        {/* This Week overview strip */}
        <div className="relative mt-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          <StripCard
            href="#hq-meetings"
            icon={<CalendarClock className="h-4 w-4" />}
            label="Next meeting"
            value={nextMeeting ? countdownLabel(nextMeeting.meeting_date, todayIso) : "None set"}
            sub={nextMeeting
              ? `${nextMeeting.title} · ${timeLabel(nextMeeting.start_time)}`
              : "Schedule the next sync"}
            highlight={!!nextMeeting && nextMeeting.priority === "high"}
          />
          <StripCard
            href="#hq-calendar"
            icon={<Route className="h-4 w-4" />}
            label="Next sales day"
            value={nextSalesDay ? countdownLabel(nextSalesDay.event_date, todayIso) : "Not planned"}
            sub={nextSalesDay
              ? `${nextSalesDay.city} · ${dateLabel(nextSalesDay.event_date, { weekday: undefined })}`
              : "Pick a date on the calendar"}
          />
          <StripCard
            href="/agency/analytics"
            icon={<PhoneOutgoing className="h-4 w-4" />}
            label="Follow-ups due"
            value={String(followupsDue)}
            sub={followupsDue > 0 ? "Open opportunities waiting" : "All caught up"}
            warn={followupsDue > 0}
          />
          <StripCard
            href="#hq-goals"
            icon={<ListChecks className="h-4 w-4" />}
            label="Action items"
            value={`${openItems.length} open`}
            sub={overdueItems.length > 0 ? `${overdueItems.length} overdue / blocked` : "Nothing overdue"}
            warn={overdueItems.length > 0}
          />
          <StripCard
            href="/agency/analytics"
            icon={<TrendingUp className="h-4 w-4" />}
            label="Live MRR"
            value={dollars(liveMrrCents)}
            sub="Active paying clients"
          />
          <StripCard
            href="/agency/analytics"
            icon={<Hourglass className="h-4 w-4" />}
            label="Pipeline MRR"
            value={dollars(weightedPipelineCents)}
            sub="Probability-weighted"
          />
        </div>
      </header>

      {/* Widgets */}
      <div className="px-4 sm:px-8 pb-12 space-y-5">
        <div className="grid xl:grid-cols-5 gap-5 items-start">
          <div className="xl:col-span-3">
            <MeetingsWidget
              initial={initialMeetings}
              admins={admins}
              recordingsUrl={recordingsUrl}
              todayIso={todayIso}
              onRows={setMeetings}
            />
          </div>
          <div className="xl:col-span-2">
            <ActionItems
              initial={initialItems}
              admins={admins}
              meetings={meetings}
              todayIso={todayIso}
              onRows={setItems}
            />
          </div>
        </div>
        <SalesCalendar
          initial={initialEvents}
          admins={admins}
          todayIso={todayIso}
          onRows={setEvents}
        />
        <SalesActivity
          initial={initialActivity}
          todayIso={todayIso}
        />
      </div>
    </div>
  );
}

/* ─────────────────────── Overview strip card ────────────────────── */

function StripCard({ href, icon, label, value, sub, warn, highlight }: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
  highlight?: boolean;
}) {
  const inner = (
    <div
      className="relative rounded-xl px-3.5 py-3 h-full overflow-hidden transition-transform hover:-translate-y-0.5 focus-visible:outline-none"
      style={{
        background: warn
          ? "linear-gradient(180deg, rgba(251,191,36,0.10), rgba(255,255,255,0.02))"
          : "linear-gradient(180deg, rgba(56,189,248,0.08), rgba(255,255,255,0.02))",
        border: warn
          ? "1px solid rgba(251,191,36,0.30)"
          : highlight
            ? "1px solid rgba(56,189,248,0.45)"
            : "1px solid rgba(56,189,248,0.16)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className={warn ? "text-amber-300" : "text-sky-300/80"}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-sky-200/60">{label}</span>
      </div>
      <div className="mt-1.5 text-lg font-extrabold text-white tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-sky-200/50 mt-0.5 truncate">{sub}</div>}
    </div>
  );

  return href.startsWith("#") ? (
    <a href={href} className="block focus-visible:ring-2 focus-visible:ring-sky-400/50 rounded-xl" aria-label={label}>{inner}</a>
  ) : (
    <Link href={href} className="block focus-visible:ring-2 focus-visible:ring-sky-400/50 rounded-xl" aria-label={label}>{inner}</Link>
  );
}
