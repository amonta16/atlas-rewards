"use client";
import { useState } from "react";
import { Mail, Phone, Calendar, Cake, Pencil, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { SignOutButton } from "./sign-out-button";
import type { Business } from "@/lib/types/database";

type ProfileData = {
  email: string | null;
  full_name: string | null;
  phone: string | null;
  birthday: string | null;
  tier: string;
  joined: string;
};

export function EditableProfile({
  business, initial,
}: { business: Business; initial: ProfileData }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial.full_name ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [birthday, setBirthday] = useState(initial.birthday ?? "");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  // CP-28: birthday is set-once to close the "edit DOB every year for free
  // bonus" loophole. Once a non-null date is on file, the field becomes
  // read-only and the SQL trigger refuses any UPDATE that would change it.
  // We track the lock in state so a freshly-saved birthday locks immediately
  // within the same session (not just on next page load).
  const [birthdayLocked, setBirthdayLocked] = useState(!!initial.birthday);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    // CP-28: don't even attempt to send a new birthday if one is already on
    // file — the DB will reject it, but skipping the field client-side keeps
    // the success path clean for users who just edited name/phone.
    const { error } = await supabase.rpc("update_my_profile", {
      p_full_name: name || null,
      p_phone: phone || null,
      p_birthday: birthdayLocked ? null : (birthday || null),
    });
    setSaving(false);
    if (!error) {
      // CP-28: lock the birthday in the UI the instant the first save succeeds
      // so the user can't keep editing in the same session.
      if (!birthdayLocked && birthday) {
        setBirthdayLocked(true);
      }
      setSavedAt(new Date());
      setEditing(false);
    } else {
      alert("Save failed: " + error.message);
    }
  }

  const fullName = name || initial.email || "Member";
  const initials = fullName[0]?.toUpperCase() ?? "M";

  return (
    <div>
      <div className="px-4 pt-6 pb-8 text-white"
        style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)` }}>
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          {!editing ? (
            <Button size="sm" variant="outline"
              onClick={() => setEditing(true)}
              className="border-white/40 text-white bg-transparent hover:bg-white/10 hover:text-white">
              <Pencil className="h-3 w-3 mr-1.5" /> Edit
            </Button>
          ) : (
            <Button size="sm" onClick={save} disabled={saving}
              className="bg-white text-zinc-900 hover:bg-zinc-100">
              {saving ? "Saving…" : <><Check className="h-3 w-3 mr-1.5" /> Save</>}
            </Button>
          )}
        </div>

        <div className="mt-6 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold backdrop-blur">
            {initials}
          </div>
          <div>
            <div className="text-lg font-bold">{fullName}</div>
            <div className="text-xs text-white/85">{initial.tier} member · Joined {initial.joined}</div>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-4 pb-6">
        <div className="bg-white rounded-2xl border divide-y">
          <Row icon={<Mail className="h-4 w-4" />} label="Email" value={initial.email ?? "—"} />

          {editing ? (
            <EditRow icon={<Pencil className="h-4 w-4" />} label="Name">
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
            </EditRow>
          ) : (
            <Row icon={<Pencil className="h-4 w-4" />} label="Name" value={name || "—"} />
          )}

          {editing ? (
            <EditRow icon={<Phone className="h-4 w-4" />} label="Phone">
              <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" />
            </EditRow>
          ) : (
            <Row icon={<Phone className="h-4 w-4" />} label="Phone" value={phone || "—"} />
          )}

          {editing ? (
            birthdayLocked ? (
              // CP-28: locked state — birthday already on file. Show the saved
              // value, a padlock badge, and a friendly explainer so the user
              // understands why it isn't editable. (Customer-support overrides
              // happen on the manager dashboard, not here.)
              <div className="flex items-start gap-3 p-4">
                <div className="h-9 w-9 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center shrink-0">
                  <Cake className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                    Birthday
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 normal-case tracking-normal">
                      <Lock className="h-2 w-2" /> Locked
                    </span>
                  </div>
                  <div className="text-sm font-medium mt-0.5">
                    {new Date(birthday).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                    Birthday is set once to keep the +{business.point_rules.birthday} bonus fair. Ask the front desk if it needs to be corrected.
                  </p>
                </div>
              </div>
            ) : (
              <EditRow icon={<Cake className="h-4 w-4" />} label="Birthday">
                <Input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  You'll earn +{business.point_rules.birthday} points automatically on your birthday.
                  <span className="block text-[10px] text-amber-700 mt-0.5">
                    Heads up — this can only be set once.
                  </span>
                </p>
              </EditRow>
            )
          ) : (
            <Row
              icon={<Cake className="h-4 w-4" />}
              label={birthdayLocked ? "Birthday · Locked" : "Birthday"}
              value={birthday ? new Date(birthday).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "Set to earn a yearly bonus"}
              hint={!birthday ? "Tap Edit to add it" : undefined}
            />
          )}

          <Row icon={<Calendar className="h-4 w-4" />} label="Tier" value={initial.tier} />
        </div>

        {savedAt && !editing && (
          <p className="text-[11px] text-emerald-600 mt-2 text-center">
            <Check className="h-3 w-3 inline mr-1" /> Saved at {savedAt.toLocaleTimeString()}
          </p>
        )}

        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="h-9 w-9 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</div>
        <div className="text-sm font-medium truncate">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

function EditRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-4">
      <div className="h-9 w-9 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <Label className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</Label>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}
