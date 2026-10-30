"""CP-217 suite definitions -> SQL (wf_suite_catalog()). Run: python3 gen/suite_defs.py > 04a_catalog.sql"""
import json

def N(id, type, label, x, y, **cfg):
    return {"id": id, "type": type, "label": label, "position": {"x": x, "y": y}, "config": cfg}
def E(a, b, br=None):
    return {"id": f"e_{a}_{b}" + (f"_{br}" if br else ""), "from": a, "to": b, "branch": br}
D, H = 1440, 60
BACK = ["visit.completed", "checkin.recorded", "booking.created"]

S = []

# ───────── GET THEM IN ─────────
S.append(dict(key="ms.welcome", grp="get_in", name="New patient welcome", family="ms.welcome", reentry=365,
  why="New members decide in the first week whether the app is worth opening. A welcome, a how-it-works email and two gentle nudges to book turn sign-ups into first visits.",
  research="Welcome series are the highest-engagement automated messages in retail and wellness (open rates 2-3x a normal campaign). Best practice: send immediately, educate on day 1, ask for the booking by day 3, add the incentive around day 7.",
  trigger_text="A patient joins the app", timing_text="Now · day 1 · day 3 · day 7", channels=["push","email"],
  reward_text="Signup bonus and first-visit bonus (your point rules)",
  nodes=[N("n1","t.signup","Patient joins the app",0,0),
         N("n2","w.stop_on_convert","Goal: books a visit",0,140,goal="booking"),
         N("n3","a.push","Push: welcome",0,280,when="Right away",title="Welcome to {{business}}, {{first_name}}",
           body="Your rewards account is ready. You earn points on every visit, and your welcome gift is waiting in the app.",link_path="/app"),
         N("n4","w.wait","Wait 1 day",0,420,minutes=D),
         N("n5","a.email","Email: how the app works",0,560,when="Day 1",subject="How your {{business}} app works",
           preheader="Points, rewards, the shop and your aftercare, all in one place.",heading="Everything in one place, {{first_name}}",
           body="Here's what your app does for you.\n\nEarn points on every visit and purchase, then trade them for treatments and skincare.\n\nBrowse treatments and packages in the shop, and split bigger purchases into smaller payments where it's offered.\n\nAfter each visit, your aftercare and the date you're due next show up in My care.",
           cta_label="Open the app",cta_path="/app"),
         N("n6","w.wait","Wait 2 days",0,700,minutes=2*D),
         N("n7","c.since_entry","Booked or visited?",0,840,events=["booking.created","visit.completed"]),
         N("n8","w.exit","End: booked",-300,980,reason="converted"),
         N("n9","a.push","Push: book your first visit",0,980,when="Day 3, if not booked",title="Ready for your first visit?",
           body="Pick a time that works for you. Your first-visit points land as soon as you check in.",link_path="/app/book"),
         N("n10","w.wait","Wait 4 days",0,1120,minutes=4*D),
         N("n11","c.since_entry","Booked yet?",0,1260,events=["booking.created","visit.completed"]),
         N("n12","a.email","Email: first-visit bonus",0,1400,when="Day 7, if not booked",bonus_from="rule:first_visit_bonus",
           subject="+{{bonus}} points on your first visit",preheader="A little thank-you for choosing {{business}}.",heading="Your first-visit bonus is waiting",
           body="Hi {{first_name}},\n\nBook your first treatment and we'll add {{bonus}} bonus points when you check in, on top of the points you earn for the visit.\n\nNot sure where to start? Give us a call and we'll help you choose.",
           cta_label="Book your visit",cta_path="/app/book",footnote="+{{bonus}} points on your first visit"),
         N("n13","w.exit","End",0,1540)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4"),E("n4","n5"),E("n5","n6"),E("n6","n7"),E("n7","n8","yes"),E("n7","n9","no"),
         E("n9","n10"),E("n10","n11"),E("n11","n8","yes"),E("n11","n12","no"),E("n12","n13")]))

