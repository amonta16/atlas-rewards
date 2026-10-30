import { createClient } from "@/lib/supabase/server";
import { optimizedUrl } from "@/lib/img";
import { AuthGrain } from "@/components/auth/auth-grain";

/**
 * CP-178 — branded split-screen sign-in for every business (customers,
 * managers, staff). Left: a mesh gradient built from the business's own
 * brand colors (the CSS vars the [business] layout already sets), its hero
 * photo blended in, logo + name. Right: the form (page.tsx). On phones the
 * panel collapses to a short branded band above the form.
 */
export default async function BusinessLoginLayout({ children, params }: { children: React.ReactNode; params: { business: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("resolve_business_by_slug", { p_slug: params.business });
  const b = (data?.[0] ?? null) as { name?: string; logo_url?: string | null; hero_image_url?: string | null } | null;
  const name = b?.name ?? "Rewards";
  const logo = b?.logo_url ?? null;
  const hero = b?.hero_image_url ? optimizedUrl(b.hero_image_url, 1200) : null;

  const mesh = [
    "radial-gradient(55% 45% at 18% 18%, hsl(var(--brand-secondary) / 0.95), transparent 62%)",
    "radial-gradient(50% 50% at 88% 28%, hsl(var(--brand-accent) / 0.9), transparent 60%)",
    "radial-gradient(70% 55% at 30% 95%, hsl(var(--brand-primary)), transparent 70%)",
    "radial-gradient(45% 40% at 80% 85%, hsl(var(--brand-secondary) / 0.7), transparent 65%)",
    "linear-gradient(150deg, hsl(var(--brand-primary)), hsl(var(--brand-accent)))",
  ].join(", ");

  return (
    <div className="min-h-[100dvh] bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative isolate flex h-48 overflow-hidden sm:h-56 lg:sticky lg:top-0 lg:h-[100dvh]" style={{ background: mesh }}>
        {hero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover opacity-30 mix-blend-luminosity" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/10 to-black/45" />
        <div aria-hidden className="absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-white/15 blur-3xl" />
        <AuthGrain />
        <div className="relative z-10 flex w-full flex-col justify-end p-6 sm:p-10 lg:justify-center lg:p-16">
          <div className="flex items-center gap-4">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optimizedUrl(logo, 240)} alt="" className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain p-1.5 shadow-lg lg:h-16 lg:w-16" />
            ) : (
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-xl font-bold text-brand-primary shadow-lg">{name.slice(0, 1)}</span>
            )}
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-white drop-shadow-sm sm:text-3xl lg:text-4xl">{name}</h1>
          </div>
          <div className="mt-6 hidden h-0.5 w-10 rounded-full bg-white/70 lg:block" />
          <p className="mt-6 hidden max-w-sm text-lg leading-relaxed text-white/90 lg:block">Your rewards, bookings and member perks, all in one place.</p>
          <p className="absolute bottom-6 left-6 hidden text-xs font-medium tracking-wide text-white/70 sm:left-10 lg:left-16 lg:block">Powered by Atlas Engine</p>
        </div>
      </aside>
      <div className="flex justify-center px-5 py-10 sm:px-8 lg:items-center lg:py-16">{children}</div>
    </div>
  );
}
