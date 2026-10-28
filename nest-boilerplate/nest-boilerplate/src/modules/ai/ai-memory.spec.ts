import { AiMemory } from "@/modules/ai/ai-memory";
type Reading = { physicalMiB: number; commitMiB: number };
describe("M11 bounded memory telemetry", () => {
  it("coalesces concurrent readiness sampling rather than spawning multiple probes", async () => {
    const memory = new AiMemory();
    let release!: (reading: Reading) => void;
    const read = jest.spyOn(memory as unknown as { read: () => Promise<Reading> }, "read").mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const requests = Array.from({ length: 20 }, () => memory.sample());
    expect(read).toHaveBeenCalledTimes(1);
    release({ physicalMiB: 2000, commitMiB: 5000 });
    expect(await Promise.all(requests)).toHaveLength(20);
    await memory.sample(); expect(read).toHaveBeenCalledTimes(1);
  });
  it("does not cache failed telemetry as a successful memory reading", async () => {
    const memory = new AiMemory();
    const read = jest.spyOn(memory as unknown as { read: () => Promise<Reading> }, "read").mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue({ physicalMiB: 2000, commitMiB: 5000 });
    await expect(memory.sample()).rejects.toThrow("unavailable");
    await expect(memory.sample()).resolves.toMatchObject({ physicalMiB: 2000 });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
