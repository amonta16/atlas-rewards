-- =====================================================================
-- Atlas · CP-119 v2 — push-pipeline diagnostic (read-only, ONE query)
-- =====================================================================
-- v2: one single SELECT, so the SQL editor shows EVERYTHING in one
-- result grid (v1 was multiple statements — the editor only shows the
-- last one — and used due_at where live has fire_at).
-- Run it, then Export → copy the rows back to me.
-- =====================================================================

with
a as (
  select 1 as ord, 'A. push_subscriptions' as section,
         concat_ws(' | ',
           coalesce(b.name, '(no business tag)'),
           case when ps.endpoint like 'fcm:%' then 'NATIVE (FCM)' else 'web push' end,
           'user ' || left(ps.user_id::text, 8),
           'created ' || to_char(ps.created_at, 'MM-DD HH24:MI'),
           'last_seen ' || to_char(ps.last_seen_at, 'MM-DD HH24:MI')
         ) as detail,
         row_number() over (order by ps.created_at desc) as rn
    from public.push_subscriptions ps
    left join public.businesses b on b.id = ps.business_id
   order by ps.created_at desc
   limit 25
),
b as (
  select 2, 'B. recent notifications',
         concat_ws(' | ',
           n.kind, left(n.title, 30),
           'created ' || to_char(n.created_at, 'MM-DD HH24:MI'),
           case when n.push_sent_at is null then 'NOT PUSHED' else 'pushed ' || to_char(n.push_sent_at, 'MM-DD HH24:MI') end
         ),
         row_number() over (order by n.created_at desc)
    from public.notifications n
   order by n.created_at desc
   limit 20
),
c as (
  select 3, 'C. unpushed backlog',
         concat('rows waiting for push: ', count(*),
                ' | oldest: ', coalesce(to_char(min(created_at), 'MM-DD HH24:MI'), '—')),
         1::bigint
    from public.notifications
   where push_sent_at is null
),
d as (
  select 4, 'D. reminder queue',
         concat('due now (unfired): ', count(*) filter (where fired_at is null and fire_at <= now()),
                ' | future queued: ',  count(*) filter (where fired_at is null and fire_at >  now()),
                ' | already fired: ',  count(*) filter (where fired_at is not null),
                ' | oldest due: ', coalesce(to_char(min(fire_at) filter (where fired_at is null), 'MM-DD HH24:MI'), '—')),
         1::bigint
    from public.notification_queue
),
e as (
  select 5, 'E. pipeline functions present',
         coalesce(string_agg(p.proname, ', ' order by p.proname), 'NONE FOUND'),
         1::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('fire_due_notifications','list_pending_pushes','mark_pushed',
                       'set_business_announcement','broadcast_notification')
),
e2 as (
  select 6, 'E2. triggers',
         concat(c2.relname, ' → ', t.tgname),
         row_number() over (order by c2.relname, t.tgname)
    from pg_trigger t
    join pg_class c2 on c2.oid = t.tgrelid
   where not t.tgisinternal
     and c2.relname in ('business_memberships','notifications','check_in_events','checkins')
),
f as (
  select 7, 'F. announcements written',
         concat_ws(' | ', left(ba.message, 40),
                   'updated ' || to_char(ba.updated_at, 'MM-DD HH24:MI')),
         row_number() over (order by ba.updated_at desc)
    from public.business_announcements ba
   order by ba.updated_at desc
   limit 10
)
select section, detail
  from (
    select * from a union all
    select * from b union all
    select * from c union all
    select * from d union all
    select * from e union all
    select * from e2 union all
    select * from f
  ) x (ord, section, detail, rn)
 order by ord, rn;
