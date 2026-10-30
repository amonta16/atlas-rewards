import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getCachedUser } from "@atlas/core/supabase/server";
import { createAdminClient } from "@atlas/core/supabase/admin";
import { platformFeePercent, stripe, StripeError } from "@atlas/core/payments/stripe";
import { getClinic } from "@/lib/clinic";
import { FINANCING_LIMITS, financingFits, shopPrice, type FinancingMethod } from "@/lib/medspa";
import { clinicStripeAccount } from "@/lib/payments";
import { DEMO_ORDERS_COOKIE, type DemoOrder } from "@/lib/orders";
import { DEMO_COOKIE } from "@/lib/patient";

export const dynamic = "force-dynamic";

/**
 * POST /api/<clinic>/shop/checkout
 * Body: { itemId, quantity?, giftAmount?, recipientName?, recipientNote?, method? ("card" | "klarna" | "affirm") }
 *
 * Same rules as the venue app's CP-190/207 shop checkout, so the front desk
 * (Front desk → Shop) and the shared Connect webhook work unchanged:
 *  · price from the clinic's config on the server; members get member price
 *  · Stripe connected + pay_mode "stripe" → pending order + Stripe Checkout
 *    on the clinic's account; the webhook marks it paid (atlas_kind = "shop")
 *  · otherwise → "reserved", paid at the desk
 * Response: { url } (Stripe or the purchases screen) or { error }.
 */
function giftCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(8), (x) => a[x % a.length]).join("").replace(/(.{4})(.{4})/, "$1-$2");
}

