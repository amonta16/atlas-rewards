# Multi-tenant routing — how each business gets its branded URL

This is how `joesgym.atlasrewards.app` and `juliasmedspa.atlasrewards.app` and 50 others all run off one deployed app.

## The flow, in plain English

1. Customer types or taps a link → `joesgym.atlasrewards.app/dashboard`
2. The app boots, looks at `window.location.host`, splits off the subdomain → `"joesgym"`
3. The app calls `resolve_business_by_slug('joesgym')` against Supabase
4. Supabase returns the brand config (name, logo, colors, widget toggles, point rules)
5. The whole app re-themes around that business. The customer never sees "Atlas Rewards" — they see *Joe's Gym Rewards*.

A `business_id` lives in app state for the rest of the session. Every query the customer makes is scoped to that business by RLS. They literally cannot see another business's data even if they try.

## The DNS setup

Two records on your DNS (Cloudflare, Namecheap, etc.):

```
A     atlasrewards.app          → <your hosting IP>
CNAME *.atlasrewards.app        → <your hosting host>
```

The wildcard CNAME means every subdomain — `joesgym`, `juliasmedspa`, `kingsarcade` — resolves to the same app deployment. No DNS work needed per client.

## The hosting setup (Vercel, Netlify, Cloudflare Pages — any of them)

In your hosting platform, add the wildcard domain `*.atlasrewards.app`. The platform will issue a wildcard SSL certificate automatically (Let's Encrypt). Done.

## The app code (just so you've seen it)

```ts
// On app boot
const host = window.location.host;           // "joesgym.atlasrewards.app"
const slug = host.split('.')[0];              // "joesgym"

const { data: business } = await supabase
  .rpc('resolve_business_by_slug', { p_slug: slug });

// Apply brand to the app
applyBrand(business.brand_colors);
setLogo(business.logo_url);
setVisibleWidgets(business.widget_config);
```

That's the whole routing layer. The function `resolve_business_by_slug` is already in `03_functions.sql` and is callable by anonymous users (they need to see the brand before logging in).

## Edge cases handled now so we don't hit them later

- **`atlasrewards.app` with no subdomain** → app shows an agency landing page (built in CP 9).
- **Unknown slug** (`badslug.atlasrewards.app`) → app shows "Business not found" and a link back.
- **`www.atlasrewards.app`** → redirect to `atlasrewards.app` (handle at the hosting layer).
- **Future custom domains** (`rewards.joesgym.com`) → add a `custom_domain` column to `businesses` later and check it before falling back to slug. The schema already supports adding this without a migration to existing data.

## Future: Atlas Engine native shell

When you build the native iOS/Android shell later, the routing flips: instead of reading the subdomain, the native app calls `resolve_business_by_slug` with whatever slug the customer scanned or looked up. The PWA gets embedded in a WebView pointed at that subdomain, OR the native UI hits the same RPC and renders natively. Same schema, same RLS, zero rework.
