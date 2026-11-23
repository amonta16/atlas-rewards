"""CP-261 venue (entertainment) email journeys -> SQL (wf_venue_catalog()) + the desk's fallback JSON.

Same graph language as the med spa suite (db/history/checkpoint-249-reward-automations/gen/suite_defs.py),
tailored to a family entertainment center like Flippo's: arcade, batting cages, pool tables, party room,
prize counter. Every message is an EMAIL in the arcade layout (apps/venues/lib/automations/arcade-email.ts);
the venue's existing push automations (we miss you, birthday gift, expiring gifts) keep running as they are.

Every email carries gate = 'venue': the dispatcher holds it as skipped:'venue_email_off' until
VENUE_EMAIL_SEND=1 is set on the venues Vercel project.

Every button points at a screen that exists in the venue guest app:
  /app/rewards                 prize counter (rewards store)
  /app/rewards?redeem=<id>     opens Redeem on that prize (cta_redeem=True: the dispatcher adds the unlocked prize's id;
                               every ready prize card in the counter links this way too)
  /app/rewards?focus=review    scrolls to + flashes the Google review row
  /app/rewards?focus=refer     opens the refer-a-friend sheet (CP-261)
  /app/book                    cages / pool / party booking
  /app/book?section=party      booking opened on the party section (CP-261)

Run: PYTHONIOENCODING=utf-8 python gen/venue_defs.py
(writes 01_catalog.sql and apps/venues/lib/automations/venue-suite-catalog.json)"""
import json, io, os

def N(id, type, label, x, y, **cfg):
    return {"id": id, "type": type, "label": label, "position": {"x": x, "y": y}, "config": cfg}
def E(a, b, br=None):
    return {"id": f"e_{a}_{b}" + (f"_{br}" if br else ""), "from": a, "to": b, "branch": br}
def M(id, label, x, y, **cfg):
    """An arcade-layout email, held until VENUE_EMAIL_SEND=1."""
    return N(id, "a.email", label, x, y, template="arcade", gated=True, gate="venue", **cfg)
D, H = 1440, 60
BACK = ["checkin.recorded", "booking.created", "booking.completed"]

S = []

