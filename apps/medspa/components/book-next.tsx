import type { BookingOptions } from "@/lib/medspa";
import { ContactList } from "./action-sheet";
import { IcCalendar } from "./icons";

/** Post-purchase step: "Now book your visit", with the clinic's ways to book inline. */
export function BookNext({ title, body, options }: { title: string; body: string; options: BookingOptions }) {
  return (
    <section className="mx-4 mt-3 rounded-card bg-white p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-tint text-brand"><IcCalendar className="h-5 w-5" /></span>
        <div>
          <p className="eyebrow">Next step</p>
          <p className="text-[18px] font-semibold leading-tight">{title}</p>
        </div>
      </div>
      <p className="mt-2.5 text-[14.5px] leading-snug text-sub">{body}</p>
      <div className="mt-4"><ContactList options={options} /></div>
    </section>
  );
}
