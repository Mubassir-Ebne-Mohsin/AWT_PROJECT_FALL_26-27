import { DesignsService } from "@/modules/designs/designs.service";
import { SavedDesign } from "@/modules/designs/entities/design.entity";
import { getTemplates } from "@/modules/simulation/engine/templates";

describe("Dashboard topology previews", () => {
  function setup() {
    const t = getTemplates().find(t => t.id === "mvp")!;
    const graph = structuredClone(t.graph);
    graph.nodes[0].x = -432;
    graph.nodes[0].label = "Current saved clients";
    const design = { id: "11111111-1111-4111-8111-111111111111", ownerId: "owner", name: t.name, description: t.blurb, source: "template", templateId: t.id, schemaVersion: 1, graph, traffic: t.traffic, revision: 3, createdAt: new Date(), updatedAt: new Date(), archivedAt: null };
    const findAndCount = jest.fn().mockResolvedValue([[design], 1]);
    const findOne = jest.fn().mockResolvedValue(null);
    const service = new DesignsService({ getRepository: (entity: unknown) => entity === SavedDesign ? { findAndCount } : { findOne } } as never);
    return { service, findAndCount, graph };
  }
  it("includes only current saved topology in the existing owner-scoped summary read", async () => {
    const { service, findAndCount, graph } = setup();
    const result = await service.summaries("owner", 1, 10, true);
    expect(findAndCount).toHaveBeenCalledTimes(1);
    expect(findAndCount.mock.calls[0][0]).toMatchObject({ where: { ownerId: "owner" }, take: 10 });
    expect(result.data[0].preview).toEqual({ nodes: graph.nodes.map(({ id, type, label, x, y }) => ({ id, type, label, x, y })), edges: graph.edges });
    expect(result.data[0].preview?.nodes[0]).toMatchObject({ x: -432, label: "Current saved clients" });
    expect(JSON.stringify(result.data[0].preview)).not.toMatch(/props|capacity|latency|traffic|ownerId/);
    expect(result.data[0].latestRun).toBeNull();
  });
  it("does not add preview payloads to ordinary design-list summaries", async () => {
    expect((await setup().service.summaries("owner", 1, 20)).data[0]).not.toHaveProperty("preview");
  });
});
