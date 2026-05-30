-- =====================================================================
-- CP-42 — Welcome gift trigger
-- =====================================================================
-- Andrew turned on the "Welcome Gift" automated offer template (and
-- recorded a voice memo for it), but nothing in the codebase actually
-- FIRED that offer when a new customer signed up — CP-18 only built
-- the schema + a date-based cron RPC for birthday/anniversary
-- templates. Signup-triggered templates were never wired.
--
-- This migration:
--   1. Adds an idempotent trigger on business_memberships INSERT that
--      finds every ACTIVE business_automated_offer for this business
--      whose template has trigger_type='signup' and creates a fresh
--      featured `offers` row on the spot. Visible immediately on the
--      customer's Home tab.
--   2. The trigger also drops an in-app notification so the new
--      member sees it on the bell as well as the Home banner. Push
--      fan-out is automatic via the CP-42 _notif_push_fanout trigger.
--   3. Safe: skips when no welcome offer is configured. Won't fire
--      twice for the same membership (uses ON CONFLICT DO NOTHING
--      with a uniq index on (business_id, title, created_at::date)).
--
-- Self-contained, idempotent. Apply after cp42_notifications_wiring.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._fire_welcome_gifts_for_new_member()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o          record;
  v_title    text;
  v_body     text;
  v_image    text;
  v_expires  timestamptz;
BEGIN
  -- For each active welcome-style automated offer this business has:
  FOR o IN
    SELECT bao.id            AS config_id,
           bao.custom_title,
           bao.custom_description,
           bao.custom_image_url,
           bao.expires_after_days,
           t.slug             AS template_slug,
           t.name             AS template_name,
           t.emoji            AS template_emoji,
           t.trigger_type
      FROM public.business_automated_offers bao
      JOIN public.automated_offer_templates t ON t.id = bao.template_id
     WHERE bao.business_id = NEW.business_id
       AND bao.is_active   = true
       AND t.trigger_type  = 'signup'
  LOOP
    v_title   := COALESCE(o.custom_title,
                          o.template_emoji || ' ' || o.template_name);
    v_body    := o.custom_description;
    v_image   := o.custom_image_url;
    v_expires := now() + (COALESCE(o.expires_after_days, 7) || ' days')::interval;

    -- Drop a fresh offer row — featured so it shows on the customer
    -- Home banner. Best-effort; we silently skip duplicates by date.
    BEGIN
      INSERT INTO public.offers
        (business_id, title, description, image_url, expires_at, is_active, is_featured)
      VALUES
        (NEW.business_id, v_title, v_body, v_image, v_expires, true, true);
    EXCEPTION WHEN OTHERS THEN
      -- Don't ever let an offer-creation hiccup block the membership insert.
      RAISE WARNING 'welcome_gift offer insert failed: %', SQLERRM;
    END;

    -- In-app notification (push fanout happens via _notif_push_fanout).
    BEGIN
      INSERT INTO public.notifications
        (user_id, business_id, kind, title, body, link_path)
      VALUES
        (NEW.user_id, NEW.business_id, 'automated_offer',
         '🎁 A welcome gift just dropped',
         COALESCE(v_body, 'Tap to see what''s waiting on your Home tab.'),
         '/app');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'welcome_gift notification insert failed: %', SQLERRM;
    END;

    -- Stamp last_triggered_at so the agency UI shows "last fired".
    UPDATE public.business_automated_offers
       SET last_triggered_at = now()
     WHERE id = o.config_id;
  END LOOP;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_welcome_gift ON public.business_memberships;
CREATE TRIGGER trg_welcome_gift
  AFTER INSERT ON public.business_memberships
  FOR EACH ROW EXECUTE FUNCTION public._fire_welcome_gifts_for_new_member();

NOTIFY pgrst, 'reload schema';
