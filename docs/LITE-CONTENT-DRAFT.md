# Draft content for staged challenge hints and the daily quiz (for owner review)

Status: **draft, not built.** Nothing here is in the app. Approve, edit or strike each item; code is written only from approved text.

Rules the wording follows: hints say what to look at, never the answer in one step; no claim about the starting design's numbers (the starting designs were not inspected for this draft, so a hint that names a component must be checked against the real design before approval); every quiz answer links to an existing Concept help topic id.

## A. Staged hints (three per challenge, unlocked one at a time, kept in the browser)

### flash-sale: "Survive a flash sale"
1. Run the test first and read which component is fullest on the Results tab. The load is a short spike, not an average.
2. Check the traffic shape and the burst multiplier: a design that passes at the average can fail at the peak (topic `burst`).
3. Work on the limiting component only. Reads can often be moved off the database (topics `cache`, `replica`), and work the user does not wait for can go behind a queue (topic `queue`).

### p95-100: "Get p95 under 100 ms"
1. p95 is the whole path a request takes, so add up the delay of every component on it (topic `what-is-p95`).
2. A remote call or a call between regions adds a round trip; look at where components are placed (topic `region`).
3. Serving from memory or from an edge location removes whole steps from the path (topics `cache`, `comp-cdn`).

### cross-region: "Fix a cross-region app"
1. Open each component's region and find a request path that crosses one (topic `cross-region`).
2. A round trip between regions costs tens of milliseconds each way; the table of distances is in topic `region`.
3. Move the component that is called most often next to its caller, or put a cache or CDN in the users' region (topic `multi-region`).

### launch-10x: "Handle 10x launch traffic"
1. Use Where does it break? to see which component fails first at 2x, 5x and 10x (topic `ladder`).
2. Fix the limiting component, run again, and repeat; a fix elsewhere changes nothing (topic `bottleneck-rule`).
3. Adding copies spreads work only while that component is the limit; the database often is not helped by more app copies (topics `scale`, `cache-writes`).

## B. Daily quiz: "What would you add?" (eight fixed scenarios, one per day in rotation)

| # | Scenario (written for the learner) | Answer | Topic |
|---|---|---|---|
| 1 | Read-heavy product pages; the primary database is the fullest component. | A cache first, then a read replica. | `cache` |
| 2 | Order confirmation emails make checkout slow. | Put the emails behind a queue with a worker. | `queue-vs-direct` |
| 3 | Users in Asia see a p95 far above target; the app and database are in US East. | Place a CDN or app copies in the users' region. | `multi-region` |
| 4 | Writes are the bottleneck; a cache has not helped. | Reduce or batch writes or queue them. A cache and replica only take reads. | `cache-writes` |
| 5 | A single app server is at 95% and nothing else is above 40%. | Add copies of the app tier. | `scale` |
| 6 | Images and downloads load slowly and use most of the app's capacity. | A CDN with object storage behind it. | `static-content` |
| 7 | A third-party service with low capacity is the bottleneck. | You cannot add copies of it; call it less often. | `comp-external` |
| 8 | The design passes at average traffic but fails during a short spike. | Look at the burst setting; absorb the spike with a queue or more headroom. | `burst` |

## C. Decisions for the owner
1. Approve, edit or strike each hint and quiz item. Hints marked as naming components must be checked against the four starter designs first.
2. Where hints appear: a "Hint 1 of 3" button on the challenge page that reveals one at a time (my recommendation), versus all hints hidden behind one toggle.
3. The quiz needs no account and no server; progress (today's answer) stays in the browser.
