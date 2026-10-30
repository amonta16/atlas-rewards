-- CP-228 · 01 · new run-aware condition c.entry_kind
-- "The event that started this journey was a <kind> order" (order.paid carries
-- payload.kind = package | product | gift_card). Used by ms.book_after_purchase
-- so only PACKAGE purchases get "book your session" (not skincare / gift cards).
-- Identical to the live CP-217 wf_cond_run (verified 2026-10-30) plus one branch.
-- Safe to re-run.
create or replace function public.wf_cond_run(p_type text, p_cfg jsonb, p_run public.workflow_runs, p_graph jsonb) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v boolean; v_events text[]; v_entry record;
begin
  p_cfg := coalesce(p_cfg, '{}'::jsonb);
  select id, type, payload into v_entry from public.customer_events where id = p_run.entry_event_id;
  case p_type
    when 'c.since_entry' then
      v_events := array(select jsonb_array_elements_text(coalesce(p_cfg->'events', '["booking.created"]'::jsonb)));
      v := exists (select 1 from public.customer_events ce
                    where ce.membership_id = p_run.membership_id and ce.type = any(v_events)
                      and ce.occurred_at >= coalesce(p_run.entered_at, now()) and ce.id is distinct from p_run.entry_event_id
                      and (not coalesce((p_cfg->>'same_item')::boolean, false) or ce.payload->>'item_id' is not distinct from v_entry.payload->>'item_id'));
    when 'c.entry_event' then
      v := v_entry.type = any(array(select jsonb_array_elements_text(case jsonb_typeof(p_cfg->'event') when 'array' then p_cfg->'event' else jsonb_build_array(p_cfg->>'event') end)));
    when 'c.entry_kind' then
      v := v_entry.payload->>'kind' = any(array(select jsonb_array_elements_text(coalesce(p_cfg->'kinds', '[]'::jsonb))));
    when 'c.in_journey' then
      v := exists (select 1 from public.workflow_runs r join public.workflows w on w.id = r.workflow_id
                    where r.membership_id = p_run.membership_id and r.status in ('running','waiting') and w.system_key = p_cfg->>'key' and r.id is distinct from p_run.id);
    else
      v := public.wf_cond(p_type, p_cfg, p_run.business_id, p_run.membership_id);
  end case;
  v := coalesce(v, false);
  if coalesce((p_cfg->>'negate')::boolean, false) then v := not v; end if;
  return v;
end $$;