# ───────── NEW PLAYERS ─────────
S.append(dict(key="fe.welcome", grp="get_in", name="Welcome to the crew", family="fe.welcome", reentry=365,
  why="New members decide in the first few days whether the app is worth keeping. A welcome that shows the prize counter, then one nudge to book a cage if they haven't been back, turns sign-ups into regulars.",
  research="Welcome emails are the most-opened automated email (2-3x a normal campaign). Send right away, then one follow-up within the first week; stop as soon as they visit.",
  trigger_text="Someone joins your app", timing_text="Right away · day 4 if they haven't been back", channels=["email"],
  reward_text="Points on every visit and every dollar (your point rules)",
  nodes=[N("n1","t.signup","Joins the app",0,0),
         N("n2","w.stop_on_convert","Goal: checks in",0,140,goal="checkin"),
         M("n3","Email: welcome",0,280,when="Right away",
           subject="You're in, {{first_name}}! Your {{business}} rewards are live",
           preheader="Points on every visit, prizes at the counter.",
           heading="Welcome to the crew, {{first_name}}",
           body="Every visit and every dollar you spend earns points. Trade them at the prize counter for arcade credit, food, toys and cage time.\n\nShow your QR code at the counter each time you come in and your points stack up automatically.",
           cta_label="See the prizes",cta_path="/app/rewards",
           footnote="Tip: show your QR code at the counter on every visit"),
         N("n4","w.wait","Wait 4 days",0,420,minutes=4*D),
         N("n5","c.since_entry","Back yet?",0,560,events=BACK),
         N("n6","w.exit","End: came in",-300,700,reason="converted"),
         M("n7","Email: book a cage",0,700,when="Day 4, if they haven't been in",
           subject="Ready to play, {{first_name}}?",
           preheader="Reserve a cage or a pool table so it's ready when you walk in.",
           heading="Grab a cage, bring a friend",
           body="Reserve a batting cage or a pool table in the app and it's waiting for you when you walk in.\n\nYour points start the moment you check in, and the first prizes are closer than you think.",
           cta_label="Book a cage",cta_path="/app/book"),
         N("n8","w.exit","End",0,840)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4"),E("n4","n5"),E("n5","n6","yes"),E("n5","n7","no"),E("n7","n8")]))

# ───────── PRIZES & POINTS ─────────
S.append(dict(key="fe.points_earned", grp="rewards", name="Points scoreboard", family="fe.points_earned", reentry=7,
  why="After a visit or a purchase, players see their new score next to the prizes it gets them closer to. At most one a week, and never during the welcome week or right after an unlock email.",
  research="Showing progress toward a goal (the goal-gradient effect) brings people back sooner; programs that send a balance update after earning see more redemptions than ones that stay quiet.",
  trigger_text="Points are added (visit, purchase, review…)", timing_text="2 hours later · max 1 a week", channels=["email"],
  reward_text=None,
  nodes=[N("n1","t.points","Points are added",0,0,min_balance=1,entry_if=[{"type":"c.in_journey","config":{"key":"fe.welcome"},"negate":True}]),
         N("n2","w.wait","Wait 2 hours",0,140,minutes=2*H),
         N("n3","c.in_journey","Just unlocked a prize?",0,280,key="fe.reward_ready"),
         N("n4","w.exit","End",-300,420),
         M("n5","Email: scoreboard",0,420,when="2 hours after earning",
           subject="Scoreboard update: {{points}} points, {{first_name}}",
           preheader="Here's what your points get you at {{business}}.",
           heading="You're at {{points}} points",
           body="Nice playing. Here's what your points can get you at the prize counter, and what's up next.",
           cta_label="Open the prize counter",cta_path="/app/rewards"),
         N("n6","w.exit","End",0,560)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4","yes"),E("n3","n5","no"),E("n5","n6")]))

S.append(dict(key="fe.almost_there", grp="rewards", name="Almost there", family="fe.almost_there", reentry=21,
  why="When a player gets within a quarter of their next prize, one email tells them exactly how close they are. A close goal is the best reason to come back this week.",
  research="The goal-gradient effect: people speed up as a reward gets close (punch-card studies saw visits come faster near the last stamp). One nudge at about 75% is enough.",
  trigger_text="Points reach 75% of the next prize", timing_text="1 hour later · max 1 every 3 weeks", channels=["email"],
  reward_text="The next prize on their list",
  nodes=[N("n1","t.event","Close to the next prize",0,0,events=["reward.near"]),
         N("n2","w.wait","Wait 1 hour",0,140,minutes=H),
         N("n3","c.in_journey","Unlocked something meanwhile?",0,280,key="fe.reward_ready"),
         N("n4","w.exit","End",-300,420),
         M("n5","Email: so close",0,420,when="1 hour after",
           subject="{{first_name}}, you're {{points_remaining}} points from {{offer_name}}",
           preheader="One more visit should do it.",
           heading="So close: {{offer_name}}",
           body="Just {{points_remaining}} more points and it's yours. One more visit should do it: every check-in and every dollar at the counter adds up.",
           cta_label="Plan my next visit",cta_path="/app/book"),
         N("n6","w.exit","End",0,560)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4","yes"),E("n3","n5","no"),E("n5","n6")]))

S.append(dict(key="fe.reward_ready", grp="rewards", name="Prize unlocked", family="fe.reward_ready", reentry=30,
  why="The moment a player's points cross a prize's cost they get a big photo email of it with a Redeem button. If they haven't redeemed anything two weeks later, one reminder shows them what's waiting.",
  research="Unredeemed rewards are a ready-made reason to visit; a celebratory unlock message plus one reminder about two weeks later lifts redemption without feeling pushy.",
  trigger_text="Points cross a prize's cost", timing_text="Right away · 14 days later if nothing redeemed", channels=["email"],
  reward_text="The prize they unlocked",
  nodes=[N("n1","t.event","Points cross a prize's cost",0,0,events=["reward.unlocked"]),
         M("n2","Email: you unlocked it",0,140,when="Right away",
           subject="🎉 You unlocked {{offer_name}}, {{first_name}}!",
           preheader="It's ready at the prize counter on your next visit.",
           heading="You unlocked {{offer_name}}!",
           body="Tap Redeem in the app, then show your code at the counter on your next visit.",
           cta_label="Redeem it",cta_path="/app/rewards",cta_redeem=True),
         N("n3","w.wait","Wait 14 days",0,280,minutes=14*D),
         N("n4","c.redeemed","Redeemed anything?",0,420,within_days=14),
         N("n5","w.exit","End: redeemed",-300,560,reason="converted"),
         M("n6","Email: prizes waiting",0,560,when="14 days later, if nothing redeemed",
           subject="Your prizes are waiting at {{business}}",
           preheader="Points don't do much sitting in the app.",
           heading="Don't leave them on the shelf",
           body="Points don't do much sitting in the app. Take a look at what yours get you, tap Redeem, then show the code at the counter.",
           cta_label="See my prizes",cta_path="/app/rewards"),
         N("n7","w.exit","End",0,700)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4"),E("n4","n5","yes"),E("n4","n6","no"),E("n6","n7")]))

S.append(dict(key="fe.reward_expiring", grp="rewards", name="Prize expiring soon", family="fe.reward_expiring", reentry=1,
  why="A prize a player already redeemed in the app but hasn't picked up at the counter gets one email three days before it expires, so nothing goes to waste.",
  research="Expiry reminders create natural urgency; an email a few days out leaves time to plan a visit, and the last-48-hours push catches the rest.",
  trigger_text="A redeemed prize expires in 3 days", timing_text="Checked daily · 3 days before", channels=["email"],
  reward_text="The prize they already redeemed",
  nodes=[N("n1","t.event","Prize expires in 3 days",0,0,events=["reward.expiring"]),
         M("n2","Email: pick it up",0,140,when="3 days before it expires",
           subject="Your {{offer_name}} expires {{due_date}}",
           preheader="Show your code at the counter before then.",
           heading="Pick it up before {{due_date}}",
           body="Your {{offer_name}} is saved in the app until {{due_date}}. Show your code at the counter on your next visit and it's yours.",
           cta_label="Show my code",cta_path="/app/rewards"),
         N("n3","w.exit","End",0,280)],
  edges=[E("n1","n2"),E("n2","n3")]))

# ───────── AFTER THE VISIT ─────────
S.append(dict(key="fe.review", grp="after_visit", name="Google review for points", family="fe.review", reentry=120,
  why="The day after a visit, while the fun is fresh, players who haven't reviewed you get one ask with your review points. Then never again for 4 months. Points land when the desk verifies it.",
  research="Review requests within a day of the visit get the best response; a single email ask beats repeated pushes, and more than two asks hurts goodwill.",
  trigger_text="Someone checks in, no review yet", timing_text="The next day · max 1 every 4 months", channels=["email"],
  reward_text="Your review points, added when the review is verified",
  nodes=[N("n1","t.event","Checked in, no review yet",0,0,events=["checkin.recorded"],
           entry_if=[{"type":"c.feature","config":{"feature":"reviews"}},{"type":"c.reviewed","negate":True}]),
         N("n2","w.wait","Wait 1 day",0,140,minutes=D),
         N("n3","c.reviewed","Already reviewed?",0,280),
         N("n4","w.exit","End",-300,420),
         M("n5","Email: review for points",0,420,when="The day after the visit",bonus_from="rule:review",
           subject="Got 30 seconds? Get +{{bonus}} points",
           preheader="A quick Google review, and the points are yours.",
           heading="How was your visit?",
           body="If you had fun at {{business}}, a quick Google review helps other families find us.\n\nOnce it's verified we'll add {{bonus}} points to your card.",
           cta_label="Leave a review",cta_path="/app/rewards?focus=review",
           footnote="+{{bonus}} points when your review is verified"),
         N("n6","w.exit","End",0,560)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4","yes"),E("n3","n5","no"),E("n5","n6")]))

S.append(dict(key="fe.referral", grp="after_visit", name="Bring your crew", family="fe.referral", reentry=90,
  why="Regulars are the best source of new players. From the third visit on, the day after a visit, they get one nudge to share their invite link. Both people get points.",
  research="Referral asks work best right after a good time and with a two-sided reward; regulars (3+ visits) refer far more than first-timers.",
  trigger_text="A check-in by someone with 3+ visits", timing_text="The next day · max 1 every 3 months", channels=["email"],
  reward_text="Your referral points for both people",
  nodes=[N("n1","t.event","Regular checks in",0,0,events=["checkin.recorded"],
           entry_if=[{"type":"c.feature","config":{"feature":"referrals"}},{"type":"c.visit_count","config":{"op":"gte","value":3}}]),
         N("n2","w.wait","Wait 1 day",0,140,minutes=D),
         M("n3","Email: bring a friend",0,280,when="The day after",bonus_from="rule:referral_referrer",
           subject="Bring a friend, you both get points",
           preheader="+{{bonus}} for you, +{{friend_bonus}} for them.",
           heading="More players, more points",
           body="Know someone who'd love {{business}}? Share your invite link from the app.\n\nWhen they join and check in, you get {{bonus}} points and they get {{friend_bonus}}.",
           cta_label="Get my invite link",cta_path="/app/rewards?focus=refer",
           footnote="+{{bonus}} points for you, +{{friend_bonus}} for your friend"),
         N("n4","w.exit","End",0,420)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4")]))

# ───────── BRING THEM BACK ─────────
S.append(dict(key="fe.winback", grp="come_back", name="We miss you", family="fe.winback", reentry=60,
  why="Players who haven't been in for 45 days get a friendly email with their points, then a comeback bonus two weeks later if they still haven't visited. The bonus only lands if they actually check in.",
  research="Win-back works best as a short sequence with the incentive in the second touch and a clear deadline; for entertainment venues most regulars visit every 2-4 weeks, so 45 days is a real lapse.",
  trigger_text="No visit in 45 days", timing_text="Day 45 · day 59 with a bonus", channels=["email"],
  reward_text="+1,000 points if they check in within 2 weeks of the bonus email",
  nodes=[N("n1","t.event","No visit in 45 days",0,0,events=["inactivity.45"],entry_if=[{"type":"c.booked_ahead","negate":True}]),
         M("n2","Email: we miss you",0,140,when="Day 45",
           subject="The cages miss you, {{first_name}}",
           preheader="Your {{points}} points are still here.",
           heading="It's been {{days_since_last_visit}} days!",
           body="Your {{points}} points are still on your card, and the prize counter is stocked. Swing by for a round, a game or a slice.",
           cta_label="Book a cage",cta_path="/app/book"),
         N("n3","w.wait","Wait 14 days",0,280,minutes=14*D),
         N("n4","c.since_entry","Back or booked?",0,420,events=BACK),
         N("n5","w.exit","End: came back",-300,560,reason="converted"),
         M("n6","Email: comeback bonus",0,560,when="Day 59, if not back",bonus_from="node:n8",
           subject="A comeback bonus for you: +{{bonus}} points",
           preheader="Check in within 2 weeks and they're yours.",
           heading="Come back, score +{{bonus}} points",
           body="Check in at {{business}} in the next 2 weeks and we'll add {{bonus}} bonus points to your card, on top of everything you earn that day.",
           cta_label="Plan my visit",cta_path="/app/book",
           footnote="+{{bonus}} bonus points when you check in within 14 days"),
         N("n7","w.until","Checked in within 2 weeks?",0,700,timeout_minutes=14*D,condition={"type":"c.since_entry","config":{"events":["checkin.recorded","booking.completed"]}}),
         N("n8","a.points","Award +1,000 points",-300,840,points=1000,note="Comeback bonus"),
         N("n9","w.exit","End",0,840)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4"),E("n4","n5","yes"),E("n4","n6","no"),E("n6","n7"),E("n7","n8","yes"),E("n7","n9","no"),E("n8","n5")]))

# ───────── PARTIES & BIRTHDAYS ─────────
S.append(dict(key="fe.party_planner", grp="celebrate", name="Birthday party planner", family="fe.party", reentry=300,
  why="Three weeks before a member's birthday they get one email inviting them to throw the party with you. Party bookings are your biggest tickets, and weekends fill early.",
  research="Most birthday parties are booked 2-4 weeks ahead; an invitation in that window, before they pick a venue, is the single most valuable message an entertainment center sends.",
  trigger_text="A member's birthday is 3 weeks away", timing_text="21 days before · checked daily", channels=["email"],
  reward_text=None,
  nodes=[N("n1","t.event","Birthday in 3 weeks",0,0,events=["birthday.soon"],entry_if=[{"type":"c.booked_ahead","negate":True}]),
         M("n2","Email: party invite",0,140,when="21 days before the birthday",
           subject="{{first_name}}, your birthday's coming up 🎂",
           preheader="Party room, cages, arcade and pizza. We'll handle the fun.",
           heading="Party at {{business}}?",
           body="Your birthday is about 3 weeks away. Party room, batting cages, arcade and pizza: we handle the fun, you bring the crew.\n\nWeekends go fast, so grab your spot early.",
           cta_label="Plan my party",cta_path="/app/book?section=party"),
         N("n3","w.exit","End",0,280)],
  edges=[E("n1","n2"),E("n2","n3")]))

S.append(dict(key="fe.birthday", grp="celebrate", name="Happy birthday", family="fe.birthday", reentry=300,
  why="On their birthday, members get a birthday email with their points and prizes. Your birthday gift offer (if you have one) still arrives in the app as before.",
  research="Birthday emails have some of the highest open and redemption rates of any automated email.",
  trigger_text="The member's birthday", timing_text="On the day (morning, local time)", channels=["email"],
  reward_text="Your birthday gift offer, if you have one",
  nodes=[N("n1","t.event","Birthday",0,0,events=["birthday"]),
         M("n2","Email: happy birthday",0,140,when="On the day",
           subject="Happy birthday, {{first_name}}! 🎉",
           preheader="Come celebrate with us this week.",
           heading="Happy birthday from {{business}}!",
           body="Come celebrate with us this week. Your points are waiting, and so is the prize counter.",
           cta_label="See my prizes",cta_path="/app/rewards"),
         N("n3","w.exit","End",0,280)],
  edges=[E("n1","n2"),E("n2","n3")]))

PATHS = {"/app/rewards", "/app/book", "/app/rewards?focus=review", "/app/rewards?focus=refer", "/app/book?section=party"}

out = []
for i, s in enumerate(S):
    d = {k: v for k, v in s.items() if k not in ("nodes", "edges")}
    d.setdefault("engine", "workflow"); d["sort"] = i + 1; d["niche"] = "entertainment"
    d["graph"] = {"nodes": s["nodes"], "edges": s["edges"]}
    ids = {n["id"] for n in s["nodes"]}
    for e in s["edges"]:
        assert e["from"] in ids and e["to"] in ids, (s["key"], e)
    assert len({e["id"] for e in s["edges"]}) == len(s["edges"]), s["key"]
    for n in s["nodes"]:
        c = n["config"]
        if n["type"] == "a.email":
            assert c.get("cta_path") in PATHS, (s["key"], n["id"], c.get("cta_path"))
            assert c.get("gate") == "venue" and c.get("template") == "arcade", (s["key"], n["id"])
            assert len(c["subject"]) <= 150 and len(c.get("heading", "")) <= 150
            src = c.get("bonus_from") or ""
            if src.startswith("node:"):
                assert src[5:] in ids, (s["key"], src)
        t = " ".join(str(c.get(k, "")) for k in ("title", "body", "subject"))
        assert t.count("🎉") <= 1
    out.append(d)
j = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
assert "$cat$" not in j
HERE = os.path.dirname(os.path.abspath(__file__))
NL = chr(10)
sql = NL.join([
    "-- CP-261 · catalog generated by gen/venue_defs.py — the entertainment venue email journeys. Do not hand-edit.",
    "create or replace function public.wf_venue_catalog() returns jsonb language sql immutable set search_path = public as $cat$",
    "select '" + j.replace("'", "''") + "'::jsonb;",
    "$cat$;",
    "revoke all on function public.wf_venue_catalog() from public, anon, authenticated;",
    ""])
io.open(os.path.join(HERE, "..", "01_catalog.sql"), "w", encoding="utf-8", newline=NL).write(sql)

# The same list for the venue desk: shown read-only (and previewable) before the SQL is applied.
def msgs(d):
    g = d["graph"]
    pts = {n["id"]: n["config"].get("points") for n in g["nodes"]}
    res = []
    for n in g["nodes"]:
        if n["type"] != "a.email": continue
        c = n["config"]; src = c.get("bonus_from") or ""
        res.append({k: v for k, v in {
            "node_id": n["id"], "channel": "email", "label": n["label"], "when_text": c.get("when"),
            "subject": c.get("subject"), "preheader": c.get("preheader"), "heading": c.get("heading"), "body": c.get("body"),
            "cta_label": c.get("cta_label"), "cta_path": c.get("cta_path"), "footnote": c.get("footnote"), "template": c.get("template"),
            "cta_redeem": True if c.get("cta_redeem") else None,
            "points": pts.get(src[5:]) if src.startswith("node:") else None,
            "points_rule": src[5:] if src.startswith("rule:") else None,
        }.items() if v is not None})
    return res
app = [{"key": d["key"], "grp": d["grp"], "name": d["name"], "why": d.get("why") or "", "trigger_text": d["trigger_text"], "timing_text": d["timing_text"],
        "channels": d["channels"], "reward_text": d.get("reward_text"), "engine": d["engine"], "messages": msgs(d)} for d in out]
rows = ["  " + json.dumps(a, ensure_ascii=False, separators=(",", ":")) for a in app]
io.open(os.path.join(HERE, "..", "..", "..", "..", "apps", "venues", "lib", "automations", "venue-suite-catalog.json"), "w", encoding="utf-8", newline=NL).write(
    "[" + NL + ("," + NL).join(rows) + NL + "]" + NL)
print(f"{len(out)} journeys -> 01_catalog.sql + apps/venues/lib/automations/venue-suite-catalog.json")
