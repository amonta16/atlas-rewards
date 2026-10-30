import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-8 text-center">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">We couldn&apos;t find that clinic</h1>
      <p className="mt-2 text-[15.5px] text-sub">The link may be old, or the clinic has moved.</p>
      <Link href="/find" className="btn-ink mt-8 max-w-[260px]">Find your location</Link>
    </main>
  );
}
