"use client";
/**
 * Guests can browse everything. The moment they try to act (subscribe,
 * book, redeem) they get this prompt, then come straight back after
 * signing in.
 */
import { createContext, useCallback, useContext, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Portal } from "./portal";

type Ctx = { signedIn: boolean; require: (action: () => void) => void };
const GateCtx = createContext<Ctx>({ signedIn: false, require: () => {} });

export function GateProvider({ slug, signedIn, children }: { slug: string; signedIn: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const path = usePathname() ?? `/${slug}`;
  const require = useCallback((action: () => void) => (signedIn ? action() : setOpen(true)), [signedIn]);
  return (
    <GateCtx.Provider value={{ signedIn, require }}>
      {children}
      {open && (
        <Portal><div className="fixed inset-0 z-[60] grid animate-fade place-items-center bg-black/45 px-8" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal className="w-full max-w-[300px] animate-rise rounded-[22px] bg-[#2A2D33]/95 p-5 text-center text-white shadow-2xl backdrop-blur" onClick={(e) => e.stopPropagation()}>
            <p className="px-2 text-[16px] leading-snug">Please create an account or log in to use this feature</p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full bg-white/12 text-[15px] font-semibold">Cancel</button>
              <button type="button" onClick={() => router.push(`/${slug}/login?next=${encodeURIComponent(path)}`)} className="h-11 rounded-full bg-white/22 text-[15px] font-semibold">Continue</button>
            </div>
          </div>
        </div></Portal>
      )}
    </GateCtx.Provider>
  );
}

export function useGate() {
  return useContext(GateCtx);
}
