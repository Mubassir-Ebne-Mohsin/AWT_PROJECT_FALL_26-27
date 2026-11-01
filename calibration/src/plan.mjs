// The pure parts of the stepped test: which load levels to offer, which cores to use, and how to read the paging log. Kept
// separate from the runner so they can be tested without running anything.

/** Offered load as a share of the service's nominal capacity (workers / work time). Light load up to well past the limit. */
export const DEFAULT_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.05, 1.2];

/** Nominal capacity in requests per second: `workers` parallel servers, each finishing a request every `workMs`. */
export const nominalCapacity = (workers, workMs) => (workers * 1000) / workMs;

/** The offered rate for each level, rounded to one decimal place. */
export const ratesFor = (levels, workers, workMs) => levels.map((level) => ({ level, rps: Math.round(level * nominalCapacity(workers, workMs) * 10) / 10 }));

/** A Windows processor-affinity mask for a list of logical processor numbers. */
export const affinityMask = (logicals) => logicals.reduce((mask, n) => mask | (1 << n), 0);

/**
 * Read the output of `typeperf` with two counters (pages per second, available MB). Rows look like
 * "11/01/2026 14:03:05.123","12.5","2210". Times are the machine's local time.
 */
export function parseTypeperf(text) {
  const samples = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^"(\d\d)\/(\d\d)\/(\d{4}) (\d\d):(\d\d):(\d\d)(?:\.(\d+))?","([^"]*)","([^"]*)"/);
    if (!m) continue;
    const [, mo, d, y, h, mi, s, frac = "0", pages, avail] = m;
    const t = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Math.round(Number(`0.${frac}`) * 1000)).getTime();
    // typeperf writes a blank (" ") when it has no reading; that is a missing sample, not a zero.
    const reading = (text) => (text.trim() === "" ? NaN : Number(text));
    const pagesPerSec = reading(pages);
    const availableMb = reading(avail);
    if (Number.isFinite(pagesPerSec) && Number.isFinite(availableMb)) samples.push({ t, pagesPerSec, availableMb });
  }
  return samples;
}

/** The largest pages-per-second and the smallest available memory among samples inside [fromMs, toMs]. NaN when there are none. */
export function windowExtremes(samples, fromMs, toMs) {
  const inside = samples.filter((s) => s.t >= fromMs && s.t <= toMs);
  if (!inside.length) return { samples: 0, maxPagesPerSec: NaN, minAvailableMb: NaN };
  return { samples: inside.length, maxPagesPerSec: Math.max(...inside.map((s) => s.pagesPerSec)), minAvailableMb: Math.min(...inside.map((s) => s.availableMb)) };
}
