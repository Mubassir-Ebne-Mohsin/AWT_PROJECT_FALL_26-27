import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LEVELS, affinityMask, nominalCapacity, parseTypeperf, ratesFor, windowExtremes } from "../src/plan.mjs";

test("nominal capacity is workers divided by the work time", () => {
  assert.equal(nominalCapacity(1, 20), 50);
  assert.equal(nominalCapacity(4, 20), 200);
  assert.equal(nominalCapacity(2, 40), 50);
});

test("the default levels run from light load to past the limit, in order, 12 of them", () => {
  assert.equal(DEFAULT_LEVELS.length, 12);
  assert.equal(DEFAULT_LEVELS[0], 0.1);
  assert.ok(DEFAULT_LEVELS.at(-1) > 1);
  for (let i = 1; i < DEFAULT_LEVELS.length; i++) assert.ok(DEFAULT_LEVELS[i] > DEFAULT_LEVELS[i - 1]);
  assert.ok(DEFAULT_LEVELS.filter((l) => l >= 0.1 && l <= 0.2).length >= 2, "the 10 to 20 percent steps used to fit the service time exist");
});

test("rates are the level times the nominal capacity", () => {
  assert.deepEqual(ratesFor([0.1, 0.5, 1.05], 1, 20), [{ level: 0.1, rps: 5 }, { level: 0.5, rps: 25 }, { level: 1.05, rps: 52.5 }]);
  assert.deepEqual(ratesFor([0.95, 1.2], 4, 20), [{ level: 0.95, rps: 190 }, { level: 1.2, rps: 240 }]);
});

test("the affinity mask sets one bit per logical processor", () => {
  assert.equal(affinityMask([2]), 4);
  assert.equal(affinityMask([4, 6, 8, 9, 10, 11]), 16 + 64 + 256 + 512 + 1024 + 2048);
  assert.equal(affinityMask([]), 0);
  assert.equal(affinityMask([0, 0]), 1);
});

const csv = [
  '"(PDH-CSV 4.0)","\\\\PC\\Memory\\Pages/sec","\\\\PC\\Memory\\Available MBytes"',
  '"11/01/2026 14:00:00.000","0.000000","2200"',
  '"11/01/2026 14:00:05.000","40.5","2100"',
  '"11/01/2026 14:00:10.500","3.25","2050"',
  '"11/01/2026 14:00:15.000"," ","2000"',
  "Exiting, please wait...   The command completed successfully.",
].join("\r\n");

test("the paging log is read row by row, ignoring the header, blank readings and the closing lines", () => {
  const samples = parseTypeperf(csv);
  assert.equal(samples.length, 3);
  assert.deepEqual(samples.map((s) => s.pagesPerSec), [0, 40.5, 3.25]);
  assert.deepEqual(samples.map((s) => s.availableMb), [2200, 2100, 2050]);
  assert.equal(samples[2].t - samples[1].t, 5500);
  assert.equal(new Date(samples[0].t).getHours(), 14);
});

test("the extremes inside a window cover only the samples in that window", () => {
  const samples = parseTypeperf(csv);
  const from = samples[1].t;
  const to = samples[2].t;
  assert.deepEqual(windowExtremes(samples, from, to), { samples: 2, maxPagesPerSec: 40.5, minAvailableMb: 2050 });
  assert.deepEqual(windowExtremes(samples, samples[2].t - 1, samples[2].t + 1), { samples: 1, maxPagesPerSec: 3.25, minAvailableMb: 2050 });
  const none = windowExtremes(samples, 0, 1);
  assert.equal(none.samples, 0);
  assert.ok(Number.isNaN(none.maxPagesPerSec) && Number.isNaN(none.minAvailableMb));
});
