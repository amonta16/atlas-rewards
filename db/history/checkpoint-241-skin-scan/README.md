# CP-241 · AI skin scan

Patient app: Home → Educate yourself → skin scan (`/[clinic]/skin-scan`), powered by Perfect Corp
(Skin Analysis V2.1 + Skin Simulation). Needs `PERFECTCORP_API_KEY` on the med spa Vercel project;
without it the scan runs in demo mode (sample scores).

- `businesses.medspa_config.skin_scan.enabled`: App Builder → Products → AI skin scan. Off for live
  clinics until turned on; the demo and instant previews show it by default.
- `cp241_skin_scans.sql`: `medspa_skin_scans` (scores only, never photos) + `medspa_skin_scans_desk`
  for the desk's Skin scans list. Signed-in patients save their scan from the results screen.

**Applied** to Supabase (Atlas Engine Reward) on 2026-11-10 as migration `cp241_skin_scans`: table, RLS on with both policies, `medspa_skin_scans_desk` (security definer, staff-gated).
