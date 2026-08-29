"use client";
/**
 * action-items.tsx — CP-111
 *
 * Shared goals + action items for the founding team. Built for the
 * "we said we'd do this in the meeting" loop: quick add, clear owners,
 * visible overdue/blocked work, and a recently-completed trail so wins
 * don't vanish the second they're checked off.
 */
import { useMemo, useState } from "react";
import {
  CheckCircle2, Circle, Plus, Pencil, Trash2, Loader2, Target, OctagonAlert, RotateCcw, Link2,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import type { FounderActionItem, FounderMeeting, AgencyAdminLite } from "@/lib/types/database";
import { dateLabel, isValidIsoDate } from "@/lib/founder-hq";
import { GlassPanel, Chip, HqButton, HqModal, Field, EmptyState, fieldCls, areaCls, selectCls } from "./hq-ui";
import { insertRow, guardedUpdate, deleteRow, reloadRows } from "./hq-data";

const ORDER = [{ column: "due_date", ascending: true }, { column: "created_at", ascending: false }];

const STATUS_LABEL: Record<FounderActionItem["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
};

function ownerDisplay(item: FounderActionItem, admins: AgencyAdminLite[]): string {
  if (item.owner_user_id) {
    const a = admins.find(x => x.user_id === item.owner_user_id);
    if (a) return a.full_name || a.email || "Unknown";
  }
  return item.owner_name || "Unassigned";
}

export function ActionItems({
  initial, admins, meetings, todayIso, onRows,
}: {
  initial: FounderActionItem[];
  admins: AgencyAdminLite[];
  meetings: FounderMeeting[];
  todayIso: string;
  onRows?: (rows: FounderActionItem[]) => void;
}) {
  const { toast } = useToast();
  const [items, setItemsRaw] = useState<FounderActionItem[]>(initial);
  const [editor, setEditor] = useState<{ mode: "create"; title?: string } | { mode: "edit"; item: FounderActionItem } | null>(null);
  const [deleting, setDeleting] = useState<FounderActionItem | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fOwner, setFOwner] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fDue, setFDue] = useState("");

  function setItems(rows: FounderActionItem[]) {
    setItemsRaw(rows);
    onRows?.(rows);
  }

  async function reload() {
    const rows = await reloadRows<FounderActionItem>("founder_action_items", ORDER);
    if (rows) setItems(rows);
  }

  const open = useMemo(() => items.filter(i => i.status !== "completed"), [items]);
  const overdue = useMemo(() => open.filter(i => i.due_date && i.due_date < todayIso), [open, todayIso]);
  const blocked = useMemo(() => open.filter(i => i.status === "blocked"), [open]);
  const recentlyDone = useMemo(
    () => items.filter(i => i.status === "completed")
      .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at))
      .slice(0, 10),
    [items]);
  const doneCount = items.length - open.length;

  const ownerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const i of items) names.add(ownerDisplay(i, admins));
    return Array.from(names).sort();
  }, [items, admins]);

  const visibleOpen = useMemo(() => {
    const weekEnd = todayIso.slice(0, 10);
    return open
      .filter(i => !fOwner || ownerDisplay(i, admins) === fOwner)
      .filter(i => !fStatus || i.status === fStatus)
      .filter(i => !fPriority || i.priority === fPriority)
      .filter(i => {
        if (fDue === "overdue") return !!i.due_date && i.due_date < weekEnd;
        if (fDue === "has_due") return !!i.due_date;
        if (fDue === "no_due") return !i.due_date;
        return true;
      })
      .sort((a, b) => {
        // Overdue first, then by due date (nulls last), then priority.
        const ad = a.due_date ?? "9999-12-31", bd = b.due_date ?? "9999-12-31";
        if (ad !== bd) return ad.localeCompare(bd);
        const pr = { high: 0, normal: 1, low: 2 } as const;
        return pr[a.priority] - pr[b.priority];
      });
  }, [open, fOwner, fStatus, fPriority, fDue, admins, todayIso]);

  async function quickAdd() {
    const title = quickTitle.trim();
    if (!title) { toast.error("Type what needs to get done first"); return; }
    if (quickBusy) return;
    setQuickBusy(true);
    const res = await insertRow<FounderActionItem>("founder_action_items", { title });
    setQuickBusy(false);
    if (res.error || !res.row) { toast.error("Couldn't add — " + (res.error ?? "unknown error")); return; }
    setQuickTitle("");
    setItems([res.row, ...items]);
    toast.success("Added to the board");
  }

  async function toggleComplete(item: FounderActionItem) {
    setBusyId(item.id);
    const completing = item.status !== "completed";
    const res = await guardedUpdate<FounderActionItem>("founder_action_items", item.id, item.updated_at, {
      status: completing ? "completed" : "in_progress",
      completed_at: completing ? new Date().toISOString() : null,
    });
    setBusyId(null);
    if (res.error !== undefined) { toast.error("Couldn't update — " + res.error); return; }
    if (res.conflict) { toast.info("This item changed under you — refreshed."); reload(); return; }
    setItems(items.map(x => (x.id === item.id ? res.row : x)));
    toast.success(completing ? "Nice — marked complete ✅" : "Reopened");
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await deleteRow("founder_action_items", deleting.id);
    if (res.error !== undefined) { toast.error("Delete failed — " + res.error); return; }
    setItems(items.filter(x => x.id !== deleting.id));
    setDeleting(null);
    toast.success("Item deleted");
  }

  const filtersActive = !!(fOwner || fStatus || fPriority || fDue);
  const total = items.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <GlassPanel
      id="hq-goals"
      title="Goals & Action Items"
      subtitle="What we committed to. Owners, due dates, and the blocked stuff — visible."
      icon={<Target className="h-4 w-4" />}
      right={
        <HqButton onClick={() => setEditor({ mode: "create" })}>
          <Plus className="h-4 w-4" /> New item
        </HqButton>
      }
    >
      {/* Progress summary */}
      <div className="rounded-xl px-3.5 py-3 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex-1 min-w-[160px]">
          <div className="flex items-center justify-between text-[11px] font-semibold text-sky-200/60 mb-1">
            <span>{doneCount} of {total || 0} done</span><span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg,#38bdf8,#34d399)" }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone="sky">{open.length} open</Chip>
          {overdue.length > 0 && <Chip tone="amber">{overdue.length} overdue</Chip>}
          {blocked.length > 0 && <Chip tone="amber"><OctagonAlert className="h-3 w-3" /> {blocked.length} blocked</Chip>}
        </div>
      </div>

      {/* Quick add */}
      <div className="flex gap-2 mb-3">
        <input
          className={fieldCls}
          value={quickTitle}
          onChange={e => setQuickTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") quickAdd(); }}
          placeholder="Add a task… (Enter to save, or use New item for details)"
          aria-label="Quick add a task"
        />
        <HqButton onClick={quickAdd} disabled={quickBusy} aria-label="Add task">
          {quickBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </HqButton>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fOwner} onChange={e => setFOwner(e.target.value)} aria-label="Filter by owner">
          <option value="">All owners</option>
          {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="blocked">Blocked</option>
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fPriority} onChange={e => setFPriority(e.target.value)} aria-label="Filter by priority">
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fDue} onChange={e => setFDue(e.target.value)} aria-label="Filter by due date">
          <option value="">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="has_due">Has a due date</option>
          <option value="no_due">No due date</option>
        </select>
        {filtersActive && (
          <HqButton kind="ghost" className="h-8 px-2 text-[12px]"
            onClick={() => { setFOwner(""); setFStatus(""); setFPriority(""); setFDue(""); }}>
            Clear
          </HqButton>
        )}
      </div>

      {/* Open items */}
      {visibleOpen.length === 0 ? (
        <EmptyState
          icon={<Target className="h-4 w-4" />}
          title={filtersActive ? "Nothing matches these filters" : "No open action items"}
          hint={filtersActive ? "Clear the filters to see everything." : "Add commitments from your next founder meeting so they don't evaporate."}
        />
      ) : (
        <ul className="space-y-1.5">
          {visibleOpen.map(item => {
            const isOverdue = !!item.due_date && item.due_date < todayIso;
            const meeting = item.meeting_id ? meetings.find(m => m.id === item.meeting_id) : null;
            return (
              <li key={item.id}
                className={"rounded-xl px-3 py-2.5 flex items-start gap-2.5 " +
                  (item.status === "blocked" ? "border border-amber-400/30 bg-amber-400/[0.05]" : "border border-white/8 bg-white/[0.03]")}>
                <button
                  onClick={() => toggleComplete(item)}
                  aria-label={`Mark “${item.title}” complete`}
                  className="mt-0.5 shrink-0 text-sky-200/50 hover:text-emerald-300 transition-colors"
                >
                  {busyId === item.id
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : <Circle className="h-5 w-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white leading-tight">{item.title}</span>
                    {item.priority === "high" && <Chip tone="amber">High</Chip>}
                    {item.priority === "low" && <Chip tone="slate">Low</Chip>}
                    {item.status === "blocked" && <Chip tone="amber"><OctagonAlert className="h-3 w-3" /> Blocked</Chip>}
                    {item.status === "in_progress" && <Chip tone="sky">In progress</Chip>}
                  </div>
                  <div className="text-[12px] text-sky-200/50 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{ownerDisplay(item, admins)}</span>
                    {item.due_date && (
                      <span className={"tabular-nums " + (isOverdue ? "text-amber-300 font-semibold" : "")}>
                        · due {dateLabel(item.due_date)}{isOverdue ? " (overdue)" : ""}
                      </span>
                    )}
                    {meeting && (
                      <span className="inline-flex items-center gap-1 text-sky-300/70">
                        <Link2 className="h-3 w-3" /> {meeting.title}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-[12px] text-sky-200/45 mt-1 line-clamp-2 whitespace-pre-wrap">{item.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditor({ mode: "edit", item })} aria-label={`Edit ${item.title}`}
                    className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDeleting(item)} aria-label={`Delete ${item.title}`}
                    className="h-7 w-7 rounded-md bg-white/5 hover:bg-rose-500/15 flex items-center justify-center text-sky-200/60 hover:text-rose-300">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Recently completed */}
      {recentlyDone.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-widest text-sky-200/50 mb-2">Recently completed</div>
          <ul className="space-y-1">
            {recentlyDone.map(item => (
              <li key={item.id} className="rounded-lg px-3 py-2 flex items-center gap-2.5 bg-white/[0.02] border border-white/6">
                <CheckCircle2 className="h-4 w-4 text-emerald-300/80 shrink-0" />
                <span className="text-[13px] text-sky-100/60 line-through truncate flex-1">{item.title}</span>
                <span className="text-[11px] text-sky-200/35 tabular-nums shrink-0">
                  {item.completed_at ? dateLabel(item.completed_at.slice(0, 10)) : ""}
                </span>
                <button onClick={() => toggleComplete(item)} aria-label={`Reopen ${item.title}`} title="Reopen"
                  className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/50 hover:text-white shrink-0">
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editor && (
        <ActionItemEditor
          admins={admins}
          meetings={meetings}
          item={editor.mode === "edit" ? editor.item : null}
          onClose={() => setEditor(null)}
          onSaved={row => {
            setEditor(null);
            setItems(editor.mode === "edit" ? items.map(x => (x.id === row.id ? row : x)) : [row, ...items]);
          }}
          onConflict={() => { setEditor(null); reload(); }}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Delete this item?"
          description={`“${deleting.title}” will be permanently removed.`}
          destructiveLabel="Delete item"
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </GlassPanel>
  );
}

/* ─────────────────────── Item editor modal ──────────────────────── */

function ActionItemEditor({ admins, meetings, item, onClose, onSaved, onConflict }: {
  admins: AgencyAdminLite[];
  meetings: FounderMeeting[];
  item: FounderActionItem | null;
  onClose: () => void;
  onSaved: (row: FounderActionItem) => void;
  onConflict: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [ownerId, setOwnerId] = useState(item?.owner_user_id ?? "");
  const [ownerName, setOwnerName] = useState(item?.owner_name ?? "");
  const [due, setDue] = useState(item?.due_date ?? "");
  const [priority, setPriority] = useState<FounderActionItem["priority"]>(item?.priority ?? "normal");
  const [status, setStatus] = useState<FounderActionItem["status"]>(item?.status ?? "not_started");
  const [meetingId, setMeetingId] = useState(item?.meeting_id ?? "");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const recentMeetings = useMemo(
    () => [...meetings].sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)).slice(0, 20),
    [meetings]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "What's the commitment?";
    if (due && !isValidIsoDate(due)) e.due = "Due date looks wrong.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (busy || !validate()) return;
    setBusy(true);
    const completing = status === "completed";
    const values = {
      title: title.trim(),
      description: description.trim() || null,
      owner_user_id: ownerId || null,
      owner_name: ownerId ? null : (ownerName.trim() || null),
      due_date: due || null,
      priority,
      status,
      meeting_id: meetingId || null,
      completed_at: completing ? (item?.completed_at ?? new Date().toISOString()) : null,
    };
    const res = item
      ? await guardedUpdate<FounderActionItem>("founder_action_items", item.id, item.updated_at, values)
      : await insertRow<FounderActionItem>("founder_action_items", values);
    setBusy(false);
    if (res.error !== undefined) { toast.error("Couldn't save — " + res.error); return; }
    if (res.conflict) { toast.info("Someone else edited this item — refreshed with their version."); onConflict(); return; }
    toast.success(item ? "Item updated" : "Item added");
    onSaved(res.row);
  }

  return (
    <HqModal wide title={item ? "Edit action item" : "New goal / action item"} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label="Title" required error={errors.title}>
          <input className={fieldCls} value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Prepare 5 demo apps for the Bakersfield run" autoFocus />
        </Field>
        <Field label="Details (optional)">
          <textarea className={areaCls} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Anything the owner needs to get it done." />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Owner">
            <select className={selectCls} value={ownerId} onChange={e => setOwnerId(e.target.value)} aria-label="Owner">
              <option value="">Someone else / unassigned</option>
              {admins.map(a => (
                <option key={a.user_id} value={a.user_id}>{a.full_name || a.email}</option>
              ))}
            </select>
            {!ownerId && (
              <input className={fieldCls + " mt-2"} value={ownerName} onChange={e => setOwnerName(e.target.value)}
                placeholder="Owner name (free text)" aria-label="Owner name" />
            )}
          </Field>
          <Field label="Due date" error={errors.due}>
            <input type="date" className={fieldCls} value={due} onChange={e => setDue(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Priority">
            <select className={selectCls} value={priority} onChange={e => setPriority(e.target.value as FounderActionItem["priority"])}>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </Field>
          <Field label="Status">
            <select className={selectCls} value={status} onChange={e => setStatus(e.target.value as FounderActionItem["status"])}>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="blocked">Blocked</option>
              <option value="completed">Completed</option>
            </select>
          </Field>
          <Field label="From meeting (optional)">
            <select className={selectCls} value={meetingId} onChange={e => setMeetingId(e.target.value)}>
              <option value="">Not linked</option>
              {recentMeetings.map(m => (
                <option key={m.id} value={m.id}>{m.title} ({m.meeting_date})</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <HqButton kind="ghost" onClick={onClose}>Cancel</HqButton>
          <HqButton onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : item ? "Save changes" : "Add item"}
          </HqButton>
        </div>
      </div>
    </HqModal>
  );
}
