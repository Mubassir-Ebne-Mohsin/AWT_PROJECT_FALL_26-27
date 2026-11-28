import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import { activityDateSchema, progressActivitySchema, progressDaySchema } from "@/common/contracts/phase3/progress.schema";

// Both sources are owner-scoped before aggregation. Counts require a completed calculation,
// including modeled failures, but exclude technical failures, previews, edits and pending jobs.
const events = `WITH events AS (
 SELECT r.id, r.completed_at AS at, r.payload->>'kind' AS kind, d.name AS label,
 d.id AS design_id, '/designs/'||d.id||CASE WHEN r.payload->>'kind'='limits' THEN '/limits?run=' ELSE '/results?run=' END||r.id AS href
 FROM design_runs r JOIN designs d ON d.id=r.design_id
 WHERE d.owner_id=$1 AND r.status='completed' AND r.payload->>'kind' IN ('simulation','limits')
 AND r.completed_at >= $2 AND r.completed_at <= $3
 UNION ALL
 SELECT s.id,s.completed_at,'challenge',c.title,NULL::uuid,
 '/challenges/'||c.id||'?attempt='||a.id
 FROM challenge_submissions s JOIN challenge_attempts a ON a.id=s.attempt_id JOIN challenges c ON c.id=a.challenge_id
 WHERE a.learner_id=$1 AND s.status='completed' AND s.completed_at >= $2 AND s.completed_at <= $3
)`;
export function progressWindow(now = new Date()) {
  const start = new Date(now); start.setUTCHours(0,0,0,0); start.setUTCDate(start.getUTCDate()-364);
  return { windowStart:start.toISOString(), windowEnd:now.toISOString() };
}
@Injectable()
export class ProgressService {
  constructor(private readonly db: DataSource) {}
  async activity(owner: string) {
    const window = progressWindow();
    // One statement gives the calendar, recent rows and distinct-design count one consistent snapshot.
    const [row] = await this.db.query(`${events}, daily AS (
      SELECT to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD') AS date,
      count(*) FILTER(WHERE kind='simulation')::int AS simulation,
      count(*) FILTER(WHERE kind='limits')::int AS limits,
      count(*) FILTER(WHERE kind='challenge')::int AS challenge FROM events GROUP BY 1
    ) SELECT (SELECT coalesce(jsonb_agg(daily ORDER BY date),'[]'::jsonb) FROM daily) AS days,
    (SELECT count(DISTINCT design_id)::int FROM events) AS "designsTested",
    (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'at',to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'label',label,'href',href) ORDER BY at DESC,id DESC),'[]'::jsonb)
     FROM (SELECT * FROM events ORDER BY at DESC,id DESC LIMIT 12) recent) AS recent`, [owner,window.windowStart,window.windowEnd]);
    return progressActivitySchema.parse({ ...window, timeZone:"UTC", ...row });
  }
  async day(owner: string, date: unknown) {
    const parsed = activityDateSchema.safeParse(date), window = progressWindow();
    if (!parsed.success || parsed.data < window.windowStart.slice(0,10) || parsed.data > window.windowEnd.slice(0,10))
      throw new AppException("VALIDATION_FAILED", "Choose a valid date within the last 365 days");
    const start = parsed.data+"T00:00:00.000Z";
    const end = new Date(start); end.setUTCDate(end.getUTCDate()+1);
    const rows = await this.db.query(`${events} SELECT id,kind,to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,label,href FROM events
      WHERE at < $4 ORDER BY at DESC,id DESC LIMIT 101`, [owner,start,window.windowEnd,end.toISOString()]);
    return progressDaySchema.parse({date:parsed.data,events:rows.slice(0,100),hasMore:rows.length>100});
  }
}
