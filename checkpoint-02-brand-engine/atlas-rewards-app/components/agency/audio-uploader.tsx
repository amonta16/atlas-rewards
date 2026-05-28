"use client";
/**
 * AudioUploader — generic voice-note uploader for Supabase Storage.
 *
 * Mirrors the ImageUploader contract:
 *   - bucket: storage bucket id ("voice-messages")
 *   - pathPrefix: usually the business id
 *   - value / onChange: the public URL of the uploaded file
 *
 * Picks an MP3 or WAV (or any audio/* file the browser will accept),
 * uploads to <bucket>/<pathPrefix>/<timestamp>.<ext>, and returns the
 * public URL with a cache-buster query string.
 *
 * Once a file is on file, the component renders:
 *   • A native <audio controls> player so the agency can preview their
 *     own voice note in place,
 *   • Replace + Remove actions in the corner.
 */
import { useState, useRef } from "react";
import { Upload, X, Mic, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function AudioUploader({
  bucket = "voice-messages",
  pathPrefix,
  value,
  onChange,
}: {
  bucket?: "voice-messages";
  pathPrefix: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setErr(null);
    const supabase = createClient();
    const ext = (file.name.split(".").pop() ?? "mp3").toLowerCase();
    const path = `${pathPrefix}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: file.type || `audio/${ext}` });
    if (error) {
      const msg = /bucket not found/i.test(error.message)
        ? `Storage bucket "${bucket}" is missing. Run checkpoint-29-automated-offers-revamp/cp29_migration.sql to create it.`
        : error.message;
      setErr(msg);
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
    const busted = `${publicUrl}?v=${Date.now()}`;
    onChange(busted);
    setUploading(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {value ? (
        <div className="rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
              <Mic className="h-3.5 w-3.5 text-emerald-600" />
              Voice message uploaded
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-3 w-3 mr-1" /> Replace
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={clear}
                className="text-rose-600 border-rose-200 hover:bg-rose-50">
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls preload="metadata" src={value} className="w-full" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100/60 transition-colors p-6 flex flex-col items-center justify-center gap-1.5 text-zinc-600"
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs font-medium">Uploading…</span>
            </>
          ) : (
            <>
              <div className="h-10 w-10 rounded-full bg-white border flex items-center justify-center shadow-sm">
                <Upload className="h-4 w-4 text-zinc-500" />
              </div>
              <span className="text-sm font-semibold mt-1">Click to upload or drag and drop</span>
              <span className="text-[11px] text-zinc-400">Audio file (MP3 or WAV)</span>
            </>
          )}
        </button>
      )}

      {err && <p className="text-xs text-rose-600">{err}</p>}
    </div>
  );
}
