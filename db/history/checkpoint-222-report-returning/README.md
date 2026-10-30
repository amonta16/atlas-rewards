# CP-222 · monthly report: real "returning members"

Bug: `_report_core` counted a member as returning only if they had a visit BEFORE the month began, so a
business in its first month (Flippo's, live Sep 28) always showed 0, even for members who came in several
times in October. Visits also ignored desk check-ins although the KPI says "check-ins and purchases".

Fix (`01_report_core.sql`, migration `cp222_report_returning_members`):
- visits = one per member per local day, from purchases/visit points, check-ins and med spa treatments;
- returning = visited this period AND has visits on 2+ different days (any time up to the period end).

Flippo's October to date: returning 0 → 3 of 19 active, visits 23 → 22 (same-day purchase + check-in = one visit).
Copy: "X% of members who came in came back · N of M have visited on two or more different days".
