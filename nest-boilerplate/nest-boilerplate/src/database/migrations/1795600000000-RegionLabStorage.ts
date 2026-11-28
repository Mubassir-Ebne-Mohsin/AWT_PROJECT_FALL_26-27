import { MigrationInterface, QueryRunner } from "typeorm";
export class RegionLabStorage1795600000000 implements MigrationInterface {
  name = "RegionLabStorage1795600000000";
  async up(q: QueryRunner) {
    await q.query(`
    SET LOCAL lock_timeout='2s';
    CREATE TABLE region_lab_experiments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name varchar(100) NOT NULL, description varchar(2000) NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,owner_id)
    );
    CREATE INDEX region_lab_experiments_owner_list ON region_lab_experiments(owner_id,created_at DESC,id DESC);
    CREATE TABLE region_lab_versions (
      experiment_id uuid NOT NULL REFERENCES region_lab_experiments(id) ON DELETE CASCADE, revision integer NOT NULL CHECK(revision>0),
      snapshot jsonb NOT NULL, input_hash char(64) NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(experiment_id,revision)
    );
    CREATE TABLE region_lab_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      experiment_id uuid NOT NULL REFERENCES region_lab_experiments(id) ON DELETE CASCADE, experiment_revision integer NOT NULL,
      request_id uuid NOT NULL, input_hash char(64) NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'), engine_version varchar(80) NOT NULL,
      snapshot jsonb NOT NULL, status varchar(12) NOT NULL DEFAULT 'queued', result jsonb, failure jsonb,
      lease_token uuid, lease_expires_at timestamptz, worker_instance uuid,
      created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz,
      FOREIGN KEY(experiment_id,experiment_revision) REFERENCES region_lab_versions(experiment_id,revision) ON DELETE CASCADE,
      FOREIGN KEY(experiment_id,owner_id) REFERENCES region_lab_experiments(id,owner_id) ON DELETE CASCADE,
      CHECK(status IN ('queued','running','completed','failed','cancelled')),
      CHECK((status='queued' AND started_at IS NULL AND finished_at IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL AND result IS NULL AND failure IS NULL)
        OR(status='running' AND started_at IS NOT NULL AND finished_at IS NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND worker_instance IS NOT NULL AND result IS NULL AND failure IS NULL)
        OR(status='completed' AND finished_at IS NOT NULL AND lease_token IS NULL AND result IS NOT NULL AND failure IS NULL)
        OR(status='failed' AND finished_at IS NOT NULL AND lease_token IS NULL AND result IS NULL AND failure IS NOT NULL)
        OR(status='cancelled' AND finished_at IS NOT NULL AND lease_token IS NULL AND result IS NULL AND failure IS NULL)),
      CHECK(result IS NULL OR octet_length(result::text)<=2097152)
    );
    CREATE INDEX region_lab_runs_owner ON region_lab_runs(owner_id,status);
    CREATE INDEX region_lab_runs_experiment ON region_lab_runs(experiment_id,created_at DESC,id DESC);
    CREATE INDEX region_lab_runs_queue ON region_lab_runs(created_at,id) WHERE status='queued';
    CREATE UNIQUE INDEX region_lab_one_running ON region_lab_runs(status) WHERE status='running';
    CREATE TABLE region_lab_requests (
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, request_id uuid NOT NULL,
      experiment_id uuid NOT NULL, experiment_revision integer NOT NULL, input_hash char(64) NOT NULL,
      original_run_id uuid NOT NULL, current_run_id uuid REFERENCES region_lab_runs(id) ON DELETE SET NULL,
      last_status varchar(12) NOT NULL DEFAULT 'queued', created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(owner_id,request_id)
    );
    -- No FK on the execution slot: account deletion must not free physical capacity before worker exit.
    CREATE TABLE region_lab_execution_slot (
      id integer PRIMARY KEY CHECK(id=1), run_id uuid, lease_token uuid, lease_expires_at timestamptz,
      CHECK((run_id IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL) OR(run_id IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
    );
    INSERT INTO region_lab_execution_slot(id) VALUES(1);
    CREATE FUNCTION region_lab_immutable_version() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Region Lab versions are immutable'; END;$$;
    CREATE TRIGGER region_lab_version_immutable BEFORE UPDATE ON region_lab_versions FOR EACH ROW EXECUTE FUNCTION region_lab_immutable_version();
    CREATE FUNCTION region_lab_run_transition() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
      IF ROW(NEW.id,NEW.owner_id,NEW.experiment_id,NEW.experiment_revision,NEW.request_id,NEW.input_hash,NEW.engine_version,NEW.snapshot,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.experiment_id,OLD.experiment_revision,OLD.request_id,OLD.input_hash,OLD.engine_version,OLD.snapshot,OLD.created_at)
        THEN RAISE EXCEPTION 'Region Lab run inputs are immutable'; END IF;
      IF OLD.status IN ('completed','failed','cancelled') THEN RAISE EXCEPTION 'Region Lab terminal state is immutable'; END IF;
      IF OLD.status='queued' AND NEW.status NOT IN ('running','cancelled') THEN RAISE EXCEPTION 'Invalid queued transition'; END IF;
      IF OLD.status='running' AND NEW.status='running' AND ROW(NEW.lease_token,NEW.worker_instance,NEW.started_at) IS DISTINCT FROM ROW(OLD.lease_token,OLD.worker_instance,OLD.started_at)
        THEN RAISE EXCEPTION 'Running lease cannot be reassigned'; END IF;
      IF OLD.status='running' AND NEW.status='queued' THEN RAISE EXCEPTION 'Interrupted work must not retry silently'; END IF;
      RETURN NEW;
    END;$$;
    CREATE TRIGGER region_lab_run_immutable BEFORE UPDATE ON region_lab_runs FOR EACH ROW EXECUTE FUNCTION region_lab_run_transition();
    CREATE FUNCTION region_lab_account_fence() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
      UPDATE region_lab_runs SET status='cancelled',finished_at=now(),lease_token=NULL,lease_expires_at=NULL,worker_instance=NULL
        WHERE owner_id=OLD.id AND status IN ('queued','running');
      RETURN OLD;
    END;$$;
    CREATE FUNCTION region_lab_account_suspend() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
      IF NEW.account_status<>'active' THEN
        UPDATE region_lab_runs SET status='cancelled',finished_at=now(),lease_token=NULL,lease_expires_at=NULL,worker_instance=NULL WHERE owner_id=OLD.id AND status IN ('queued','running');
      END IF; RETURN NEW;
    END;$$;
    CREATE TRIGGER region_lab_suspend_fence BEFORE UPDATE OF account_status ON users FOR EACH ROW EXECUTE FUNCTION region_lab_account_suspend();
    CREATE TRIGGER region_lab_delete_fence BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION region_lab_account_fence();
  `);
  }
  async down(q: QueryRunner) {
    const [{ count }] = await q.query(
      "SELECT count(*)::int AS count FROM region_lab_experiments",
    );
    const [{ busy }] = await q.query(
      "SELECT count(*)::int AS busy FROM region_lab_execution_slot WHERE run_id IS NOT NULL",
    );
    const [{ ledger }] = await q.query(
      "SELECT count(*)::int AS ledger FROM region_lab_requests",
    );
    if (count || busy || ledger)
      throw new Error(
        "Refusing Region Lab rollback with retained user data or execution leases",
      );
    await q.query(
      `DROP TRIGGER region_lab_suspend_fence ON users; DROP FUNCTION region_lab_account_suspend(); DROP TRIGGER region_lab_delete_fence ON users; DROP FUNCTION region_lab_account_fence(); DROP TABLE region_lab_requests; DROP TABLE region_lab_execution_slot; DROP TABLE region_lab_runs; DROP TABLE region_lab_versions; DROP TABLE region_lab_experiments; DROP FUNCTION region_lab_run_transition(); DROP FUNCTION region_lab_immutable_version();`,
    );
  }
}
