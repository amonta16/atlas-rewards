/**
 * MedspaBookScreen — CP-207 · /<slug>/app/book for med spas (the Dermis model)
 *
 * Med spas already run a booking system (Boulevard, Vagaro, Mangomint,
 * Zenoti, Square, Acuity…). Atlas doesn't replace it: each treatment can
 * carry a scheduling link, and "Choose a time" opens it. No link → call,
 * text or WhatsApp the clinic with a pre-filled message. If Atlas's own
 * booking is on and there's no link, the regular booking flow runs instead
 * (see app/[business]/app/book/page.tsx).
 */
import type { Business } from "@/lib/types/database";
import { cents, type BookingOptions, type MedspaTreatment } from "@/lib/medspa";
import { AppLink } from "@/components/customer/app-link";
import { MsTopBar } from "./chrome";
import { IcCalendar, IcChevronRight, IcSparkle } from "./icons";

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "the booking page"; }
}

export function MedspaBookScreen({ business, treatment, menu, options }: {
  business: Business; treatment: MedspaTreatment | null; menu: MedspaTreatment[]; options: BookingOptions;
}) {
  const slug = business.slug;
  const msg = encodeURIComponent(options.message);
  const contact = [
    options.phone && { id: "call", label: "Call", sub: "Talk to the front desk", href: `tel:${options.phone}` },
    options.sms && { id: "text", label: "Text", sub: "Message ready to send", href: `sms:${options.sms}?&body=${msg}` },
    options.whatsapp && { id: "whatsapp", label: "WhatsApp", sub: "Message ready to send", href: `https://wa.me/${options.whatsapp}?text=${msg}` },
  ].filter(Boolean) as { id: string; label: string; sub: string; href: string }[];
  const nothing = !options.url && contact.length === 0;

  return (
    <div className="min-h-[80vh] bg-[var(--ms-bg)] pb-12">
      <MsTopBar slug={slug} title="Book" back={treatment ? "/book" : "/"} />

      <div className="px-5 pt-6">
        <div className="flex items-center gap-3.5">
          <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl" style={{ background: "color-mix(in srgb, var(--ms-p) 12%, #fff)", color: "var(--ms-p)" }}>
            {treatment?.image_url
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={treatment.image_url} alt="" className="h-full w-full object-cover" />
              : treatment ? <IcSparkle className="h-6 w-6" /> : <IcCalendar className="h-6 w-6" />}
          </span>
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>{treatment ? treatment.name : "Book your visit"}</h1>
            <p className="text-[15px]" style={{ color: "var(--ms-sub)" }}>
              {treatment
                ? [`${treatment.duration_minutes} min`, treatment.price_cents ? cents(treatment.price_cents) : null].filter(Boolean).join(" · ")
                : `at ${business.name}`}
            </p>
          </div>
        </div>

        {nothing ? (
          <div className="mt-8 rounded-[20px] bg-white px-6 py-8 text-center ring-1 ring-[var(--ms-line)]">
            <div className="text-[19px] font-semibold" style={{ color: "var(--ms-ink)" }}>Online booking is coming soon</div>
            <p className="mx-auto mt-1 max-w-[30ch] text-[15px] leading-relaxed" style={{ color: "var(--ms-sub)" }}>Contact {business.name} to book in the meantime.</p>
          </div>
        ) : (
          <>
            {options.url && (
              <div className="mt-7">
                <a href={options.url} target="_blank" rel="noopener noreferrer" data-book="link"
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-semibold text-white transition active:scale-[.99]" style={{ background: "var(--ms-p)" }}>
                  Choose a time <IcChevronRight className="h-5 w-5" />
                </a>
                <p className="mt-2.5 text-center text-[13px]" style={{ color: "var(--ms-icon)" }}>
                  Opens {host(options.url)}, {business.name}&apos;s booking page{options.deep || !treatment ? "" : ". Pick " + treatment.name + " there"}.
                </p>
              </div>
            )}

            {contact.length > 0 && (
              <section className={options.url ? "mt-8" : "mt-7"}>
                {options.url && <h2 className="mb-3 text-[15px] font-medium" style={{ color: "var(--ms-sub)" }}>Rather talk to someone?</h2>}
                <div className="space-y-2.5">
                  {contact.map((c, i) => (
                    <a key={c.id} href={c.href} data-contact={c.id} target={c.id === "whatsapp" ? "_blank" : undefined} rel={c.id === "whatsapp" ? "noopener noreferrer" : undefined}
                      className="flex items-center gap-3.5 rounded-2xl bg-white p-4 ring-1 ring-[var(--ms-line)] transition active:scale-[.99]"
                      style={!options.url && i === 0 ? { boxShadow: "inset 0 0 0 2px var(--ms-p)" } : undefined}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px] font-semibold" style={{ color: "var(--ms-ink)" }}>{c.label} {c.id === "call" ? business.name : "us"}</span>
                        <span className="block text-[14px]" style={{ color: "var(--ms-sub)" }}>{c.sub}</span>
                      </span>
                      <IcChevronRight className="h-5 w-5" style={{ color: "var(--ms-icon)" }} />
                    </a>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {!treatment && menu.length > 0 && (
          <section className="mt-9">
            <h2 className="text-[19px] font-semibold" style={{ color: "var(--ms-ink)" }}>Or pick a treatment</h2>
            <div className="mt-3 overflow-hidden rounded-2xl bg-white ring-1 ring-[var(--ms-line)]">
              {menu.map((t, i) => (
                <AppLink key={t.id} slug={slug} to={`/book?t=${encodeURIComponent(t.id)}`}
                  className={`flex items-center gap-3 px-4 py-3.5 active:bg-zinc-50 ${i ? "border-t border-[var(--ms-line)]" : ""}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-medium" style={{ color: "var(--ms-ink)" }}>{t.name}</span>
                    <span className="block text-[13px]" style={{ color: "var(--ms-sub)" }}>{t.category} · {t.duration_minutes} min</span>
                  </span>
                  <IcChevronRight className="h-5 w-5" style={{ color: "var(--ms-icon)" }} />
                </AppLink>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
