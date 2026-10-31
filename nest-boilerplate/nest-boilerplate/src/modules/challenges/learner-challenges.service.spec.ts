import { LearnerChallengesService } from "@/modules/challenges/learner-challenges.service";
import { AppException } from "@/common/errors";
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const key = "33333333-3333-4333-8333-333333333333";
function harness() {
  const manager = { query: jest.fn() };
  const db = { query: jest.fn(), transaction: jest.fn(async fn => fn(manager)) };
  const simulation = { run: jest.fn(), validate: jest.fn() };
  const service = new LearnerChallengesService(db as never, {} as never, simulation as never);
  return { service, db, manager, simulation };
}
describe("R5.2 learner admission", () => {
  it("refuses unknown or foreign attempts before reading any design", async () => {
    const h = harness(); h.manager.query.mockResolvedValueOnce([]);
    await expect(h.service.submit(owner,id,{ requestId:key,expectedRevision:1 })).rejects.toBeInstanceOf(AppException);
    expect(h.simulation.run).not.toHaveBeenCalled();
    expect(h.manager.query.mock.calls[0][1]).toEqual([id,owner]);
  });
  it("replays the same accepted identity without evaluating a second time", async () => {
    const h = harness();
    const row = { id, attempt_id:id,request_id:key,design_revision:1,status:"pending",result:null,created_at:new Date(),completed_at:null };
    h.manager.query.mockResolvedValueOnce([{ id }]).mockResolvedValueOnce([row]);
    await expect(h.service.submit(owner,id,{requestId:key,expectedRevision:1})).resolves.toMatchObject({id,status:"pending"});
    expect(h.simulation.run).not.toHaveBeenCalled();
  });
  it("rejects an idempotency key reused against another revision", async () => {
    const h = harness(); h.manager.query.mockResolvedValueOnce([{id}]).mockResolvedValueOnce([{design_revision:2}]);
    await expect(h.service.submit(owner,id,{requestId:key,expectedRevision:1})).rejects.toMatchObject({code:"CONFLICT"});
  });
  it("rejects new submissions after archive but retains replay behavior", async () => {
    const h = harness(); h.manager.query.mockResolvedValueOnce([{id,challenge_id:id}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(h.service.submit(owner,id,{requestId:key,expectedRevision:1})).rejects.toMatchObject({details:{reason:"CHALLENGE_ARCHIVED"}});
  });
  it("rejects the twenty-first graded submission under the attempt row lock", async () => {
    const h = harness(); h.manager.query.mockResolvedValueOnce([{id,challenge_id:id}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id}]).mockResolvedValueOnce([{count:20}]);
    await expect(h.service.submit(owner,id,{requestId:key,expectedRevision:1})).rejects.toMatchObject({details:{reason:"SUBMISSION_LIMIT"}});
    expect(h.manager.query.mock.calls[0][0]).toContain("FOR UPDATE");
  });
});
