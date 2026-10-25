"use client";
/**
 * PhoneInput — CP-219 · formats US numbers as the customer types:
 *   8  → (8      805 → (805      8055 → (805) 5      8055550123 → (805) 555-0123
 *
 * The database normalizes every phone to its digits (normalize_phone,
 * search_members, resolve_member_by_phone), so storing the formatted value
 * changes nothing for matching or the one-account-per-phone check.
 *
 * Editing stays natural: the caret keeps its place among the digits, and
 * backspacing over a ")" or "-" removes the digit before it instead of
 * getting stuck on the punctuation. A leading country "1" (11 digits) is
 * dropped; anything past 10 digits is ignored.
 */
import { forwardRef, useLayoutEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

export function phoneDigits(v: string): string {
  let d = (v || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.slice(0, 10);
}

export function formatUSPhone(v: string): string {
  const d = phoneDigits(v);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Index in `formatted` just after the n-th digit (n = 0 → before the first). */
function caretAfterDigits(formatted: string, n: number): number {
  if (n <= 0) return formatted.startsWith("(") ? 1 : 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]) && ++seen === n) return i + 1;
  }
  return formatted.length;
}

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (formatted: string) => void;
};

export const PhoneInput = forwardRef<HTMLInputElement, Props>(function PhoneInput(
  { value, onChange, ...rest }, ref,
) {
  const inner = useRef<HTMLInputElement | null>(null);
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = inner.current;
    if (el && pendingCaret.current !== null && document.activeElement === el) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
    }
    pendingCaret.current = null;
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    let digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, "").length;
    let digits = raw.replace(/\D/g, "");

    // Backspace over punctuation: the text got shorter but no digit went
    // away → delete the digit just before the caret.
    const prevDigits = value.replace(/\D/g, "");
    const native = e.nativeEvent as InputEvent;
    if (native?.inputType === "deleteContentBackward" && digits === prevDigits && digitsBeforeCaret > 0) {
      digits = digits.slice(0, digitsBeforeCaret - 1) + digits.slice(digitsBeforeCaret);
      digitsBeforeCaret -= 1;
    }
    // Pasted "+1 805…" → drop the country code (keeps caret math in step).
    if (digits.length === 11 && digits.startsWith("1")) { digits = digits.slice(1); digitsBeforeCaret = Math.max(0, digitsBeforeCaret - 1); }

    const formatted = formatUSPhone(digits);
    pendingCaret.current = caretAfterDigits(formatted, Math.min(digitsBeforeCaret, phoneDigits(digits).length));
    onChange(formatted);
  }

  return (
    <Input
      {...rest}
      ref={(node) => {
        inner.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      type="tel"
      inputMode="tel"
      autoComplete={rest.autoComplete ?? "tel-national"}
      value={formatUSPhone(value)}
      onChange={handleChange}
    />
  );
});
