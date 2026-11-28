import { GalleryService } from "@/modules/gallery/gallery.service";
import { galleryPreviewSchema } from "@/common/contracts/phase3/gallery.schema";

describe("Gallery list snapshot preview", () => {
  const graph = {
    nodes: [{ id: "client1", type: "client", label: "Clients", x: -100, y: 20, props: { region: "us-east", secret: "never expose properties" } }, { id: "app1", type: "app", label: "App", x: 250, y: 20, props: { capacity: 600 } }],
    edges: [{ id: "edge1", from: "client1", to: "app1", kind: "sync", private: "not public" }],
  };
  function setup(previewGraph: unknown = graph, ownerUsername: string | null = "gallery_builder") {
    const row = { id: "11111111-1111-4111-8111-111111111111", ownerId: "owner", title: "Frozen architecture", description: "Example", ownerName: "Builder", ownerUsername, publishedAt: new Date("2026-11-25T10:00:00Z"), revision: 7, verdict: "pass", p95: 42, p95Target: 300, tags: ["client", "app"], nodeCount: 2, remixCount: 0, allowRemix: true, previewGraph, email: "private@example.test", notes: "private", report: { unrelated: "private" } };
    const query = jest.fn().mockResolvedValueOnce([{ n: 1 }]).mockResolvedValueOnce([row]);
    const service = new GalleryService({ query } as never, {} as never, {} as never);
    return { query, service };
  }
  it("returns only allow-listed frozen topology in the single paginated list query", async () => {
    const { query, service } = setup();
    const list = await service.list("viewer", {});
    expect(query).toHaveBeenCalledTimes(2); // Count + one page, never a request per post.
    expect(query.mock.calls[1][0]).toContain(`p.report->'graph' AS "previewGraph"`);
    expect(query.mock.calls[1][0]).toContain("p.unpublished_at IS NULL");
    expect(list.items[0].preview).toEqual({ nodes: graph.nodes.map(({ id, type, label, x, y }) => ({ id, type, label, x, y })), edges: [{ id: "edge1", from: "client1", to: "app1" }] });
    expect(JSON.stringify(list)).not.toMatch(/never expose|private@example|unrelated|props|ownerId|previewGraph/);
    expect(list.items[0]).toMatchObject({ revision: 7, p95: 42, p95Target: 300, isMine: false });
  });
  it("returns the public username, never an email, and handles accounts without usernames", async () => {
    const withName = await setup().service.list("viewer", {});
    expect(withName.items[0].ownerUsername).toBe("gallery_builder");
    expect(JSON.stringify(withName)).not.toContain("private@example.test");
    expect((await setup(graph, null).service.list("viewer", {})).items[0].ownerUsername).toBeNull();
  });
  it("gracefully returns a missing preview", async () => {
    const { service } = setup(null);
    expect((await service.list("owner", {})).items[0]).toMatchObject({ preview: null, isMine: true });
  });
  it("rejects extra fields and unbounded preview geometry", () => {
    expect(galleryPreviewSchema.safeParse(graph).success).toBe(false);
    expect(galleryPreviewSchema.safeParse({ nodes: [{ id: "a", type: "app", label: "App", x: Infinity, y: 0 }], edges: [] }).success).toBe(false);
  });
});
