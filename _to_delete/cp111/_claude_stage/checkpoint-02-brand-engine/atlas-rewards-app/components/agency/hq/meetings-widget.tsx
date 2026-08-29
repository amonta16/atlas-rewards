"use client";
/**
 * meetings-widget.tsx — CP-111
 *
 * High-priority founder meetings on the Headquarters page. The next
 * meeting is emphasized (countdown + Join button); the rest stay one
 * glance away. Completed/cancelled meetings collapse into a history
 * section with one-click recording links — no embedded Drive UI.
 */
import { useMemo, useState } from "react";
import {
  CalendarClock, Video, Plus, Pencil, Check, XCircle, Trash2, Loader2,
  ExternalLink, Film, FolderOpen, Users, AlertTriangle, ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import type { FounderMeeting, AgencyAdminLite } from "@/lib/types/database";
import {
  dateLabel, timeLabel, countdownLabel, daysUntil, isValidHttpUrl, isValidIsoDate, isValidTime,
} from "@/lib/founder-hq";
import { GlassPanel, Chip, HqButton, HqModal, Field, EmptyState, fieldCls, areaCls, selectCls } from "./hq-ui";
import { insertRow, guardedUpdate, deleteRow, reloadRows } from "./hq-data";

const ORDER = [{ column: "meeting_date", ascending: true }, { column: "start_time", ascending: true }];

function sortMeetings(rows: FounderMeeting[]): FounderMeeting[] {
  return [...rows].sort((a, b) =>
    (a.meeting_date + (a.start_time ?? "")).localeCompare(b.meeting_date + (b.start_time ?? "")));
}

export function MeetingsWidget({
  initial, admins, recordingsUrl: initialRecordingsUrl, todayIso, onRows,
}: {
  initial: FounderMeeting[];
  admins: AgencyAdminLite[];
  recordingsUrl: string | null;
  todayIso: string;
  onRows?: (rows: FounderMeeting[]) => void;
}) {
  const { toast } = useToast();
  const [meetings, setMeetingsRaw] = useState<FounderMeeting[]>(sortMeetings(initial));
  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; meeting: FounderMeeting } | null>(null);
  const [deleting, setDeleting] = useState<FounderMeeting | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [recordingsUrl, setRecordingsUrl] = useState(initialRecordingsUrl);
  const [editingLibrary, setEditingLibrary] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function setMeetings(rows: FounderMeeting[]) {
    const sorted = sortMeetings(rows);
    setMeetingsRaw(sorted);
    onRows?.(sorted);
  }

  async function reload() {
    const rows = await reloadRows<FounderMeeting>("founder_meetings", ORDER);
    if (rows) setMeetings(rows);
  }

  const upcoming = useMemo(
    () => meetings.filter(m => m.status === "upcoming"),
    [meetings]);
  const next = upcoming[0] ?? null;
  const rest = upcoming.slice(1);
  const history = useMemo(
    () => [...meetings.filter(m => m.status !== "upcoming")]
      .sort((a, b) => (b.meeting_date + (b.start_time ?? "")).localeCompare(a.meeting_date + (a.start_time ?? ""))),
    [meetings]);

  async function setStatus(m: FounderMeeting, status: FounderMeeting["status"]) {
    setBusyId(m.id);
    const res = await guardedUpdate<FounderMeeting>("founder_meetings", m.id, m.updated_at, { status });
    setBusyId(null);
    if (res.error !== undefined) { toast.error("Couldn't update — " + res.error); return; }
    if (res.conflict) { toast.info("This meeting was changed by someone else — refreshed."); reload(); return; }
    setMeetings(meetings.map(x => (x.id === m.id ? res.row : x)));
    toast.success(status === "completed" ? "Meeting completed" : status === "cancelled" ? "Meeting cancelled" : "Meeting reopened");
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await deleteRow("founder_meetings", deleting.id);
    if (res.error !== undefined) { toast.error("Delete failed — " + res.error); return; }
    setMeetings(meetings.filter(x => x.id !== deleting.id));
    setDeleting(null);
    toast.success("Meeting deleted");
  }

  return (
    <GlassPanel
      id="hq-meetings"
      title="High-Priority Meetings"
      subtitle="Founder syncs, investor calls, partner demos."
      icon={<CalendarClock className="h-4 w-4" />}
      right={
        <>
          <RecordingsLibraryButton
            url={recordingsUrl}
            onEdit={() => setEditingLibrary(true)}
          />
          <HqButton onClick={() => setEditor({ mode: "create" })}>
            <Plus className="h-4 w-4" /> New meeting
          </HqButton>
        </>
      }
    >
      {upcoming.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-4 w-4" />}
          title="No upcoming meetings"
          hint="Schedule the next founder sync so everyone shows up prepared."
          action={<HqButton kind="outline" onClick={() => setEditor({ mode: "create" })}><Plus className="h-4 w-4" /> Schedule one</HqButton>}
        />
      ) : (
        <div className="space-y-2.5">
          {/* The next meeting — emphasized */}
          {next && (
            <div className="relative rounded-xl p-4 overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(56,189,248,0.14), rgba(56,189,248,0.04))",
                border: "1px solid rgba(56,189,248,0.35)",
              }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Chip tone="sky">{countdownLabel(next.meeting_date, todayIso)}</Chip>
                    {next.priority === "high" && <Chip tone="amber"><AlertTriangle className="h-3 w-3" /> High priority</Chip>}
                  </div>
                  <h3 className="text-lg font-extrabold text-white mt-1.5 leading-tight">{next.title}</h3>
                  <div className="text-[13px] text-sky-200/70 mt-0.5 tabular-nums">
                    {dateLabel(next.meeting_date)} · {timeLabel(next.start_time)}
                    {next.end_time ? `–${timeLabel(next.end_time)}` : ""}
                  </div>
                  {next.participants.length > 0 && (
                    <div className="text-[12px] text-sky-200/50 mt-1 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 shrink-0" /> {next.participants.join(", ")}
                    </div>
                  )}
                  {next.agenda && (
                    <p className="text-[12px] text-sky-200/60 mt-2 whitespace-pre-wrap max-w-xl">{next.agenda}</p>
                  )}
                </div>
                <div className="flex flex-col items-stretch gap-1.5 shrink-0">
                  {next.meeting_url && isValidHttpUrl(next.meeting_url) && (
                    <a href={next.meeting_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg h-10 px-4 text-sm font-bold bg-sky-400 text-slate-900 hover:bg-sky-300 transition-colors shadow-[0_0_20px_-6px_rgba(56,189,248,0.9)]">
                      <Video className="h-4 w-4" /> Join meeting
                    </a>
                  )}
                  <MeetingRowActions m={next} busy={busyId === next.id}
                    onEdit={() => setEditor({ mode: "edit", meeting: next })}
                    onComplete={() => setStatus(next, "completed")}
                    onCancel={() => setStatus(next, "cancelled")}
                    onDelete={() => setDeleting(next)} />
                </div>
              </div>
            </div>
          )}

          {/* The rest of the upcoming list */}
          {rest.map(m => (
            <div key={m.id} className="rounded-xl px-3.5 py-3 flex flex-wrap items-center gap-3"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="w-24 shrink-0 text-center rounded-lg py-1.5 border border-white/10 bg-white/5">
                <div className="text-[10px] uppercase tracking-widest text-sky-200/50">{countdownLabel(m.meeting_date, todayIso)}</div>
                <div className="text-[12px] font-bold text-white tabular-nums">{dateLabel(m.meeting_date, { weekday: undefined })}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white text-sm truncate">{m.title}</span>
                  {m.priority === "high" && <Chip tone="amber">High</Chip>}
                </div>
                <div className="text-[12px] text-sky-200/50 tabular-nums">
                  {timeLabel(m.start_time)}{m.end_time ? `–${timeLabel(m.end_time)}` : ""}
                  {m.participants.length > 0 && <> · {m.participants.join(", ")}</>}
                </div>
              </div>
              {m.meeting_url && isValidHttpUrl(m.meeting_url) && (
                <a href={m.meeting_url} target="_blank" rel="noopener noreferrer" title="Join meeting" aria-label={`Join ${m.title}`}
                  className="h-8 w-8 rounded-lg bg-sky-400/15 border border-sky-400/25 hover:bg-sky-400/25 flex items-center justify-center text-sky-300">
                  <Video className="h-4 w-4" />
                </a>
              )}
              <MeetingRowActions m={m} busy={busyId === m.id}
                onEdit={() => setEditor({ mode: "edit", meeting: m })}
                onComplete={() => setStatus(m, "completed")}
                onCancel={() => setStatus(m, "cancelled")}
                onDelete={() => setDeleting(m)} />
            </div>
          ))}
        </div>
      )}

      {/* Meeting history */}
      {history.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowHistory(s => !s)}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-sky-200/60 hover:text-white transition-colors">
            <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (showHistory ? "rotate-180" : "")} />
            Meeting history ({history.length})
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {history.map(m => (
                <div key={m.id} className="rounded-lg px-3 py-2 flex flex-wrap items-center gap-2.5"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <span className="text-[12px] text-sky-200/40 tabular-nums w-24 shrink-0">{dateLabel(m.meeting_date)}</span>
                  <span className={"text-sm truncate flex-1 " + (m.status === "cancelled" ? "text-sky-200/35 line-through" : "text-sky-100/80")}>
                    {m.title}
                  </span>
                  <Chip tone={m.status === "completed" ? "emerald" : "slate"}>
                    {m.status === "completed" ? "Completed" : "Cancelled"}
                  </Chip>
                  {m.recording_url && isValidHttpUrl(m.recording_url) && (
                    <a href={m.recording_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-sky-300 hover:text-sky-200">
                      <Film className="h-3.5 w-3.5" /> Recording
                    </a>
                  )}
                  <button onClick={() => setEditor({ mode: "edit", meeting: m })} aria-label={`Edit ${m.title}`}
                    className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDeleting(m)} aria-label={`Delete ${m.title}`}
                    className="h-7 w-7 rounded-md bg-white/5 hover:bg-rose-500/15 flex items-center justify-center text-sky-200/60 hover:text-rose-300">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editor && (
        <MeetingEditor
          admins={admins}
          meeting={editor.mode === "edit" ? editor.meeting : null}
          onClose={() => setEditor(null)}
          onSaved={row => {
            setEditor(null);
            setMeetings(editor.mode === "edit"
              ? meetings.map(x => (x.id === row.id ? row : x))
              : [...meetings, row]);
          }}
          onConflict={() => { setEditor(null); reload(); }}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Delete this meeting?"
          description={`“${deleting.title}” will be permanently removed, including its notes and recording link.`}
          destructiveLabel="Delete meeting"
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}

      {editingLibrary && (
        <RecordingsLibraryEditor
          current={recordingsUrl}
          onClose={() => setEditingLibrary(false)}
          onSaved={url => { setRecordingsUrl(url); setEditingLibrary(false); }}
        />
      )}
    </GlassPanel>
  );
}

/* ────────────────────────── Row actions ─────────────────────────── */

function MeetingRowActions({ m, busy, onEdit, onComplete, onCancel, onDelete }: {
  m: FounderMeeting; busy: boolean;
  onEdit: () => void; onComplete: () => void; onCancel: () => void; onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-300" />}
      <button onClick={onEdit} title="Edit" aria-label={`Edit ${m.title}`}
        className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60 hover:text-white">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {m.status === "upcoming" && (
        <>
          <button onClick={onComplete} title="Mark completed" aria-label={`Complete ${m.title}`}
            className="h-8 w-8 rounded-lg bg-white/5 hover:bg-emerald-500/15 flex items-center justify-center text-sky-200/60 hover:text-emerald-300">
            <Check className="h-4 w-4" />
          </button>
          <button onClick={onCancel} title="Cancel meeting" aria-label={`Cancel ${m.title}`}
            className="h-8 w-8 rounded-lg bg-white/5 hover:bg-amber-500/15 flex items-center justify-center text-sky-200/60 hover:text-amber-300">
            <XCircle className="h-4 w-4" />
          </button>
        </>
      )}
      <button onClick={onDelete} title="Delete" aria-label={`Delete ${m.title}`}
        className="h-8 w-8 rounded-lg bg-white/5 hover:bg-rose-500/15 flex items-center justify-center text-sky-200/60 hover:text-rose-300">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ─────────────────────── Recordings library ─────────────────────── */

function RecordingsLibraryButton({ url, onEdit }: { url: string | null; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-1">
      {url && isValidHttpUrl(url) ? (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg h-9 px-3 text-sm border border-sky-400/30 text-sky-100 hover:bg-sky-400/10 transition-colors">
          <FolderOpen className="h-4 w-4" /> Recordings library
          <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      ) : (
        <span className="text-[12px] text-sky-200/40 px-1">No recordings folder set</span>
      )}
      <button onClick={onEdit} title="Change recordings folder link" aria-label="Change recordings folder link"
        className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60 hover:text-white">
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function RecordingsLibraryEditor({ current, onClose, onSaved }: {
  current: string | null; onClose: () => void; onSaved: (url: string | null) => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const trimmed = value.trim();
    if (trimmed && !isValidHttpUrl(trimmed)) { toast.error("That doesn't look like a valid link (must start with https://)"); return; }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("agency_settings")
      .update({ recordings_folder_url: trimmed || null }).eq("id", 1);
    setBusy(false);
    if (error) { toast.error("Couldn't save — " + error.message); return; }
    toast.success("Recordings folder updated");
    onSaved(trimmed || null);
  }

  return (
    <HqModal title="Recordings library link" subtitle="Where meeting recordings live (e.g. a Google Drive folder). Stored once in agency settings." onClose={onClose}>
      <div className="space-y-4">
        <Field label="Folder URL" hint="Leave empty to hide the button.">
          <input className={fieldCls} value={value} onChange={e => setValue(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/…" />
        </Field>
        <div className="flex justify-end gap-2">
          <HqButton kind="ghost" onClick={onClose}>Cancel</HqButton>
          <HqButton onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save link"}
          </HqButton>
        </div>
      </div>
    </HqModal>
  );
}

/* ───────────────────────── Meeting editor ───────────────────────── */

function MeetingEditor({ admins, meeting, onClose, onSaved, onConflict }: {
  admins: AgencyAdminLite[];
  meeting: FounderMeeting | null;
  onClose: () => void;
  onSaved: (row: FounderMeeting) => void;
  onConflict: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [date, setDate] = useState(meeting?.meeting_date ?? "");
  const [start, setStart] = useState(meeting?.start_time?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(meeting?.end_time?.slice(0, 5) ?? "");
  const [url, setUrl] = useState(meeting?.meeting_url ?? "");
  const [recording, setRecording] = useState(meeting?.recording_url ?? "");
  const [participants, setParticipants] = useState<string[]>(meeting?.participants ?? []);
  const [freeName, setFreeName] = useState("");
  const [agenda, setAgenda] = useState(meeting?.agenda ?? "");
  const [priority, setPriority] = useState<FounderMeeting["priority"]>(meeting?.priority ?? "normal");
  const [status, setStatus] = useState<FounderMeeting["status"]>(meeting?.status ?? "upcoming");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function addParticipant(name: string) {
    const n = name.trim();
    if (!n || participants.includes(n)) return;
    setParticipants([...participants, n]);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Give the meeting a title.";
    if (!isValidIsoDate(date)) e.date = "Pick a date.";
    if (!isValidTime(start)) e.start = "Pick a start time.";
    if (end && !isValidTime(end)) e.end = "End time looks wrong.";
    if (end && isValidTime(end) && isValidTime(start) && end <= start) e.end = "End must be after the start.";
    if (url.trim() && !isValidHttpUrl(url)) e.url = "Meeting link must be a valid https:// URL.";
    if (recording.trim() && !isValidHttpUrl(recording)) e.recording = "Recording link must be a valid https:// URL.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (busy || !validate()) return;
    setBusy(true);
    const values = {
      title: title.trim(),
      meeting_date: date,
      start_time: start,
      end_time: end || null,
      meeting_url: url.trim() || null,
      recording_url: recording.trim() || null,
      participants,
      agenda: agenda.trim() || null,
      priority,
      status,
    };
    const res = meeting
      ? await guardedUpdate<FounderMeeting>("founder_meetings", meeting.id, meeting.updated_at, values)
      : await insertRow<FounderMeeting>("founder_meetings", values);
    setBusy(false);
    if (res.error !== undefined) { toast.error("Couldn't save — " + res.error); return; }
    if (res.conflict) { toast.info("Someone else edited this meeting — refreshed with their version."); onConflict(); return; }
    toast.success(meeting ? "Meeting updated" : "Meeting scheduled");
    onSaved(res.row);
  }

  return (
    <HqModal wide title={meeting ? "Edit meeting" : "Schedule a meeting"} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label="Title" required error={errors.title}>
          <input className={fieldCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Weekly founder sync" autoFocus />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Date" required error={errors.date}>
            <input type="date" className={fieldCls} value={date} onChange={e => setDate(e.target.value)} />
          </Field>
          <Field label="Start" required error={errors.start}>
            <input type="time" className={fieldCls} value={start} onChange={e => setStart(e.target.value)} />
          </Field>
          <Field label="End (optional)" error={errors.end}>
            <input type="time" className={fieldCls} value={end} onChange={e => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Meeting link" hint="Google Meet, Zoom… opens in a new tab from the Join button." error={errors.url}>
          <input className={fieldCls} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://meet.google.com/…" inputMode="url" />
        </Field>
        <Field label="Participants">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {participants.map(p => (
              <span key={p} className="inline-flex items-center gap-1 rounded-full bg-sky-400/12 border border-sky-400/25 text-sky-100 text-[12px] font-semibold px-2.5 py-1">
                {p}
                <button onClick={() => setParticipants(participants.filter(x => x !== p))} aria-label={`Remove ${p}`} className="text-sky-200/60 hover:text-white">×</button>
              </span>
            ))}
            {participants.length === 0 && <span className="text-[12px] text-sky-200/35">No one added yet.</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {admins
              .map(a => (a.full_name || a.email || "").trim())
              .filter(n => n && !participants.includes(n))
              .map(n => (
                <button key={n} onClick={() => addParticipant(n)}
                  className="rounded-full border border-white/12 bg-white/5 hover:bg-white/10 text-sky-100/80 text-[12px] px-2.5 py-1">
                  + {n}
                </button>
              ))}
            <span className="inline-flex items-center gap-1">
              <input className={fieldCls + " !h-8 !w-36 text-[12px]"} value={freeName} placeholder="Other name…"
                onChange={e => setFreeName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addParticipant(freeName); setFreeName(""); } }} />
              <HqButton kind="ghost" className="h-8 px-2 text-[12px]" onClick={() => { addParticipant(freeName); setFreeName(""); }}>Add</HqButton>
            </span>
          </div>
        </Field>
        <Field label="Agenda / notes">
          <textarea className={areaCls} value={agenda} onChange={e => setAgenda(e.target.value)} placeholder="What are we deciding in this meeting?" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Priority">
            <select className={selectCls} value={priority} onChange={e => setPriority(e.target.value as FounderMeeting["priority"])}>
              <option value="normal">Normal</option>
              <option value="high">High priority</option>
            </select>
          </Field>
          <Field label="Status">
            <select className={selectCls} value={status} onChange={e => setStatus(e.target.value as FounderMeeting["status"])}>
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
          <Field label="Recording link" error={errors.recording}>
            <input className={fieldCls} value={recording} onChange={e => setRecording(e.target.value)} placeholder="https://drive.google.com/…" inputMode="url" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <HqButton kind="ghost" onClick={onClose}>Cancel</HqButton>
          <HqButton onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : meeting ? "Save changes" : "Schedule meeting"}
          </HqButton>
        </div>
      </div>
    </HqModal>
  );
}
