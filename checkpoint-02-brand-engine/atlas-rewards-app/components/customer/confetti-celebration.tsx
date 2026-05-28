"use client";
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";

/**
 * Full-screen celebratory overlay shown when a customer earns points.
 * Triggered by ?celebrate=<amount> in the URL — the manager app does this after award.
 * Patient App-style: confetti burst, big number, business name, View my rewards CTA.
 */
export function ConfettiCelebration({
  amount, businessName, primary, onDismiss,
}: { amount: number; businessName: string; primary: string; onDismiss: () => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Three bursts for a juicy feel
    const fire = (origin: { x: number; y: number }) => confetti({
      particleCount: 80,
      spread: 70,
      origin,
      colors: ["#ffffff", "#fde68a", "#fda4af", "#a5b4fc", "#86efac"],
    });
    fire({ x: 0.2, y: 0.5 });
    setTimeout(() => fire({ x: 0.5, y: 0.4 }), 150);
    setTimeout(() => fire({ x: 0.8, y: 0.5 }), 300);
  }, []);

  function dismiss() { setVisible(false); setTimeout(onDismiss, 200); }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 transition-opacity"
      style={{ background: primary }}
    >
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <h2 className="text-white text-2xl font-semibold">Hurray!</h2>
        <p className="text-white/90 mt-2">You just earned</p>
        <div className="text-white text-[120px] font-bold leading-none my-6 tracking-tighter">
          {amount}
        </div>
        <p className="text-white text-base font-medium px-8">{businessName} points</p>
      </div>
      <Button onClick={dismiss} className="w-full max-w-xs bg-zinc-900 hover:bg-zinc-800 text-white h-12 text-base">
        View my rewards
      </Button>
    </div>
  );
}
