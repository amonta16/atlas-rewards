"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ANCHORS } from "@/lib/landing/config";
import { DemoCta } from "./cta-button";

const LINKS = [
  { href: `#${ANCHORS.demo}`, label: "Preview" },
  { href: `#${ANCHORS.howItWorks}`, label: "How it works" },
  { href: `#${ANCHORS.pricing}`, label: "Pricing" },
  { href: `#${ANCHORS.faq}`, label: "FAQ" },
];

/** Navbar — CP-145. Logo, four links, login, one CTA. White, sticky, thin hairline once scrolled. */
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 bg-white/85 backdrop-blur-md transition-[border-color] duration-300",
        scrolled || open ? "border-b border-[#e3e9f0]" : "border-b border-transparent",
      )}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-black">
        Skip to content
      </a>
      <div className="lp-container flex h-16 items-center justify-between gap-6 md:h-[72px]">
        <Link href="/" className="lp-focus flex items-center rounded-md" aria-label="Atlas Engine home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto md:h-8" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="lp-focus rounded-md px-3 py-2 text-[14px] font-medium text-slate-600 transition-colors hover:text-[#14213d]">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/login" className="lp-focus rounded-md px-3 py-2 text-[14px] font-medium text-slate-600 hover:text-[#14213d]">
            Log in
          </Link>
          <DemoCta source="nav" event="nav_cta_clicked" size="md">
            Book a free demo
          </DemoCta>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <DemoCta source="nav" event="nav_cta_clicked" size="md" className="h-10 px-4 text-sm">
            Book a demo
          </DemoCta>
          <button
            type="button"
            className="lp-focus grid h-10 w-10 place-items-center rounded-lg text-[#14213d]"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      <div
        id="mobile-nav"
        className={cn(
          "overflow-hidden border-t border-[#e3e9f0] bg-white transition-[max-height,opacity] duration-300 lg:hidden",
          open ? "max-h-[80vh] opacity-100" : "pointer-events-none max-h-0 opacity-0",
        )}
      >
        <nav className="lp-container flex flex-col gap-1 py-4" aria-label="Mobile">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="lp-focus rounded-lg px-3 py-3 text-base font-medium text-[#14213d] hover:bg-[#f3f7fb]">
              {l.label}
            </a>
          ))}
          <Link href="/login" onClick={() => setOpen(false)} className="lp-focus rounded-lg px-3 py-3 text-base font-medium text-[#14213d] hover:bg-[#f3f7fb]">
            Business log in
          </Link>
        </nav>
      </div>
    </header>
  );
}

// CP-145: light redesign — white bar, navy logo, mobile shows the CTA in the bar itself.
