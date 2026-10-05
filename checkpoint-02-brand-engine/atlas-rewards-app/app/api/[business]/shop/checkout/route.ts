import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { liveStripeAccount } from "@/lib/payments/accounts";
import { platformFeePercent, stripe, StripeError } from "@/lib/payments/stripe";
import { readMedspaConfig, shopPrice } from "@/lib/medspa";
import { resolvePreset } from "@/lib/layout-presets";

/**
 * POST /api/[business]/shop/checkout — CP-190 · med spa Shop
 *
 * Body: { itemId, quantity?, giftAmount?, recipientName?, recipientNote?, returnUrl, method? }
 * CP-193: method "klarna" opens Checkout with Klarna only (pay over time);
 * "card" / "wallet" use the account's default methods (cards, Apple Pay,
 * Google Pay). Klarna must be switched on in the practice's Stripe account.
 * Prices come from businesses.medspa_config on the SERVER (never the client).
 * Members (business_memberships.membership_payment_status = 'paid') get the
 * member price when one is set.
 *
 *  · Practice has Stripe connected and pay_mode = "stripe" → pending order +
 *    Stripe Checkout (mode=payment) on the connected account. The connect
 *    webhook flips it to paid (metadata.atlas_kind = "shop").
 *  · Otherwise → order is "reserved"; the patient pays at the desk, staff
 *    mark it paid in Front desk → Shop.
 * Response: { url } to redirect to Stripe, or { reserved: true, orderId }.
 */
export const dynamic = "force-dynamic";

function giftCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(8);
  return Array.from(b, (x) => a[x % a.length]).join("").replace(/(.{4})(.{4})/, "$1-$2");
}

export async function POST(req: NextRequest, { params }: { params: { business: string } }) {
  let body: { itemId?: string; quantity?: number; giftAmount?: number; recipientName?: string; recipientNote?: string; returnUrl?: string; method?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body." }, { status: 400 }); }

  const supabase = createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("id, slug, name, layout_preset, medspa_config").eq("slug", params.business).maybeSingle();
  if (!biz) return NextResponse.json({ error: "Business not found." }, { status: 404 });
  if (resolvePreset(biz.layout_preset) !== "medspa") return NextResponse.json({ error: "This shop isn't available." }, { status: 404 });

  const cfg = readMedspaConfig(biz.medspa_config);
  if (!cfg.shop.enabled) return NextResponse.json({ error: "The shop is closed right now." }, { status: 400 });
  const item = cfg.shop.items.find((i) => i.id === body.itemId && i.is_active);
  if (!item) return NextResponse.json({ error: "That item isn't available anymore." }, { status: 404 });

  const { data: mem } = await admin.from("business_memberships").select("id, membership_payment_status").eq("business_id", biz.id).eq("user_id", user.id).maybeSingle();
  if (!mem) return NextResponse.json({ error: "Join the app first, then come back to the shop." }, { status: 403 });
  const isMember = (mem as { membership_payment_status?: string }).membership_payment_status === "paid";

  const quantity = item.kind === "product" ? Math.min(10, Math.max(1, Math.floor(Number(body.quantity) || 1))) : 1;
  const unit = shopPrice(item, isMember, body.giftAmount ? Math.round(Number(body.giftAmount)) : null);
  if (unit == null) return NextResponse.json({ error: "Ask the front desk about this one." }, { status: 400 });
  const amount = unit * quantity;

  const connected = cfg.shop.pay_mode === "stripe" ? await liveStripeAccount(biz.id) : null;
  const isGift = item.kind === "gift_card";
  const order = {
    business_id: biz.id,
    user_id: user.id,
    item_id: item.id,
    item_name: isGift ? `${item.name} · $${(unit / 100).toFixed(0)}` : item.name,
    kind: item.kind,
    quantity,
    amount_cents: amount,
    status: connected ? "pending" : "reserved",
    pay_method: connected ? "stripe" : "in_person",
    treatment_id: item.kind === "package" ? item.treatment_id : null,
    sessions_total: item.kind === "package" ? item.sessions ?? null : null,
    gift_code: isGift ? giftCode() : null,
    gift_balance_cents: isGift ? unit : null,
    recipient_name: isGift ? String(body.recipientName ?? "").slice(0, 80) || null : null,
    recipient_note: isGift ? String(body.recipientNote ?? "").slice(0, 280) || null : null,
  };
  const { data: row, error } = await admin.from("medspa_shop_orders").insert(order).select("id").single();
  if (error || !row) { console.error("[shop] insert failed", error); return NextResponse.json({ error: "Couldn't start your order. Please try again." }, { status: 500 }); }

  if (!connected) return NextResponse.json({ reserved: true, orderId: row.id });

  const base = body.returnUrl ? new URL(body.returnUrl).origin : process.env.NEXT_PUBLIC_APP_URL ?? "";
  // CP-193: back to the med spa Shop (/store), not the points catalog (/shop).
  const back = `${base}/${biz.slug}/app/store`;
  const klarna = body.method === "klarna";
  const fee = platformFeePercent();
  const metadata = { atlas_kind: "shop", atlas_order_id: row.id, atlas_business_id: biz.id, atlas_user_id: user.id };
  try {
    const session = await stripe<{ id: string; url: string }>("POST", "/checkout/sessions", {
      mode: "payment",
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      line_items: [{ quantity, price_data: { currency: "usd", unit_amount: unit, product_data: { name: order.item_name, description: (item.description || biz.name).slice(0, 300) } } }],
      metadata,
      ...(klarna ? { payment_method_types: ["klarna"] } : {}),
      payment_intent_data: { metadata, ...(fee ? { application_fee_amount: Math.round(amount * fee / 100) } : {}) },
      success_url: `${back}?tab=mine&order=${row.id}&paid=1`,
      cancel_url: `${back}?tab=mine&order=${row.id}&cancelled=1`,
    }, { account: connected, idempotencyKey: `shop_${row.id}` });
    await admin.from("medspa_shop_orders").update({ stripe_checkout_id: session.id }).eq("id", row.id);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    await admin.from("medspa_shop_orders").update({ status: "cancelled" }).eq("id", row.id);
    const msg = klarna
      ? `Klarna isn't available at ${biz.name} for this order. Choose Card instead.`
      : e instanceof StripeError ? e.message : "Payment couldn't start.";
    console.error("[shop] checkout error", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
