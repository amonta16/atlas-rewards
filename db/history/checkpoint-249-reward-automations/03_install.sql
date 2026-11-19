-- CP-249 · 03 · OPTIONAL: put the Rewards journeys on the med spas that already exist.
-- Run only after 01 and 02. Safe to re-run.
--
-- What wf_install_medspa_suite does per clinic (same function CP-217/228 used):
--   * creates ms.points_earned, ms.almost_there, ms.reward_expiring (status 'active' on create)
--   * publishes a new version of ms.welcome (day-1 email -> rewards layout), ms.winback (gift email -> rewards
--     layout) and ms.reward_ready (now starts on reward.unlocked and sends the "you unlocked" email). Each clinic's
--     own text edits (workflows.overrides) are kept. Runs already in progress finish on their old version.
--
-- Step 2 below then PAUSES the three new journeys on real (live) clinics, so no new kind of email starts going to real
-- patients until someone switches it on in Desk -> App builder -> Journey -> Automations. Demo / example / preview
-- clinics stay on, but the audience guard only reaches their test members there anyway.

-- 1. install / update
select b.slug, public.wf_install_medspa_suite(b.id, false) as journeys
  from public.businesses b where b.layout_preset = 'medspa' order by b.slug;

-- 2. keep the new ones off on live clinics
update public.workflows w set status = 'paused', updated_at = now()
  from public.businesses b
 where b.id = w.business_id and b.layout_preset = 'medspa'
   and w.system_key in ('ms.points_earned', 'ms.almost_there', 'ms.reward_expiring')
   and w.status = 'active' and w.created_at > now() - interval '10 minutes'
   and not coalesce(b.is_demo, false) and coalesce(b.medspa_config->>'example', '') <> 'true'
returning b.slug, w.system_key, w.status;

-- 3. check
select b.slug, w.system_key, w.status, v.version
  from public.workflows w join public.businesses b on b.id = w.business_id
  left join public.workflow_versions v on v.id = w.current_version_id
 where w.system_key in ('ms.welcome', 'ms.winback', 'ms.reward_ready', 'ms.points_earned', 'ms.almost_there', 'ms.reward_expiring')
 order by b.slug, w.system_key;
select jobname, schedule from cron.job where jobname = 'atlas-wf-reward-expiring';
