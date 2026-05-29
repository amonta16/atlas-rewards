import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

export default function LandingPage() {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white">
      <header className="border-b border-white/10">
        <div className="container flex h-20 items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/atlas-engine-logo.png" alt="Atlas Engine" className="h-10" />
          <nav className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white">
                Agency Login
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="container flex-1 py-24 grid gap-12 lg:grid-cols-2 items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-semibold tracking-wider uppercase">
            <Sparkles className="h-3 w-3"/> White-label retention engine
          </div>
          <h1 className="text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
            One platform.<br/>
            <span className="bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent">
              Every business gets their own rewards app.
            </span>
          </h1>
          <p className="text-lg text-zinc-300 max-w-xl">
            Spin up a branded rewards app for any client in minutes. Points, rewards, referrals, reviews, birthdays, reactivation — all configurable per business.
          </p>
          <div className="flex gap-3 pt-2">
            <Link href="/agency">
              <Button size="lg" className="bg-white text-zinc-900 hover:bg-zinc-100">
                Open agency dashboard <ArrowRight className="h-4 w-4 ml-2"/>
              </Button>
            </Link>
            <a href={`${rootDomain.includes("lvh.me") ? "http" : "https"}://demo.${rootDomain}${rootDomain.includes("lvh.me") ? ":3000" : ""}`}>
              <Button size="lg" variant="outline" className="border-white/30 text-white bg-transparent hover:bg-white/10 hover:text-white">
                See the demo customer app
              </Button>
            </a>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-8">
          <div className="text-xs uppercase tracking-widest text-zinc-400 mb-3">Try the demo</div>
          <code className="block text-sm bg-black/40 px-4 py-3 rounded-lg border border-white/10 text-cyan-200">
            demo.{rootDomain}{rootDomain.includes("lvh.me") ? ":3000" : ""}
          </code>
          <p className="text-sm text-zinc-300 mt-4 leading-relaxed">
            That subdomain resolves to the demo business you seeded in Checkpoint 1. Change the brand colors in the agency editor and refresh — the customer app re-themes instantly.
          </p>
        </div>
      </section>

      <footer className="border-t border-white/10 py-6">
        <div className="container text-xs text-zinc-500">Atlas Engine · Atlas Rewards · CP 2.5 build</div>
      </footer>
    </main>
  );
}
