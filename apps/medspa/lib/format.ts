/** (805) 555-0142 from any US number; falls back to what was given. */
export function formatPhone(p: string | null | undefined) {
  const d = (p ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p || "Your phone number";
}
