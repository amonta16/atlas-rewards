"use client";
import { useEffect, useState } from "react";
import { Plus, Newspaper, Edit2, Trash2, X, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "./image-uploader";
import type { Business, NewsPost } from "@/lib/types/database";

/**
 * News / blog manager — per-business feed shown in the customer app's
 * Home tab and visible to managers in the front-desk dashboard.
 */
export function NewsManager({ business }: { business: Business }) {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [editing, setEditing] = useState<Partial<NewsPost> | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("news_posts").select("*")
      .eq("business_id", business.id)
      .order("published_at", { ascending: false });
    setPosts((data ?? []) as NewsPost[]);
  }
  useEffect(() => { load(); }, [business.id]);

  async function save() {
    if (!editing?.title) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_news_post", {
      p_id: editing.id ?? null,
      p_business_id: business.id,
      p_title: editing.title,
      p_body: editing.body ?? null,
      p_image_url: editing.image_url ?? null,
      p_is_published: editing.is_published ?? true,
      p_published_at: editing.published_at ?? null,
    });
    if (error) { alert("Save failed: " + error.message); return; }
    setEditing(null);
    load();
  }

  async function remove(p: NewsPost) {
    if (!confirm(`Delete "${p.title}"?`)) return;
    const supabase = createClient();
    await supabase.rpc("delete_news_post", { p_id: p.id, p_business_id: business.id });
    load();
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-sky-600" /> News &amp; updates
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Posts show in a feed on the customer app's Home tab. Use for hours changes, events, or product launches.
          </p>
        </div>
        <Button onClick={() => setEditing({ is_published: true })}>
          <Plus className="h-4 w-4 mr-1" /> Add post
        </Button>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
          <Newspaper className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
          <p className="text-sm">No posts yet. Customers see this section only when you publish a post.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map(p => (
            <div key={p.id} className="rounded-xl border bg-zinc-50 p-3 flex items-start gap-3">
              <div className="h-14 w-14 rounded-lg overflow-hidden shrink-0 bg-white border">
                {p.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center"
                    style={{ background: `${business.brand_colors.primary}15` }}>
                    <Newspaper className="h-5 w-5" style={{ color: business.brand_colors.primary }} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-sm truncate">{p.title}</div>
                  {!p.is_published && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700">Draft</span>
                  )}
                </div>
                {p.body && <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{p.body}</div>}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {new Date(p.published_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}><Edit2 className="h-3 w-3" /></Button>
                <Button size="sm" variant="outline" className="text-rose-600" onClick={() => remove(p)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 flex items-center justify-between border-b">
              <h2 className="font-bold">{editing.id ? "Edit post" : "New post"}</h2>
              <button onClick={() => setEditing(null)} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Image (optional)</Label>
                <ImageUploader
                  bucket="news-images"
                  pathPrefix={business.id}
                  value={editing.image_url ?? null}
                  onChange={(url) => setEditing({ ...editing, image_url: url })}
                  aspectClass="aspect-video"
                  label="Post image"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Title</Label>
                <Input value={editing.title ?? ""} onChange={e => setEditing({ ...editing, title: e.target.value })}
                  placeholder="We're open late this Friday" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Body (optional)</Label>
                <textarea value={editing.body ?? ""} onChange={e => setEditing({ ...editing, body: e.target.value })}
                  placeholder="Tell your customers what's new…"
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px]" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                <Label className="cursor-pointer">Published</Label>
                <Switch checked={editing.is_published ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_published: v })} />
              </div>
            </div>
            <div className="p-5 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
              <Button className="flex-1" onClick={save} disabled={!editing.title}>
                <Save className="h-4 w-4 mr-1" /> Save post
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
