-- CP-236 · SMS consent split (Twilio A2P: no bundled consent).
-- contact_consent_at           = ticked the informational box (preview link, answers, call reminders)
-- contact_marketing_consent_at = ticked the separate marketing box (offers and promotions)
-- Both boxes are optional and unchecked by default. Additive, nullable: safe to re-run.
alter table public.app_previews
  add column if not exists contact_marketing_consent_at timestamptz;

comment on column public.app_previews.contact_consent_at is
  'CP-236: when the owner ticked the informational SMS box (app link, answers, call reminders). Null = no texts.';
comment on column public.app_previews.contact_marketing_consent_at is
  'CP-236: when the owner ticked the separate marketing SMS box (offers and promotions). Null = no marketing texts.';
