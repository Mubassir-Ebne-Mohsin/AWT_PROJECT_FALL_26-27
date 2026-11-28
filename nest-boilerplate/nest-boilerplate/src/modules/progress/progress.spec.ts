import { progressWindow,ProgressService } from "@/modules/progress/progress.service";
import { progressActivitySchema } from "@/common/contracts/phase3/progress.schema";
import { DataSource } from "typeorm";
describe("Private progress activity",()=>{
 it("uses exactly 365 UTC dates through today across leap years",()=>{
  expect(progressWindow(new Date("2024-03-01T23:00:00Z"))).toEqual({windowStart:"2023-03-03T00:00:00.000Z",windowEnd:"2024-03-01T23:00:00.000Z"});
 });
 it("rejects invalid, future, too-old and array day parameters before touching data",async()=>{
  const db={query:jest.fn()},service=new ProgressService(db as unknown as DataSource);
  for(const date of [undefined,[],"2026-02-30","1900-01-01","9999-01-01","2026-01-01' OR 1=1"])
   await expect(service.day("owner",date)).rejects.toMatchObject({code:"VALIDATION_FAILED"});
  expect(db.query).not.toHaveBeenCalled();
 });
 it("rejects invalid response counts rather than displaying them",()=>{
  expect(progressActivitySchema.safeParse({windowStart:"2026-01-01T00:00:00Z",windowEnd:"2026-01-01T00:00:00Z",timeZone:"UTC",days:[{date:"2026-01-01",simulation:-1,limits:0,challenge:0}],designsTested:0,recent:[]}).success).toBe(false);
 });
});
