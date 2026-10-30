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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 overflow-y-auto transition-opacity"
      style={{ background: primary }}
    >
      {/* CP-44: number + button live in ONE centered group so the "View my
          rewards" button always sits right under the points — reachable
          without scrolling on any phone size (it used to be pinned to the
          very bottom edge, too far down on large phones). The number scales
          with the viewport (clamp) so it never overflows a small screen. */}
      <div className="my-auto flex flex-col items-center text-center w-full max-w-xs">
        <h2 className="text-white text-2xl font-semibold">Hurray!</h2>
        <p className="text-white/90 mt-1">You just earned</p>
        <div
          className="text-white font-bold leading-none my-4 tracking-tighter"
          style={{ fontSize: "clamp(72px, 26vw, 116px)" }}
        >
          {amount}
        </div>
        <p className="text-white text-base font-medium">{businessName} points</p>
        <Button
          onClick={dismiss}
          className="mt-8 w-full bg-zinc-900 hover:bg-zinc-800 text-white h-12 text-base"
        >
          View my rewards
        </Button>
      </div>
    </div>
  );
}
