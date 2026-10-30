/**
 * Med spa app typeface — CP-193. Hanken Grotesk, self-hosted (lib/fonts/hanken.ts).
 * Loaded only by the med spa frame (components/medspa-app/frame.tsx).
 */
import { hanken } from "@/lib/fonts/hanken";

export { hanken };
export const msFontClass = `${hanken.variable} font-[family-name:var(--font-hanken)]`;
