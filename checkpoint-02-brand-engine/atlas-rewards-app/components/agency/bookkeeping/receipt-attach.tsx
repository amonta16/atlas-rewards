"use client";
/**
 * receipt-attach.tsx — CP-112
 *
 * Attach supporting documentation to any bookkeeping record:
 *   • UPLOAD — photograph a physical receipt (or drop a PDF invoice).
 *     Files land in the PRIVATE `expense-receipts` bucket and are opened
 *     through short-lived signed URLs — never permanent public links.
 *     A sha256 fingerprint reuses an identical, already-uploaded file
 *     instead of storing it twice.
 *   • LINK — paste the URL of a digital receipt (email receipt, vendor
 *     billing page, Drive file…).
 *
 * Never put card numbers, credentials, or tokens in names/notes — this
 * stores evidence for the accountant, not payment secrets.
 */
import { useRef, useState } from "react";
import { Paperclip, Upload, Link2, X, Loader2, ExternalLink, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import type { ExpenseDocument } from "@/lib/types/database";
import { isValidHttpUrl } from "@/lib/founder-hq";
import { fileSha256 } from "@/lib/bookkeeping";
import { HqButton, fieldCls } from "@/components/agency/hq/hq-ui";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const OK_TYPES = /^(image\/(png|jpe?g|webp|heic|heif|gif)|application\/pdf)$/i;

export function ReceiptAttach({
  value, onChange, label = "Receipt / invoice",
}: {
  value: ExpenseDocument | null;
  onChange: (doc: ExpenseDocument | null) => void;
  label?: string;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  async function openDoc(doc: ExpenseDocument) {
    if (doc.kind === "link" && doc.external_url) {
      window.open(doc.external_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!doc.storage_path) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from(doc.bucket).createSignedUrl(doc.storage_path, 60 * 60);
    if (error || !data?.signedUrl) { toast.error("Couldn't open the file — " + (error?.message ?? "no URL")); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) { toast.error("File is over 15MB — export a smaller copy."); return; }
    if (file.type && !OK_TYPES.test(file.type)) { toast.error("Images or PDF only (photo of the receipt, or the invoice PDF)."); return; }
    setBusy(true);
    const supabase = createClient();

    // Dedupe: identical bytes → reuse the existing document row.
    const sha = await fileSha256(file);
    if (sha) {
      const { data: existing } = await supabase
        .from("expense_documents").select("*").eq("sha256", sha).maybeSingle();
      if (existing) {
        setBusy(false);
        onChange(existing as ExpenseDocument);
        toast.success("Matched an already-uploaded copy of this file — reused it.");
        return;
      }
    }

    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${new Date().getUTCFullYear()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("expense-receipts").upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) {
      setBusy(false);
      toast.error(/bucket not found/i.test(upErr.message)
        ? "Storage bucket \"expense-receipts\" is missing — run cp112_bookkeeping.sql in Supabase first."
        : "Upload failed — " + upErr.message);
      return;
    }

    const { data: doc, error: docErr } = await supabase
      .from("expense_documents")
      .insert({
        kind: "upload", bucket: "expense-receipts", storage_path: path,
        file_name: file.name, mime: file.type || null, size_bytes: file.size, sha256: sha,
      })
      .select().single();
    setBusy(false);
    if (docErr) {
      // Unique sha race: someone saved the same file between our check and
      // insert — reuse theirs.
      if (/duplicate|unique/i.test(docErr.message) && sha) {
        const { data: again } = await supabase
          .from("expense_documents").select("*").eq("sha256", sha).maybeSingle();
        if (again) { onChange(again as ExpenseDocument); return; }
      }
      toast.error("Couldn't save the document record — " + docErr.message);
      return;
    }
    onChange(doc as ExpenseDocument);
    toast.success("Receipt attached");
  }

  async function saveLink() {
    const url = linkUrl.trim();
    if (!isValidHttpUrl(url)) { toast.error("That doesn't look like a valid link (https://…)"); return; }
    setBusy(true);
    const supabase = createClient();
    const { data: doc, error } = await supabase
      .from("expense_documents")
      .insert({ kind: "link", external_url: url, file_name: url.replace(/^https?:\/\//, "").slice(0, 80) })
      .select().single();
    setBusy(false);
    if (error) { toast.error("Couldn't save the link — " + error.message); return; }
    setLinkMode(false); setLinkUrl("");
    onChange(doc as ExpenseDocument);
    toast.success("Digital receipt linked");
  }

  return (
    <div>
      <span className="block text-[11px] font-bold uppercase tracking-widest text-sky-200/60 mb-1.5">{label}</span>
      <input
        ref={inputRef} type="file" className="hidden"
        accept="image/*,application/pdf" capture={undefined}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      {value ? (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-white/5 border border-white/10">
          {value.kind === "upload"
            ? <FileText className="h-4 w-4 text-sky-300 shrink-0" />
            : <Link2 className="h-4 w-4 text-sky-300 shrink-0" />}
          <span className="text-[12px] text-sky-100/80 truncate flex-1">
            {value.file_name || (value.kind === "link" ? value.external_url : value.storage_path)}
          </span>
          <button type="button" onClick={() => openDoc(value)} aria-label="Open document"
            className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/70 hover:text-white">
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => onChange(null)} aria-label="Detach document"
            className="h-7 w-7 rounded-md bg-white/5 hover:bg-rose-500/15 flex items-center justify-center text-sky-200/70 hover:text-rose-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : linkMode ? (
        <div className="flex items-center gap-2">
          <input className={fieldCls + " !h-9 text-[12px]"} value={linkUrl} autoFocus
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveLink(); } }}
            placeholder="https:// link to the digital receipt…" inputMode="url" />
          <HqButton className="h-9" onClick={saveLink} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </HqButton>
          <HqButton kind="ghost" className="h-9" onClick={() => setLinkMode(false)}>Cancel</HqButton>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <HqButton kind="outline" className="h-9 text-[12px]" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload photo / PDF
          </HqButton>
          <HqButton kind="ghost" className="h-9 text-[12px]" onClick={() => setLinkMode(true)} disabled={busy}>
            <Link2 className="h-3.5 w-3.5" /> Link digital receipt
          </HqButton>
          <span className="text-[11px] text-sky-200/35 inline-flex items-center gap-1">
            <Paperclip className="h-3 w-3" /> Private — admins only, opened via expiring links
          </span>
        </div>
      )}
    </div>
  );
}

/** Tiny read-only chip for tables: shows documentation state. */
export function ReceiptChip({ doc }: { doc: ExpenseDocument | null | undefined }) {
  const { toast } = useToast();
  if (!doc) return <span className="text-[11px] font-semibold text-amber-300/90">No receipt</span>;
  async function open() {
    if (!doc) return;
    if (doc.kind === "link" && doc.external_url) {
      window.open(doc.external_url, "_blank", "noopener,noreferrer"); return;
    }
    if (!doc.storage_path) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(doc.bucket).createSignedUrl(doc.storage_path, 3600);
    if (error || !data?.signedUrl) { toast.error("Couldn't open receipt"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  return (
    <button onClick={open} className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 hover:text-sky-200">
      <Paperclip className="h-3 w-3" /> Receipt
    </button>
  );
}
