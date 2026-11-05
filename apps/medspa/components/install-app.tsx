"use client";
/**
 * Getting the app onto a phone, until it's in the app stores.
 *   iPhone  · Apple offers no install button to websites, so show the Share steps.
 *   Android · Chrome's own Install prompt when it offers one, otherwise the menu steps.
 *   Computer· a QR code to open this clinic's app on the phone.
 * Home shows a dismissible card on phones. Profile always has the row.
 * Neither shows once the app is running from the Home Screen.
 */
import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { IcClose, IcNext, IcPhone } from "./icons";
import { Portal } from "./portal";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Device = "ios" | "android" | "computer";

function useInstall() {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [device, setDevice] = useState<Device>("computer");
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const ua = nav.userAgent;
    const ipadAsMac = /Macintosh/.test(ua) && nav.maxTouchPoints > 1;
    setDevice(/iPhone|iPad|iPod/.test(ua) || ipadAsMac ? "ios" : /Android/.test(ua) ? "android" : "computer");
    setInstalled(window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true);
    setReady(true);
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as PromptEvent); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  return { ready, installed, device, prompt, clearPrompt: useCallback(() => setPrompt(null), []) };
}

function Steps({ device, url }: { device: Device; url: string }) {
  if (device === "computer") {
    return (
      <div className="mt-4 text-center">
        <div className="mx-auto w-fit rounded-[18px] bg-white p-3 ring-1 ring-line"><QRCode value={url} size={176} fgColor="#0a0a0a" bgColor="#ffffff" /></div>
        <p className="mt-3 text-[14px] leading-snug text-sub">Point your phone&apos;s camera at this code, then follow the steps on your phone.</p>
        <p className="mt-2 break-all text-[12.5px] text-faint">{url}</p>
      </div>
    );
  }
  const steps = device === "ios"
    ? ["Tap the Share button at the bottom of Safari. It's the square with an arrow.", "Scroll down and tap “Add to Home Screen”.", "Tap Add, then open the app from your Home Screen and log in."]
    : ["Tap the ⋮ menu at the top right of Chrome.", "Tap “Add to Home screen” or “Install app”.", "Open the app from your Home Screen and log in."];
  return (
    <>
      <ol className="mt-4 space-y-3 text-[14.5px] leading-snug text-sub">
        {steps.map((t, i) => (
          <li key={t} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black text-[12px] font-semibold text-white">{i + 1}</span>{t}</li>
        ))}
      </ol>
      {device === "ios" && <p className="mt-4 text-[12.5px] leading-snug text-faint">Don&apos;t see it? If this opened inside Instagram, Facebook or a text message, open this page in Safari first.</p>}
    </>
  );
}

function Sheet({ clinicName, slug, device, onClose }: { clinicName: string; slug: string; device: Device; onClose: () => void }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/${slug}` : `/${slug}`;
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] animate-fade bg-black/45" onClick={onClose}>
        <div role="dialog" aria-modal onClick={(e) => e.stopPropagation()} className="absolute inset-x-0 bottom-0 mx-auto max-w-md animate-sheet rounded-t-[26px] bg-white px-6 pt-6" style={{ paddingBottom: "calc(1.75rem + env(safe-area-inset-bottom, 0px))" }}>
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.015em]">Add {clinicName} to your phone</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-page"><IcClose className="h-4 w-4" /></button>
          </div>
          <Steps device={device} url={url} />
        </div>
      </div>
    </Portal>
  );
}

/** Home, phones only. */
export function InstallCard({ clinicName, slug }: { clinicName: string; slug: string }) {
  const { ready, installed, device, prompt, clearPrompt } = useInstall();
  const key = `ms_install_dismissed_${slug}`;
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem(key) === "1"); } catch { setHidden(false); } }, [key]);
  const dismiss = () => { setHidden(true); try { localStorage.setItem(key, "1"); } catch { /* fine */ } };
  if (!ready || installed || hidden || device === "computer") return null;

  async function add() {
    if (!prompt) { setOpen(true); return; }
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    clearPrompt();
  }

  return (
    <section className="relative mx-4 mt-5 rounded-[14px] bg-[#F4F5F6] p-4 pr-11">
      <button type="button" aria-label="Not now" onClick={dismiss} className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full"><IcClose className="h-3.5 w-3.5" /></button>
      <p className="text-[15px] font-semibold leading-tight">Keep {clinicName} on your phone</p>
      <p className="mt-1 text-[13px] leading-snug text-sub">Add the app to your Home Screen for your points, offers and reminders.</p>
      <button type="button" onClick={add} className="mt-3 h-9 rounded-[10px] bg-black px-4 text-[13.5px] font-semibold text-white">{prompt ? "Install" : "Show me how"}</button>
      {open && <Sheet clinicName={clinicName} slug={slug} device={device} onClose={() => setOpen(false)} />}
    </section>
  );
}

/** Profile, any device. On a computer it shows the QR code. */
export function InstallRow({ clinicName, slug }: { clinicName: string; slug: string }) {
  const { ready, installed, device, prompt, clearPrompt } = useInstall();
  const [open, setOpen] = useState(false);
  if (!ready || installed) return null;
  return (
    <li>
      <button type="button" onClick={async () => {
        if (!prompt) { setOpen(true); return; }
        await prompt.prompt();
        await prompt.userChoice.catch(() => null);
        clearPrompt();
      }} className="flex w-full items-center gap-3.5 px-4 py-4 text-left">
        <IcPhone className="h-5 w-5 text-sub" />
        <span className="flex-1 text-[15.5px] font-medium">Add the app to your phone</span>
        <IcNext className="h-4 w-4 text-faint" strokeWidth={2.2} />
      </button>
      {open && <Sheet clinicName={clinicName} slug={slug} device={device} onClose={() => setOpen(false)} />}
    </li>
  );
}