export async function POST(req: NextRequest, { params }: { params: { clinic: string } }) {
  const body = (await req.json().catch(() => ({}))) as {
    itemId?: string; quantity?: number; giftAmount?: number; recipientName?: string; recipientNote?: string; method?: string;
  };
  const clinic = await getClinic(params.clinic).catch(() => null);
  if (!clinic) return NextResponse.json({ error: "Clinic not found." }, { status: 404 });
  const shop = clinic.cfg.shop;
  if (!shop.enabled) return NextResponse.json({ error: "The shop is closed right now." }, { status: 400 });
  const item = shop.items.find((i) => i.id === body.itemId && i.is_active);
  if (!item) return NextResponse.json({ error: "That item isn't available anymore." }, { status: 404 });

  const isGift = item.kind === "gift_card";
  const quantity = item.kind === "product" ? Math.min(10, Math.max(1, Math.floor(Number(body.quantity) || 1))) : 1;
  const base = `${req.nextUrl.origin}/${clinic.slug}`;
  const recipientName = isGift ? String(body.recipientName ?? "").trim().slice(0, 80) || null : null;
  const recipientNote = isGift ? String(body.recipientNote ?? "").trim().slice(0, 280) || null : null;
  const finance: FinancingMethod | null = body.method === "klarna" || body.method === "affirm" ? body.method : null;

  // ── Example clinic: no database, no Stripe. Remember the order in a cookie so "My purchases" shows it.
  if (clinic.isExample && clinic.id === "example") {
    const jar = cookies();
    const patientRaw = jar.get(DEMO_COOKIE)?.value;
    if (!patientRaw) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    let demoMember = false;
    try { demoMember = !!JSON.parse(decodeURIComponent(patientRaw)).plan; } catch { /* guest-like */ }
    const unit = shopPrice(item, demoMember, body.giftAmount ? Math.round(Number(body.giftAmount)) : null);
    if (unit == null) return NextResponse.json({ error: "Ask the front desk about this one." }, { status: 400 });
    let prev: DemoOrder[] = [];
    try { prev = JSON.parse(decodeURIComponent(jar.get(DEMO_ORDERS_COOKIE)?.value ?? "[]")); } catch { /* fresh */ }
    const order: DemoOrder = {
      id: `demo_${Date.now()}`, item_name: isGift ? `${item.name} · $${(unit / 100).toFixed(0)}` : item.name, kind: item.kind,
      quantity, amount_cents: unit * quantity, sessions_total: item.kind === "package" ? item.sessions : null,
      gift_code: isGift ? giftCode() : null, recipient_name: recipientName, created_at: new Date().toISOString(),
    };
    const res = NextResponse.json({ url: `${base}/orders?order=${order.id}&paid=1&demo=1` });
    res.cookies.set(DEMO_ORDERS_COOKIE, encodeURIComponent(JSON.stringify([order, ...prev].slice(0, 6))), { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: true });
    return res;
  }

  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const admin = createAdminClient();

  const { data: mem } = await admin.from("business_memberships").select("id, membership_payment_status")
    .eq("business_id", clinic.id).eq("user_id", user.id).maybeSingle();
  if (!mem) return NextResponse.json({ error: "Open the clinic's Home tab once, then try again." }, { status: 403 });
  const isMember = (mem as { membership_payment_status?: string }).membership_payment_status === "paid";

  const unit = shopPrice(item, isMember, body.giftAmount ? Math.round(Number(body.giftAmount)) : null);
  if (unit == null) return NextResponse.json({ error: "Ask the front desk about this one." }, { status: 400 });
  const amount = unit * quantity;

  if (finance) {
    const l = FINANCING_LIMITS[finance];
    if (!shop.financing[finance]) return NextResponse.json({ error: `${l.label} isn't offered here. Choose Card instead.` }, { status: 400 });
    if (!financingFits(finance, amount)) return NextResponse.json({ error: `${l.label} works for orders from $${l.min / 100} to $${(l.max / 100).toLocaleString("en-US")}. Choose Card instead.` }, { status: 400 });
  }

  const account = shop.pay_mode === "stripe" ? await clinicStripeAccount(clinic) : null;
  const order = {
    business_id: clinic.id, user_id: user.id, item_id: item.id,
    item_name: isGift ? `${item.name} · $${(unit / 100).toFixed(0)}` : item.name,
    kind: item.kind, quantity, amount_cents: amount,
    status: account ? "pending" : "reserved",
    pay_method: account ? "stripe" : "in_person",
    treatment_id: item.kind === "package" ? item.treatment_id : null,
    sessions_total: item.kind === "package" ? item.sessions ?? null : null,
    gift_code: isGift ? giftCode() : null,
    gift_balance_cents: isGift ? unit : null,
    recipient_name: recipientName, recipient_note: recipientNote,
  };
  const { data: row, error } = await admin.from("medspa_shop_orders").insert(order).select("id").single();
  if (error || !row) { console.error("[medspa shop] insert failed", error?.message); return NextResponse.json({ error: "Couldn't start your order. Please try again." }, { status: 500 }); }

  if (!account) return NextResponse.json({ url: `${base}/orders?order=${row.id}&reserved=1` });

  const fee = platformFeePercent();
  const metadata = { atlas_kind: "shop", atlas_order_id: row.id, atlas_business_id: clinic.id, atlas_user_id: user.id, atlas_app: "medspa" };
  try {
    const session = await stripe<{ id: string; url: string }>("POST", "/checkout/sessions", {
      mode: "payment",
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      line_items: [{ quantity, price_data: { currency: "usd", unit_amount: unit, product_data: { name: order.item_name, description: (item.description || clinic.name).slice(0, 300) } } }],
      metadata,
      ...(finance ? { payment_method_types: [finance] } : {}),
      payment_intent_data: { metadata, ...(fee ? { application_fee_amount: Math.round(amount * fee / 100) } : {}) },
      success_url: `${base}/orders?order=${row.id}&paid=1`,
      cancel_url: `${base}/shop/item/${encodeURIComponent(item.id)}`,
    }, { account, idempotencyKey: `shop_${row.id}` });
    await admin.from("medspa_shop_orders").update({ stripe_checkout_id: session.id }).eq("id", row.id);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    await admin.from("medspa_shop_orders").update({ status: "cancelled" }).eq("id", row.id);
    const msg = finance
      ? `${FINANCING_LIMITS[finance].label} isn't available at ${clinic.name} for this order. Choose Card instead.`
      : "Payment couldn't start. Please try again.";
    console.error("[medspa shop] checkout error", e instanceof StripeError ? e.message : (e as Error)?.message);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
