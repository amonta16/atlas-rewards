"use client";
/**
 * Manager tools inside the desk (managers + Atlas admins only):
 *   Overview · the clinic's numbers (medspa_overview, same as the portal)
 *   Rewards  · create / edit / switch off / delete (upsert_reward, delete_reward)
 *   Team     · front desk + managers (list_team_members, create-account, remove)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CreatedStaff, DeskApi, NewStaff, Overview, RewardRow, TeamRow } from "@/lib/desk-api";
import { Card, Empty, Modal } from "./ui";
import { IcBag, IcGift, IcSpark, IcUser } from "../icons";

const money = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
const rel = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return m < 1 ? "just now" : `${m} min ago`;
  const h = Math.round(m / 60); return h < 24 ? `${h} hr ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const shadow = "shadow-[0_10px_30px_-24px_rgba(23,27,38,.45)]";

/* ───────────────────────── Overview ───────────────────────── */

type Metric = "visits" | "sales" | "joins";

export function OverviewView({ api, onOpen }: { api: DeskApi; onOpen: (v: "due" | "orders" | "rewards") => void }) {
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("visits");
  useEffect(() => { api.overview().then(setD).catch((e) => setErr((e as Error).message)); }, [api]);
  if (err) return <p className="rounded-[18px] bg-white px-5 py-4 text-[14.5px] text-red-600">{err}</p>;
  if (!d) return <div className="h-72 animate-pulse rounded-[24px] bg-white/70" />;
  const val = (m: Overview["monthly"][number]) => (metric === "visits" ? m.visits : metric === "sales" ? m.sales_cents / 100 : m.joins);
  const max = Math.max(1, ...d.monthly.map(val));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Patients" value={d.patients.toLocaleString("en-US")} />
        <Kpi label="Paying members" value={d.members_paid.toLocaleString("en-US")} />
        <Kpi label="Visits · 30 days" value={d.visits_30d.toLocaleString("en-US")} sub={`${d.visits_total.toLocaleString("en-US")} all time`} />
        <Kpi label="App sales · 30 days" value={money(d.sales_cents_30d)} sub={`${money(d.sales_cents_total)} all time`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className={`rounded-[24px] bg-white p-6 ${shadow}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[16px] font-semibold">Last 6 months</h3>
            <div className="inline-flex rounded-full bg-page p-1">
              {([["visits", "Visits"], ["sales", "App sales"], ["joins", "New patients"]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setMetric(id)} className={`h-8 rounded-full px-3.5 text-[13px] font-semibold ${metric === id ? "bg-white text-ink shadow-card" : "text-sub"}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="mt-6 flex h-[200px] items-end gap-3">
            {d.monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[12px] font-semibold tabular-nums text-sub">{metric === "sales" ? money(m.sales_cents) : val(m).toLocaleString("en-US")}</span>
                <div className="w-full max-w-[56px] rounded-t-[12px] bg-brand/85" style={{ height: `${Math.max(6, (val(m) / max) * 150)}px` }} />
                <span className="text-[12px] text-faint">{new Date(`${m.month}-15T12:00:00`).toLocaleDateString("en-US", { month: "short" })}</span>
              </div>
            ))}
          </div>
        </div>
        <Card title="Latest">
          {d.activity.length === 0 ? <p className="text-[14px] text-sub">Nothing yet.</p> : (
            <ul className="space-y-3">
              {d.activity.slice(0, 7).map((a, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-page">{a.kind === "order" ? <IcBag className="h-4 w-4" /> : a.kind === "treatment" ? <IcSpark className="h-4 w-4" /> : <IcUser className="h-4 w-4" />}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-semibold">{a.who}</span><span className="block truncate text-[12.5px] text-sub">{a.kind === "signup" ? "Joined the app" : a.detail}{a.amount_cents ? ` · ${money(a.amount_cents)}` : ""}</span></span>
                  <span className="shrink-0 text-[12px] text-faint">{rel(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Jump title="Patients due" body="Who's due for their next treatment" onClick={() => onOpen("due")} />
        <Jump title="Shop orders" body="Payments to take and items to hand over" onClick={() => onOpen("orders")} />
        <Jump title="Rewards" body={`${d.auto_offers_active} automated offers running`} onClick={() => onOpen("rewards")} />
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`rounded-[22px] bg-white p-5 ${shadow}`}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</p>
      <p className="mt-1 text-[28px] font-semibold tabular-nums tracking-[-0.02em]">{value}</p>
      {sub && <p className="text-[12.5px] text-sub">{sub}</p>}
    </div>
  );
}
function Jump({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-[22px] bg-white p-5 text-left transition hover:-translate-y-0.5 ${shadow}`}>
      <p className="text-[15.5px] font-semibold">{title} →</p><p className="mt-1 text-[13.5px] text-sub">{body}</p>
    </button>
  );
}

/* ───────────────────────── Rewards ───────────────────────── */

const blankReward = (n: number): RewardRow => ({ id: null, name: "", description: "", point_cost: 100, image_url: null, is_active: true, show_in_store: true, reward_type: "discount", sort_order: n, category: null, terms: "" });

export function RewardsView({ api, say }: { api: DeskApi; say: (t: string) => void }) {
  const [rows, setRows] = useState<RewardRow[] | null>(null);
  const [edit, setEdit] = useState<RewardRow | null>(null);
  const load = useCallback(() => { api.rewardsList().then(setRows).catch(() => setRows([])); }, [api]);
  useEffect(() => { load(); }, [load]);
  const toggle = async (r: RewardRow) => { try { await api.saveReward({ ...r, is_active: !r.is_active }); say(r.is_active ? `${r.name} switched off` : `${r.name} is live`); load(); } catch (e) { say((e as Error).message); } };
  if (!rows) return <div className="h-60 animate-pulse rounded-[24px] bg-white/70" />;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14.5px] text-sub">What patients can spend points on. Shown in the app&apos;s Rewards tab and at the desk.</p>
        <button type="button" onClick={() => setEdit(blankReward(rows.length))} className="h-11 rounded-full bg-ink px-5 text-[14.5px] font-semibold text-white">Add reward</button>
      </div>
      {rows.length === 0 ? <Empty text="No rewards yet. Add your first one: patients see it in the app right away." /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id ?? r.name} className={`overflow-hidden rounded-[22px] bg-white ${shadow} ${r.is_active ? "" : "opacity-60"}`}>
              <div className="aspect-[16/9] bg-page">
                {r.image_url
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image_url} alt="" className="h-full w-full object-cover" />
                  : <div className="grid h-full place-items-center text-faint"><IcGift className="h-8 w-8" /></div>}
              </div>
              <div className="p-4">
                <p className="line-clamp-1 text-[15.5px] font-semibold">{r.name}</p>
                <p className="text-[13.5px] text-sub">{r.point_cost.toLocaleString("en-US")} pts{r.show_in_store ? "" : " · desk only"}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button type="button" onClick={() => setEdit({ ...r })} className="h-9 flex-1 rounded-full bg-page text-[13.5px] font-semibold">Edit</button>
                  <button type="button" role="switch" aria-checked={r.is_active} aria-label="Live in the app" onClick={() => toggle(r)} className={`relative h-7 w-12 rounded-full transition ${r.is_active ? "bg-brand" : "bg-line"}`}>
                    <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${r.is_active ? "left-[1.4rem]" : "left-0.5"}`} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <RewardModal api={api} r={edit} onClose={() => setEdit(null)} onSaved={(msg) => { setEdit(null); say(msg); load(); }} />}
    </div>
  );
}

function RewardModal({ api, r: init, onClose, onSaved }: { api: DeskApi; r: RewardRow; onClose: () => void; onSaved: (msg: string) => void }) {
  const [r, setR] = useState(init);
  const [busy, setBusy] = useState<"save" | "photo" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (p: Partial<RewardRow>) => setR((x) => ({ ...x, ...p }));
  async function save() {
    if (!r.name.trim() || r.point_cost <= 0) { setErr("Give it a name and a points cost."); return; }
    setBusy("save"); setErr(null);
    try { await api.saveReward(r); onSaved(init.id ? `${r.name} saved` : `${r.name} added`); } catch (e) { setErr((e as Error).message); setBusy(null); }
  }
  async function photo(f: File) {
    setBusy("photo"); setErr(null);
    try { set({ image_url: await api.uploadImage(f) }); } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  }
  async function del() {
    if (!init.id || !confirm(`Delete ${init.name}? Patients who already redeemed it keep their voucher.`)) return;
    setBusy("delete");
    try { await api.deleteReward(init.id); onSaved(`${init.name} deleted`); } catch (e) { setErr((e as Error).message); setBusy(null); }
  }
  return (
    <Modal title={init.id ? "Edit reward" : "New reward"} onClose={onClose}>
      <button type="button" onClick={() => file.current?.click()} className="relative block aspect-[16/9] w-full overflow-hidden rounded-[18px] bg-page">
        {r.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image_url} alt="" className="h-full w-full object-cover" />
          : <span className="grid h-full place-items-center text-[14px] text-sub">{busy === "photo" ? "Uploading…" : "Add a photo"}</span>}
        {r.image_url && <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-3 py-1 text-[12.5px] font-semibold">{busy === "photo" ? "Uploading…" : "Change"}</span>}
      </button>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) photo(f); e.target.value = ""; }} />
      <input className="field mt-4" placeholder="Name, e.g. $25 off any treatment" value={r.name} onChange={(e) => set({ name: e.target.value })} />
      <label className="mt-3 flex h-[52px] items-center gap-2 rounded-[16px] bg-white px-4 ring-1 ring-line">
        <input inputMode="numeric" className="h-full w-full bg-transparent text-[16px] outline-none" value={r.point_cost ? String(r.point_cost) : ""} onChange={(e) => set({ point_cost: parseInt(e.target.value.replace(/\D/g, "") || "0", 10) })} placeholder="Points" aria-label="Points cost" />
        <span className="text-[14px] text-faint">points</span>
      </label>
      <textarea className="field mt-3 h-20 resize-none py-3" placeholder="Description (optional)" value={r.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
      <textarea className="field mt-3 h-16 resize-none py-3" placeholder="Fine print (optional)" value={r.terms ?? ""} onChange={(e) => set({ terms: e.target.value })} />
      <label className="mt-3 flex items-center justify-between rounded-[16px] bg-page px-4 py-3 text-[14px]">
        <span><b className="block">Show in the app</b><span className="text-sub">Off = staff can still give it at the desk</span></span>
        <input type="checkbox" checked={r.show_in_store} onChange={(e) => set({ show_in_store: e.target.checked })} className="h-5 w-5 accent-[rgb(var(--p-rgb))]" />
      </label>
      {err && <p className="mt-3 text-[13.5px] text-red-600">{err}</p>}
      <button type="button" className="btn-ink mt-5" disabled={busy !== null} onClick={save}>{busy === "save" ? "Saving…" : init.id ? "Save reward" : "Add reward"}</button>
      {init.id && <button type="button" disabled={busy !== null} onClick={del} className="mt-3 w-full text-center text-[14px] font-medium text-red-600">{busy === "delete" ? "Deleting…" : "Delete reward"}</button>}
    </Modal>
  );
}

/* ───────────────────────── Team ───────────────────────── */

const ROLE: Record<string, string> = { business_manager: "Manager", business_staff: "Front desk" };

export function TeamView({ api, say, deskUrl }: { api: DeskApi; say: (t: string) => void; deskUrl: string }) {
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<CreatedStaff | null>(null);
  const load = useCallback(() => { api.team().then(setRows).catch(() => setRows([])); }, [api]);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <div className="h-48 animate-pulse rounded-[24px] bg-white/70" />;
  const active = rows.filter((r) => r.kind === "member" || r.status === "active");
  const pending = rows.filter((r) => r.kind === "invitation" && r.status === "pending");
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14.5px] text-sub">People who can sign in to this desk. Front desk staff can check patients in; managers also see Overview, Rewards and Team.</p>
        <button type="button" onClick={() => setAdding(true)} className="h-11 rounded-full bg-ink px-5 text-[14.5px] font-semibold text-white">Add staff</button>
      </div>
      <ul className={`overflow-hidden rounded-[24px] bg-white ${shadow}`}>
        {active.map((r) => (
          <li key={`${r.user_id}-${r.role}`} className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 last:border-0">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-page text-[14px] font-semibold">{(r.full_name || r.email).slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[15.5px] font-semibold">{r.full_name || r.email}</span><span className="block truncate text-[13px] text-sub">{r.email}</span></span>
            <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${r.role === "business_manager" ? "bg-tint text-brand" : "bg-page text-sub"}`}>{ROLE[r.role] ?? r.role}</span>
            {r.user_id && <button type="button" onClick={async () => { if (!confirm(`Remove ${r.full_name || r.email} from the team?`)) return; try { await api.removeStaff(r); say(`${r.full_name || r.email} removed`); load(); } catch (e) { say((e as Error).message); } }}
              className="h-9 rounded-full bg-page px-4 text-[13.5px] font-semibold">Remove</button>}
          </li>
        ))}
        {pending.map((r) => (
          <li key={r.token ?? r.email} className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 last:border-0">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-50 text-[14px] font-semibold text-amber-800">?</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[15.5px] font-semibold">{r.email}</span><span className="block text-[13px] text-sub">Invited, hasn&apos;t signed in yet</span></span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-[12.5px] font-semibold text-amber-800">{ROLE[r.role] ?? r.role} · pending</span>
            {r.token && <button type="button" onClick={async () => { try { await api.revokeInvite(r); say("Invitation revoked"); load(); } catch (e) { say((e as Error).message); } }} className="h-9 rounded-full bg-page px-4 text-[13.5px] font-semibold">Revoke</button>}
          </li>
        ))}
        {active.length + pending.length === 0 && <li className="px-5 py-8 text-center text-[14.5px] text-sub">No staff yet.</li>}
      </ul>
      {adding && <AddStaffModal api={api} onClose={() => setAdding(false)} onCreated={(c) => { setAdding(false); setCreated(c); load(); }} />}
      {created && (
        <Modal title="Staff account ready" onClose={() => setCreated(null)}>
          <p className="text-[14.5px] text-sub">Send them these details. They can change the password after signing in.</p>
          <div className="mt-4 space-y-2 rounded-[18px] bg-page p-4 text-[14.5px]">
            <p><span className="text-sub">Desk link:</span> <b className="break-all">{deskUrl}</b></p>
            <p><span className="text-sub">Email:</span> <b>{created.email}</b></p>
            {created.password ? <p><span className="text-sub">Password:</span> <b className="font-mono">{created.password}</b></p> : <p className="text-sub">They already had an account: same password as before.</p>}
          </div>
          <button type="button" className="btn-ink mt-5" onClick={() => { navigator.clipboard?.writeText(`${deskUrl}\nEmail: ${created.email}${created.password ? `\nPassword: ${created.password}` : ""}`).catch(() => {}); setCreated(null); say("Copied"); }}>Copy and close</button>
        </Modal>
      )}
    </div>
  );
}

function AddStaffModal({ api, onClose, onCreated }: { api: DeskApi; onClose: () => void; onCreated: (c: CreatedStaff) => void }) {
  const [n, setN] = useState<NewStaff>({ email: "", full_name: "", role: "business_staff", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    if (!n.email.includes("@")) { setErr("Enter their email."); return; }
    if (n.password && n.password.length < 8) { setErr("Passwords need at least 8 characters (or leave it blank and we'll make one)."); return; }
    setBusy(true); setErr(null);
    try { onCreated(await api.addStaff(n)); } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <Modal title="Add staff" onClose={onClose}>
      <input className="field" placeholder="Full name" value={n.full_name} onChange={(e) => setN({ ...n, full_name: e.target.value })} />
      <input className="field mt-3" type="email" placeholder="Email" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["business_staff", "business_manager"] as const).map((r) => (
          <button key={r} type="button" onClick={() => setN({ ...n, role: r })} className={`rounded-[16px] p-3 text-left ${n.role === r ? "bg-ink text-white" : "bg-page"}`}>
            <b className="block text-[14.5px]">{ROLE[r]}</b><span className={`text-[12.5px] ${n.role === r ? "text-white/70" : "text-sub"}`}>{r === "business_staff" ? "Check-in, rewards, orders" : "Everything, incl. team"}</span>
          </button>
        ))}
      </div>
      <input className="field mt-3" placeholder="Password (optional, 8+ characters)" value={n.password} onChange={(e) => setN({ ...n, password: e.target.value })} />
      {err && <p className="mt-3 text-[13.5px] text-red-600">{err}</p>}
      <button type="button" className="btn-ink mt-5" disabled={busy} onClick={go}>{busy ? "Creating…" : "Create account"}</button>
    </Modal>
  );
}
