import { DesignLibraryService } from "@/modules/designs/design-library.service";

describe("Design library previews", () => {
 it("projects only current topology in the existing paginated owner-scoped query", async () => {
   const graph = { nodes: [{ id: "app", type: "app", label: "Saved app", x: -420, y: 20, props: { capacity: 600 } }], edges: [] };
   const row = { id: "11111111-1111-4111-8111-111111111111", name: "Example", description: "", revision: 2, createdAt: new Date(), updatedAt: new Date(), archivedAt: null, nodeCount: 1, edgeCount: 0, run: null, previewGraph: graph };
   const query = jest.fn().mockResolvedValueOnce([{ n: 1 }]).mockResolvedValueOnce([row]);
   const service = new DesignLibraryService({ query } as never, {} as never);
   const result = await service.list("owner-only", {});
   expect(query).toHaveBeenCalledTimes(2);
   expect(query.mock.calls[1][0]).toContain('d.graph AS "previewGraph"');
   expect(query.mock.calls[1][0]).toContain("d.owner_id = $1");
   expect(query.mock.calls[1][1][0]).toBe("owner-only");
   expect(result.data[0].preview?.nodes[0]).toEqual({ id: "app", type: "app", label: "Saved app", x: -420, y: 20 });
   expect(JSON.stringify(result.data[0].preview)).not.toMatch(/props|capacity|ownerId|traffic/);
   expect(result.data[0].latestRun).toBeNull();
 });
});
