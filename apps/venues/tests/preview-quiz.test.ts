/**
 * tests/preview-quiz.test.ts — CP-234 · the steps after the contact form:
 * pre-ticking "What do you offer?" from their website, and the server-side
 * answer checks. Run: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CHALLENGES, MIN_OFFERED, OFFER_IDS, PRIORITIES, labelOf, prefillOffered, validateAnswers } from "../lib/preview/quiz";

describe("pre-ticking from treatments found on their site", () => {
  test("Tirage's real menu maps to the right boxes", () => {
    const tirage = ["Refresh", "NaturaPeel", "Capillary & Redness Treatment", "Laser Skin Rejuvenation", "Laser Tattoo Removal",
      "Neurotoxin / Daxxify", "Dermal Fillers", "IPL Photofacial", "Laser Hair Removal", "Microneedling", "Chemical Peels", "Facials & Skin Rejuvenation"];
    const pre = prefillOffered(tirage);
    for (const id of ["neurotoxin", "filler", "laser", "ipl", "lhr", "tattoo", "peel", "microneedling", "facial"]) assert.ok(pre.includes(id), id);
    assert.ok(!pre.includes("weight"));
    assert.ok(!pre.includes("hydrafacial"));
  });
  test("a HydraFacial alone doesn't also tick generic 'Facials'", () => {
    const pre = prefillOffered(["HydraFacial Signature", "Botox"]);
    assert.deepEqual(pre, ["neurotoxin", "hydrafacial"]);
  });
  test("results are unique, in menu order, and only known ids", () => {
    const pre = prefillOffered(["Botox", "botox touch-up", "Dysport", "Semaglutide weight loss", "PRP hair restoration"]);
    assert.deepEqual(pre, OFFER_IDS.filter((id) => pre.includes(id)));
    assert.ok(pre.includes("weight") && pre.includes("prp") && pre.includes("hair"));
    assert.equal(new Set(pre).size, pre.length);
  });
  test("nothing found → nothing ticked", () => assert.deepEqual(prefillOffered([]), []));
});

describe("answer checks (server side)", () => {
  const good = { booking_system: "Boulevard", offered: ["neurotoxin", "filler", "hydrafacial"], challenges: ["no_return", "front_desk"], priorities: ["recall", "memberships"] };
  test("valid answers pass", () => {
    const r = validateAnswers(good);
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.answers, good);
  });
  test(`at least ${MIN_OFFERED} treatments`, () => {
    assert.equal(validateAnswers({ ...good, offered: ["neurotoxin", "filler"] }).ok, false);
  });
  test("exactly 2 challenges and 2 priorities (extras are cut, unknown ids dropped)", () => {
    assert.equal(validateAnswers({ ...good, challenges: ["no_return"] }).ok, false);
    assert.equal(validateAnswers({ ...good, priorities: ["recall", "hack"] }).ok, false);
    const r = validateAnswers({ ...good, challenges: ["no_return", "front_desk", "slow_days"] });
    assert.ok(r.ok && r.answers.challenges.length === 2);
  });
  test("unknown or duplicate ids never get stored", () => {
    const r = validateAnswers({ ...good, offered: ["neurotoxin", "neurotoxin", "filler", "<script>", "hydrafacial", "drop table"] });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.answers.offered, ["neurotoxin", "filler", "hydrafacial"]);
  });
  test("booking tool: free text cleaned and capped; none → null", () => {
    const r1 = validateAnswers({ ...good, booking_system: "Jane <b>App</b>; DROP" });
    assert.ok(r1.ok && r1.answers.booking_system === "Jane bAppb DROP"); // tags/punctuation stripped, plain text only
    const r2 = validateAnswers({ ...good, booking_system: 42 });
    assert.ok(r2.ok && r2.answers.booking_system === null);
    const r3 = validateAnswers({ ...good, booking_system: "x".repeat(200) });
    assert.ok(r3.ok && (r3.answers.booking_system ?? "").length === 60);
  });
  test("garbage input fails cleanly", () => {
    for (const g of [{}, { offered: "all" }, { offered: null, challenges: {}, priorities: 5 }]) assert.equal(validateAnswers(g as Record<string, unknown>).ok, false);
  });
  test("labels exist for every id", () => {
    for (const id of [...OFFER_IDS, ...CHALLENGES.map((c) => c.id), ...PRIORITIES.map((p) => p.id)]) assert.notEqual(labelOf(id), id);
  });
});
