-- CP-261 · install the venue email journeys on Flippo's — run AFTER the deploy (see README).
-- Every journey is created PAUSED. Turn each on from the desk: Campaigns → Automations.
-- Nothing reaches a member until VENUE_EMAIL_SEND=1 is also set on the venues Vercel project.

select public.wf_install_venue_suite('ffcd5f3e-5518-437d-bda8-bb2887dc4348');   -- Flippo's Arcade and Batting Cage

-- check: 10 rows, all paused
select system_key, status from public.workflows
 where business_id = 'ffcd5f3e-5518-437d-bda8-bb2887dc4348' and system_key like 'fe.%' order by system_key;