S.append(dict(key="ms.app_checkin", grp="get_in", name="New in the app", family="ms.app_checkin", reentry=15,
  why="When you add a featured treatment, a new reward or a post, members who haven't opened the app in two weeks get one short heads-up. Active members aren't bothered.",
  research="Content-triggered nudges re-engage lapsed app users without discounting. Limiting them to inactive users and to about two a month keeps opt-outs low.",
  trigger_text="You post something new (featured shop item, reward or news)", timing_text="Within the hour · max 2 a month", channels=["push"],
  reward_text=None,
  nodes=[N("n1","t.event","Something new is posted",0,0,events=["content.published"],
           entry_if=[{"type":"c.app_active","config":{"within_days":14},"negate":True}]),
         N("n2","w.wait","Wait 1 hour",0,140,minutes=H),
         N("n3","a.push","Push: new in the app",0,280,when="Within the hour",title="New at {{business}}: {{offer_name}}",
           body="Tap to see what's new, {{first_name}}.",link_path="{{link|/app}}"),
         N("n4","w.exit","End",0,420)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4")]))

# ───────── CONVERT ─────────
S.append(dict(key="ms.cart_recovery", grp="convert", name="Finish your order", family="ms.cart", reentry=14,
  why="Someone opened checkout for a package or product and didn't pay. Three touches bring a real share of them back, and the bonus only appears on the last one so you don't train people to wait.",
  research="Abandoned-checkout flows recover the most revenue of any automation. 3 touches at about 2h, 24h and 72h, with a longer first delay for high-ticket items and the incentive held for the final touch (Klaviyo / Shopify guidance).",
  trigger_text="Checkout started, not paid", timing_text="2 hours · 24 hours · 72 hours", channels=["push","email"],
  reward_text="+200 points if they pay within 48 hours of the last message",
  nodes=[N("n1","t.event","Checkout started",0,0,events=["checkout.started"]),
         N("n2","w.wait","Wait 2 hours",0,140,minutes=2*H),
         N("n3","c.since_entry","Order finished?",0,280,events=["order.paid","order.reserved"]),
         N("n4","w.exit","End: ordered",-300,420,reason="converted"),
         N("n5","a.push","Push: still thinking?",0,420,when="2 hours after checkout",title="Still thinking about {{item}}?",
           body="It's saved for you, {{first_name}}. Questions about results or downtime? Our team is happy to help.",link_path="/app/shop"),
         N("n6","w.wait","Wait 22 hours",0,560,minutes=22*H),
         N("n7","c.since_entry","Order finished?",0,700,events=["order.paid","order.reserved"]),
         N("n8","a.email","Email: your item is saved",0,840,when="24 hours after checkout",hero="item",
           subject="Your {{item}} is saved",preheader="Pick up where you left off, or spread the cost.",heading="Still deciding on {{item}}?",
           body="Hi {{first_name}},\n\nYou were checking out {{item}}. It's still here whenever you're ready.\n\nPrefer to spread it out? You can pay in 4 interest-free payments with Klarna at checkout.",
           cta_label="Finish my order",cta_path="/app/shop",footnote="Or 4 interest-free payments of {{installment|a smaller amount}} with Klarna"),
         N("n9","w.wait","Wait 2 days",0,980,minutes=2*D),
         N("n10","c.since_entry","Order finished?",0,1120,events=["order.paid","order.reserved"]),
         N("n11","a.push","Push: bonus points",0,1260,when="72 hours after checkout",bonus_from="node:n13",
           title="Finish today, get +{{bonus}} points",body="Complete your {{item}} order in the next 48 hours and we'll add {{bonus}} bonus points.",link_path="/app/shop"),
         N("n12","w.until","Paid within 48 hours?",0,1400,timeout_minutes=2*D,condition={"type":"c.since_entry","config":{"events":["order.paid"]}}),
         N("n13","a.points","Award +200 points",-300,1540,points=200,note="Thanks for finishing your order"),
         N("n14","w.exit","End",0,1680)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4","yes"),E("n3","n5","no"),E("n5","n6"),E("n6","n7"),E("n7","n4","yes"),E("n7","n8","no"),
         E("n8","n9"),E("n9","n10"),E("n10","n4","yes"),E("n10","n11","no"),E("n11","n12"),E("n12","n13","yes"),E("n12","n14","no"),E("n13","n4")]))

S.append(dict(key="ms.browse_reminder", grp="convert", name="Viewed but didn't buy", family="ms.browse", reentry=7,
  why="A patient looked at a treatment or product more than once and left. One friendly reminder a few hours later, never more than once a week, and never if they already checked out or booked.",
  research="Browse-abandonment messages convert at a fraction of cart recovery but at very low cost. One message within a few hours performs best; suppress anyone who bought, booked or is already in cart recovery.",
  trigger_text="Viewed a treatment or product (10+ seconds or twice)", timing_text="3 hours later · max 1 a week", channels=["push"],
  reward_text=None,
  nodes=[N("n1","t.event","Viewed a shop item",0,0,events=["shop.item_viewed"],
           entry_if=[{"type":"c.in_journey","config":{"key":"ms.cart_recovery"},"negate":True}]),
         N("n2","w.wait","Wait 3 hours",0,140,minutes=3*H),
         N("n3","c.since_entry","Checked out or booked?",0,280,events=["checkout.started","order.paid","order.reserved","booking.created"]),
         N("n4","w.exit","End",-300,420),
         N("n5","c.in_journey","In cart recovery?",0,420,key="ms.cart_recovery"),
         N("n6","a.push","Push: still curious?",0,560,when="3 hours after viewing",title="{{item}} at {{business}}",
           body="Still curious? See the details, results and pricing, or book a quick consult.",link_path="/app/shop"),
         N("n7","w.exit","End",0,700)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4","yes"),E("n3","n5","no"),E("n5","n4","yes"),E("n5","n6","no"),E("n6","n7")]))

S.append(dict(key="ms.membership_promo", grp="convert", name="Membership interest", family="ms.membership", reentry=30,
  why="Members visit more and stay longer. When someone looks at your membership, or comes in for a second time without one, they get the value spelled out and a join bonus.",
  research="Med spa memberships lift visit frequency and retention; the best moment to pitch is after interest (viewing the plans) or after the second visit, when the habit is forming.",
  trigger_text="Viewed membership, or 2nd visit as a non-member", timing_text="Day 1 · day 4 (or the day after the 2nd visit)", channels=["push","email"],
  reward_text="+250 points when they join within 2 weeks",
  nodes=[N("n1","t.event","Viewed membership or 2nd visit",0,0,events=["membership.viewed","visit.completed"],
           entry_if=[{"type":"c.paid_member","negate":True},{"on":"visit.completed","type":"c.visit_count","config":{"op":"eq","value":2}}]),
         N("n2","c.entry_event","After their 2nd visit?",0,140,event="visit.completed"),
         N("n3","w.wait","Wait 1 day",-300,280,minutes=D),
         N("n4","a.push","Push: you've been in twice",-300,420,when="Day after the 2nd visit",title="You've been in twice, {{first_name}}",
           body="Members get {{member_value}}. See if it fits how often you visit.",link_path="/app/membership"),
         N("n5","w.wait","Wait 1 day",300,280,minutes=D),
         N("n6","c.paid_member","Joined?",300,420),
         N("n7","a.push","Push: what members get",300,560,when="1 day after viewing",title="What members get at {{business}}",
           body="Members get {{member_value}}. Tap to see the plans.",link_path="/app/membership"),
         N("n8","w.wait","Wait 3 days",300,700,minutes=3*D),
         N("n9","c.paid_member","Joined?",300,840),
         N("n10","a.email","Email: the yearly math",300,980,when="4 days after viewing",bonus_from="node:n12",
           subject="Is a {{business}} membership worth it for you?",preheader="The yearly math, in one minute.",heading="Here's what membership adds up to",
           body="Hi {{first_name}},\n\nMembers get {{member_value}}.\n\nIf you come in every month or two, membership usually pays for itself within the first few visits, and your points keep adding up on top.",
           cta_label="See membership plans",cta_path="/app/membership",footnote="Join in the next 2 weeks and get +{{bonus}} bonus points"),
         N("n11","w.until","Joined within 2 weeks?",0,1120,timeout_minutes=14*D,condition={"type":"c.paid_member","config":{}}),
         N("n12","a.points","Award +250 join bonus",0,1260,points=250,note="Membership welcome bonus"),
         N("n13","w.exit","End: joined",0,1400,reason="converted"),
         N("n14","w.exit","End",300,1260)],
  edges=[E("n1","n2"),E("n2","n3","yes"),E("n2","n5","no"),E("n3","n4"),E("n4","n11"),E("n5","n6"),E("n6","n12","yes"),E("n6","n7","no"),
         E("n7","n8"),E("n8","n9"),E("n9","n12","yes"),E("n9","n10","no"),E("n10","n11"),E("n11","n12","yes"),E("n11","n14","no"),E("n12","n13")]))

# ───────── CARE ─────────
S.append(dict(key="ms.aftercare", grp="care", name="After your treatment", family="ms.aftercare", reentry=1,
  why="Patients feel looked after when aftercare arrives the same day and someone checks in a couple of days later. It also cuts down on worried calls to the front desk.",
  research="Post-treatment care messages within 2 hours, with a check-in at 24-48 hours, are standard in aesthetic practices and raise satisfaction and rebooking.",
  trigger_text="A visit is completed (booking, treatment log or check-in)", timing_text="2 hours · 2 days", channels=["push"],
  reward_text=None,
  nodes=[N("n1","t.event","Visit completed",0,0,events=["visit.completed"]),
         N("n2","w.wait","Wait 2 hours",0,140,minutes=2*H),
         N("n3","a.push","Push: aftercare",0,280,when="2 hours after the visit",title="Aftercare for {{treatment}}",
           body="Your aftercare steps are in the app, {{first_name}}. Questions? Give us a call anytime.",link_path="/app/care"),
         N("n4","w.wait","Wait 2 days",0,420,minutes=2*D),
         N("n5","a.push","Push: how are you feeling?",0,560,when="2 days after the visit",title="How are you feeling after {{treatment}}?",
           body="Most people feel back to normal by now. If anything seems off, call us, we're here to help.",link_path="/app/care"),
         N("n6","w.exit","End",0,700)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4"),E("n4","n5"),E("n5","n6")]))

S.append(dict(key="ms.review", grp="care", name="Google review for points", family="review", reentry=120,
  why="The best time to ask for a review is the same day, while the visit is fresh. One reminder if they didn't get to it, then never again for 4 months. Points land when the desk verifies it.",
  research="Same-day review requests (2-4 hours after the visit) get the highest response; one reminder at 5-7 days adds a meaningful share; more than two asks hurts goodwill.",
  trigger_text="A visit is completed, no review yet", timing_text="3 hours · 6 days later if no review", channels=["push","email"],
  reward_text="Your review points, added when the review is verified",
  nodes=[N("n1","t.event","Visit completed, no review yet",0,0,events=["visit.completed"],
           entry_if=[{"type":"c.feature","config":{"feature":"reviews"}},{"type":"c.reviewed","negate":True}]),
         N("n2","w.wait","Wait 3 hours",0,140,minutes=3*H),
         N("n3","c.reviewed","Already reviewed?",0,280),
         N("n4","w.exit","End",-300,420),
         N("n5","a.push","Push: review for points",0,420,when="3 hours after the visit",bonus_from="rule:review",
           title="Loved your visit? Review us, get +{{bonus}} pts",body="A quick Google review helps others find us. We'll add {{bonus}} points once it's verified.",
           link_path="/app/rewards?focus=review"),
         N("n6","w.wait","Wait 6 days",0,560,minutes=6*D),
         N("n7","c.reviewed","Reviewed now?",0,700),
         N("n8","a.email","Email: a quick favor",0,840,when="6 days later, if no review",bonus_from="rule:review",
           subject="A quick favor, {{first_name}}?",preheader="30 seconds, and +{{bonus}} points for you.",heading="How was your visit?",
           body="Hi {{first_name}},\n\nIf you were happy with your visit, a short Google review means a lot to us, and it helps other people feel confident choosing {{business}}.\n\nOnce it's verified we'll add {{bonus}} points to your account.",
           cta_label="Leave a review",cta_path="/app/rewards?focus=review",footnote="+{{bonus}} points when your review is verified"),
         N("n9","w.exit","End",0,980)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4","yes"),E("n3","n5","no"),E("n5","n6"),E("n6","n7"),E("n7","n4","yes"),E("n7","n8","no"),E("n8","n9")]))

S.append(dict(key="ms.rebook", grp="care", name="Time for your next treatment", family="ms.rebook", reentry=7,
  why="Results fade on a schedule. Patients get a heads-up 10 days before their treatment is due, a reminder on the day, and a bonus if they're two weeks late. It stops the moment they book.",
  research="Recall reminders 1-2 weeks before the due date drive most rebookings (neurotoxin ~12 weeks, filler 6-12 months, HydraFacial and peels 4-6 weeks, laser and body 4-8 weeks). Stop immediately on booking.",
  trigger_text="A logged treatment is due in 10 days (from its recall weeks)", timing_text="10 days before · due date · 2 weeks after", channels=["push","email"],
  reward_text="+150 points if they book within 7 days of the last reminder",
  nodes=[N("n1","t.recall","Treatment due in 10 days",0,0),
         N("n2","c.booked_ahead","Already booked?",0,140),
         N("n3","w.exit","End",-300,280),
         N("n4","a.push","Push: due soon",0,280,when="10 days before it's due",title="Your {{treatment}} is due soon",
           body="You're due around {{due_date}}. Book now to keep your results on track, {{first_name}}.",link_path="/app/book"),
         N("n5","w.at","Wait until the due date",0,420,anchor="due_at",offset_minutes=0,late_minutes=D),
         N("n6","c.since_entry","Booked?",0,560,events=["booking.created"]),
         N("n7","w.exit","End: booked",-300,700,reason="converted"),
         N("n8","a.email","Email: due today",0,700,when="On the due date",
           subject="Your {{treatment}} is due",preheader="Keep your results going.",heading="Time for your next {{treatment}}",
           body="Hi {{first_name}},\n\nIt's about time for your next {{treatment}}. Staying on schedule is the easiest way to keep your results looking their best.\n\nPick a time that suits you, it only takes a minute.",
           cta_label="Book my appointment",cta_path="/app/book"),
         N("n9","w.at","Wait until 2 weeks past due",0,840,anchor="due_at",offset_minutes=14*D,late_minutes=D),
         N("n10","c.since_entry","Booked?",0,980,events=["booking.created"]),
         N("n11","a.push","Push: bonus to book",0,1120,when="2 weeks after it's due, if not booked",bonus_from="node:n13",
           title="Book this week, get +{{bonus}} pts",body="Your {{treatment}} is a little overdue. Book in the next 7 days and we'll add {{bonus}} bonus points.",link_path="/app/book"),
         N("n12","w.until","Booked within 7 days?",0,1260,timeout_minutes=7*D,condition={"type":"c.since_entry","config":{"events":["booking.created"]}}),
         N("n13","a.points","Award +150 points",-300,1400,points=150,note="Thanks for booking your next visit"),
         N("n14","w.exit","End",0,1400)],
  edges=[E("n1","n2"),E("n2","n3","yes"),E("n2","n4","no"),E("n4","n5"),E("n5","n6","yes"),E("n5","n6","no"),E("n6","n7","yes"),E("n6","n8","no"),
         E("n8","n9"),E("n9","n10","yes"),E("n9","n10","no"),E("n10","n7","yes"),E("n10","n11","no"),E("n11","n12"),E("n12","n13","yes"),E("n12","n14","no"),E("n13","n7")]))

S.append(dict(key="ms.appointment_reminder", grp="care", name="Appointment reminders", family="booking", reentry=0,
  why="Two reminders cut no-shows, and anyone who cancels or misses gets a kind nudge to pick a new time the next day. Reminders are service messages, so they don't count toward the weekly limit.",
  research="Reminders at 24 hours and 2 hours before reduce no-shows by roughly a third in appointment businesses; a next-day rebooking nudge recovers many cancellations.",
  trigger_text="Booking confirmed, cancelled or missed", timing_text="24 hours before · 2 hours before · day after a cancel", channels=["push"],
  reward_text=None,
  nodes=[N("n1","t.event","Booking confirmed / cancelled / missed",0,0,events=["booking.confirmed","booking.cancelled","booking.no_show"]),
         N("n2","c.entry_event","Confirmed?",0,140,event="booking.confirmed"),
         N("n3","w.at","24 hours before",-300,280,anchor="booking",offset_minutes=-D,late_minutes=600),
         N("n4","a.push","Push: see you tomorrow",-300,420,when="24 hours before",transactional=True,title="See you tomorrow, {{first_name}}",
           body="Your {{treatment}} at {{business}} is {{appt_time}}. Need to move it? Let us know as soon as you can.",link_path="/app/book"),
         N("n5","w.at","2 hours before",-300,560,anchor="booking",offset_minutes=-120,late_minutes=60),
         N("n6","a.push","Push: see you soon",-300,700,when="2 hours before",transactional=True,title="See you soon",
           body="Your appointment at {{business}} is in about 2 hours. Your prep notes are in the app.",link_path="/app/care"),
         N("n7","w.exit","End",-300,840),
         N("n11","c.since_entry","Cancelled?",-600,420,events=["booking.cancelled","booking.no_show"]),
         N("n12","c.since_entry","Cancelled?",-600,700,events=["booking.cancelled","booking.no_show"]),
         N("n8","w.wait","Wait 1 day",300,280,minutes=D),
         N("n9","c.since_entry","Rebooked?",300,420,events=["booking.created"]),
         N("n10","a.push","Push: new time",300,560,when="1 day after a cancellation or no-show",title="Let's find you a new time",
           body="Sorry we missed you, {{first_name}}. Pick a new time whenever it suits you.",link_path="/app/book"),
         N("n13","w.exit","End",300,700)],
  edges=[E("n1","n2"),E("n2","n3","yes"),E("n2","n8","no"),E("n3","n4","yes"),E("n3","n11","no"),E("n11","n8","yes"),E("n11","n5","no"),
         E("n4","n5"),E("n5","n6","yes"),E("n5","n12","no"),E("n12","n8","yes"),E("n12","n7","no"),E("n6","n7"),
         E("n8","n9"),E("n9","n13","yes"),E("n9","n10","no"),E("n10","n13")]))

# ───────── COME BACK ─────────
S.append(dict(key="ms.winback", grp="come_back", name="We miss you", family="winback", reentry=60,
  why="Patients who haven't been in for 90 days get three warm touches and a time-limited gift, then a 'lapsed' tag at 180 days so you can see who's slipping. Paying members get a softer version at 35 days.",
  research="Win-back works best as a short sequence around day 90 (about day 90, 105 and 120) with the incentive in the middle touch and a clear deadline; members lapsing at ~35 days are worth catching early.",
  trigger_text="No visit in 90 days (35 days for paying members)", timing_text="Day 90 · 105 · 119 · tag at 180  (members: day 35 · 45)", channels=["push","email"],
  reward_text="+200 points if they visit within 2 weeks of the gift email",
  nodes=[N("n1","t.event","No visit in 90 days (members: 35)",0,0,events=["inactivity.35","inactivity.90"],
           entry_if=[{"on":"inactivity.35","type":"c.paid_member"},{"on":"inactivity.90","type":"c.paid_member","negate":True},{"type":"c.booked_ahead","negate":True}]),
         N("n2","c.entry_event","Paying member?",0,140,event="inactivity.35"),
         N("n3","a.push","Push: perks waiting",-340,280,when="Members: day 35",title="Your member perks are waiting, {{first_name}}",
           body="It's been a little while. Your member pricing and benefits are ready whenever you are.",link_path="/app/book"),
         N("n4","w.wait","Wait 10 days",-340,420,minutes=10*D),
         N("n5","c.since_entry","Back or booked?",-340,560,events=BACK),
         N("n6","a.email","Email: saving your spot",-340,700,when="Members: day 45",
           subject="Saving your spot, {{first_name}}",preheader="Your member benefits are ready to use.",heading="We'd love to see you",
           body="Hi {{first_name}},\n\nJust a friendly note that your membership benefits are ready to use. Regular visits are what keep results looking their best, and booking takes less than a minute.\n\nIf your schedule has been busy, give us a call and we'll find a time that works.",
           cta_label="Book a visit",cta_path="/app/book"),
         N("n7","w.exit","End",-340,840),
         N("n8","a.push","Push: it's been a while",300,280,when="Day 90",title="{{first_name}}, it's been a while",
           body="It's been {{days_since_last_visit}} days since your last visit. Your results last longer with a touch-up, and your points are still here.",link_path="/app/book"),
         N("n9","w.wait","Wait 15 days",300,420,minutes=15*D),
         N("n10","c.since_entry","Back or booked?",300,560,events=BACK),
         N("n11","a.email","Email: welcome-back gift",300,700,when="Day 105",bonus_from="node:n15",
           subject="A welcome-back gift for you",preheader="+{{bonus}} points when you visit in the next 2 weeks.",heading="We saved something for you, {{first_name}}",
           body="Hi {{first_name}},\n\nWe miss seeing you at {{business}}. Come in for any treatment in the next 2 weeks and we'll add {{bonus}} bonus points to your account, on top of your usual points.",
           cta_label="Book my visit",cta_path="/app/book",footnote="+{{bonus}} points when you visit in the next 2 weeks"),
         N("n12","w.until","Visited within 2 weeks?",300,840,timeout_minutes=14*D,condition={"type":"c.since_entry","config":{"events":["visit.completed","checkin.recorded"]}}),
         N("n13","a.push","Push: gift expires soon",600,980,when="Day 119",bonus_from="node:n15",title="Your gift expires in 2 days",
           body="Visit in the next 2 days and your {{bonus}} bonus points are yours, {{first_name}}.",link_path="/app/book"),
         N("n14","w.until","Visited in time?",600,1120,timeout_minutes=2*D,condition={"type":"c.since_entry","config":{"events":["visit.completed","checkin.recorded"]}}),
         N("n15","a.points","Award +200 points",300,1260,points=200,note="Welcome back gift"),
         N("n16","w.exit","End: came back",0,1400,reason="converted"),
         N("n17","w.wait","Wait until day 180",600,1260,minutes=59*D),
         N("n18","c.since_entry","Back or booked?",600,1400,events=BACK),
         N("n19","a.tag","Tag: lapsed",900,1540,tag="lapsed"),
         N("n20","w.exit","End",600,1680)],
  edges=[E("n1","n2"),E("n2","n3","yes"),E("n2","n8","no"),E("n3","n4"),E("n4","n5"),E("n5","n7","yes"),E("n5","n6","no"),E("n6","n7"),
         E("n8","n9"),E("n9","n10"),E("n10","n16","yes"),E("n10","n11","no"),E("n11","n12"),E("n12","n15","yes"),E("n12","n13","no"),
         E("n13","n14"),E("n14","n15","yes"),E("n14","n17","no"),E("n15","n16"),E("n17","n18"),E("n18","n20","yes"),E("n18","n19","no"),E("n19","n20")]))

S.append(dict(key="ms.reward_ready", grp="come_back", name="Reward unlocked", family="ms.reward_ready", reentry=30,
  why="The moment points cover a reward, the patient gets the 'you unlocked' push (your existing automation). If it's still unused two weeks later, one reminder gives them a reason to come in.",
  research="Unredeemed rewards are a ready-made reason to visit; a single reminder about two weeks after unlocking lifts redemption without feeling pushy.",
  trigger_text="Points cover a reward", timing_text="Right away (existing push) · 14 days later if unused", channels=["push"],
  reward_text="The reward they unlocked",
  nodes=[N("n1","t.points","Points cover a reward",0,0,entry_if=[{"type":"c.can_afford"}]),
         N("n2","w.wait","Wait 14 days",0,140,minutes=14*D),
         N("n3","c.redeemed","Redeemed?",0,280,within_days=14),
         N("n4","w.exit","End: redeemed",-300,420,reason="converted"),
         N("n5","c.can_afford","Still has enough points?",0,420),
         N("n6","a.push","Push: reward waiting",0,560,when="14 days after unlocking, if unused",title="Your {{offer_name}} is waiting",
           body="You have {{points}} points, enough for {{offer_name}}. Redeem it in the app before your next visit.",link_path="/app/rewards"),
         N("n7","w.exit","End",0,700)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4","yes"),E("n3","n5","no"),E("n5","n6","yes"),E("n5","n7","no"),E("n6","n7")]))

# ───────── CELEBRATE ─────────
S.append(dict(key="ms.birthday", grp="celebrate", name="Birthday", family="birthday", reentry=None, engine="legacy",
  why="On their birthday, patients get birthday points and your birthday gift card in the app. It runs on your existing birthday automations.",
  research="Birthday messages have some of the highest open and redemption rates of any automated message.",
  trigger_text="The patient's birthday", timing_text="On the day (checked hourly, local time)", channels=["push"],
  reward_text="Birthday points (your point rules) + the birthday gift card"))

S.append(dict(key="ms.referral", grp="celebrate", name="Bring a friend", family="ms.referral", reentry=90,
  why="Happy patients are the best source of new ones. Right after a verified review or a third visit, when they're most enthusiastic, they get a nudge to share their link.",
  research="Referral asks perform best right after a moment of satisfaction (a positive review or a repeat visit), with a two-sided reward.",
  trigger_text="A verified review, or the 3rd visit", timing_text="The next day", channels=["push"],
  reward_text="Your referral points for both people",
  nodes=[N("n1","t.event","Verified review or 3rd visit",0,0,events=["review.verified","visit.completed"],
           entry_if=[{"type":"c.feature","config":{"feature":"referrals"}},{"on":"visit.completed","type":"c.visit_count","config":{"op":"eq","value":3}}]),
         N("n2","w.wait","Wait 1 day",0,140,minutes=D),
         N("n3","a.push","Push: bring a friend",0,280,when="The day after",bonus_from="rule:referral_referrer",
           title="Give a friend +{{friend_bonus}} pts, get +{{bonus}} pts",
           body="Know someone who'd love {{business}}? Share your link from the app. When they come in, you both get points.",link_path="/app/rewards?focus=earn"),
         N("n4","w.exit","End",0,420)],
  edges=[E("n1","n2"),E("n2","n3"),E("n3","n4")]))

S.append(dict(key="ms.points_expiring", grp="celebrate", name="Gifts about to expire", family=None, reentry=None, engine="legacy",
  why="When a saved gift or reward is about to expire, the patient gets a reminder so nothing goes to waste. Runs on your existing expiry reminders.",
  research="Expiry reminders create natural urgency; one reminder in the last 48 hours is enough.",
  trigger_text="A saved gift expires in under 48 hours", timing_text="Checked hourly", channels=["push"],
  reward_text=None))

out = []
for i, s in enumerate(S):
    d = {k: v for k, v in s.items() if k not in ("nodes", "edges")}
    d.setdefault("engine", "workflow"); d["sort"] = i + 1
    if "nodes" in s:
        d["graph"] = {"nodes": s["nodes"], "edges": s["edges"]}
        ids = {n["id"] for n in s["nodes"]}
        for e in s["edges"]:
            assert e["from"] in ids and e["to"] in ids, (s["key"], e)
        assert len({e["id"] for e in s["edges"]}) == len(s["edges"]), s["key"]
        for n in s["nodes"]:
            t = " ".join(str(n["config"].get(k, "")) for k in ("title","body","subject"))
            assert t.count("🎉") <= 1
    out.append(d)
j = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
assert "$cat$" not in j
print("-- CP-217 · 04a generated by gen/suite_defs.py — the 14 journeys (copy, timing, graphs). Do not hand-edit.")
print("create or replace function public.wf_suite_catalog() returns jsonb language sql immutable set search_path = public as $cat$")
print("select '" + j.replace("'", "''") + "'::jsonb;")
print("$cat$;")
