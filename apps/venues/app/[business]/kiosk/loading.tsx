/**
 * The no-account waiver page (walk-in tablet, and the venue website's
 * "Sign waiver" button) is a single quick server render. A plain background
 * while it loads instead of the customer app's "One sec…" screen, which reads
 * as "this is an app" to someone who just tapped a link on a website.
 */
export default function KioskLoading() {
  return <div className="min-h-screen bg-zinc-50" />;
}
