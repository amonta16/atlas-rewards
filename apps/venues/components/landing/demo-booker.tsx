"use client";
import type { RefObject } from "react";
import { AppQuiz } from "./app-quiz";

/**
 * Demo booker — CP-176 built it as "make it yours" + calendar side by side.
 * CP-181: that asked for everything at once (name, type, color, logo, then a
 * calendar and a contact form). It's now a one-question-at-a-time quiz with a
 * progress bar that ends on a revenue estimate, THEN offers the booking.
 * Same export + props, so the modal, /book-demo and /venues are unchanged.
 * The quiz lives in app-quiz.tsx; its numbers in lib/landing/quiz-model.ts.
 */
export function DemoBooker({ source, firstFieldRef, layout = "modal" }: { source: string; firstFieldRef?: RefObject<HTMLInputElement>; layout?: "modal" | "page" }) {
  return <AppQuiz source={source} firstFieldRef={firstFieldRef} layout={layout} />;
}
