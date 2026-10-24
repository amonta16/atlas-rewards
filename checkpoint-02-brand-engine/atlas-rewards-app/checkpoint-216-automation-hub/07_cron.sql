-- CP-216 · Automation Hub · 07 pg_cron schedules
-- APPLIED to production Oct 23 2026 (migration cp216_07_cron). Safe to re-run (unschedules by name first).
--
-- atlas-wf-tick         every minute   → public.wf_tick()                 advances due runs (no-op while app_settings.automation_engine='off')
-- atlas-wf-time-events  daily 03:30 UTC → public.wf_evaluate_time_events() emits inactivity.N / birthday / anniversary / streak.broken /
--                                                                          recall.due / membership.expiring for enabled businesses
-- Existing jobs (ids 2–9: dormancy, fire-due-notifs, raffles, birthday/holiday/member-date offers, expiry, birthday points) are untouched.

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('atlas-wf-tick', 'atlas-wf-time-events');
  perform cron.schedule('atlas-wf-tick', '* * * * *', $j$select public.wf_tick();$j$);
  perform cron.schedule('atlas-wf-time-events', '30 3 * * *', $j$select public.wf_evaluate_time_events();$j$);
end $$;
