const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
global.window = dom.window; global.document = dom.window.document; global.Event = dom.window.Event; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react"); const { act } = React; const { createRoot } = require("react-dom/client");
const F = require("./helpers/dossier-fixtures.cjs");
const { ApiError } = require("../src/lib/api/errors.ts");
let fetcher, renderer, requests = [], rendered = [], downloads = [], root, handle, second;
const realStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
require.cache[require.resolve("../src/lib/api/report.ts")] = { exports: { fetchReport: (...args) => { requests.push(args); return fetcher(...args); } } };
require.cache[require.resolve("../src/lib/dossier/render.ts")] = { exports: {
 renderDossier: async (...args) => { rendered.push(args); return renderer(...args); },
 downloadPdf: (...args) => downloads.push(args),
} };
const { useReportPdf } = require("../src/lib/use-report-pdf.ts");
const { setPdfNotes } = require("../src/lib/pdf-notes-preference.ts");
const sample = F.report();
const source = () => ({ userId: "owner", designId: sample.designId, revision: 4, run: sample.run.id, requireSimulation: true });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function Harness({ pick, other = false }) { const value = useReportPdf(pick); if (other) second = value; else handle = value; return null; }
async function mount(pick = source(), two = false) {
 fetcher = async () => F.report(); renderer = async () => ({ bytes: Uint8Array.from([37,80,68,70]), dossier: { fileName: "report.pdf" } });
 const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
 await act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(Harness, { pick }), two && React.createElement(Harness, { pick, other: true }))));
}
afterEach(async () => {
 if (root) await act(async () => root.unmount()); root = null;
 Object.defineProperty(window, "localStorage", realStorage); setPdfNotes(true); window.localStorage.clear();
 document.body.innerHTML = ""; requests = []; rendered = []; downloads = []; handle = second = null;
});
test("download pins revision/run, shows busy, ignores a synchronous double click and saves once", async () => {
 await mount(); const wait = deferred(); fetcher = () => wait.promise; let pending;
 await act(async () => { pending = handle.download(); void handle.download(); });
 assert.equal(handle.busy, true); assert.equal(requests.length, 1);
 assert.deepEqual(requests[0].slice(0,2), [sample.designId, { revision: 4, run: sample.run.id }]);
 await act(async () => { wait.resolve(F.report()); await pending; });
 assert.equal(handle.busy, false); assert.equal(handle.error, null); assert.equal(downloads.length, 1);
 assert.deepEqual(rendered[0], [sample, { includeNotes: true }]);
});
test("Report page reuses its own document and same renderer, including reports with no run", async () => {
 await mount({ ...source(), revision: undefined, run: undefined, requireSimulation: false });
 const noRun = F.report({ run: null });
 await act(async () => handle.download(noRun));
 assert.equal(requests.length, 0); assert.deepEqual(rendered[0][0], noRun); assert.equal(downloads.length, 1);
});
test("wrong design/revision/run and non-simulation, pending, mismatched or absent results never download", async () => {
 await mount();
 for (const data of [F.report({ designId: "someone-else" }), F.report({ revision: 5 }), F.report({ run: { ...sample.run, id: "wrong" } }),
 F.report({ run: null }), F.report({ run: { ...sample.run, kind: "limits" } }), F.report({ run: { ...sample.run, status: "pending" } }),
 F.report({ run: { ...sample.run, matchesRevision: false } }), F.report({ run: { ...sample.run, designRevision: 3 } })]) {
  fetcher = async () => data; await act(async () => handle.download()); assert.ok(handle.error); assert.equal(handle.busy, false);
 }
 assert.equal(downloads.length, 0); assert.equal(rendered.length, 0);
});
test("network failure stays local and an explicit retry recovers", async () => {
 await mount(); fetcher = async () => { throw new ApiError("NETWORK", "offline", 0); };
 await act(async () => handle.download()); assert.match(handle.error, /server could not be reached/); assert.equal(downloads.length, 0);
 fetcher = async () => F.report(); await act(async () => handle.download()); assert.equal(handle.error, null); assert.equal(downloads.length, 1);
});
test("renderer failure clears busy and allows a fresh retry", async () => {
 await mount(); renderer = async () => { throw Error("renderer failed"); };
 await act(async () => handle.download()); assert.match(handle.error, /PDF could not be made/); assert.equal(handle.busy, false);
 renderer = async () => ({ bytes: new Uint8Array([1]), dossier: { fileName: "retry.pdf" } });
 await act(async () => handle.download()); assert.equal(downloads[0][1], "retry.pdf"); assert.equal(handle.error, null);
});
test("changing account or selected source aborts pending work and suppresses late downloads", async () => {
 await mount(); const wait = deferred(); fetcher = () => wait.promise; let pending;
 await act(async () => { pending = handle.download(); }); const signal = requests[0][2];
 await act(async () => root.render(React.createElement(Harness, { pick: { ...source(), userId: "other-owner", revision: 5 } })));
 assert.equal(signal.aborted, true); assert.equal(handle.busy, false); assert.equal(handle.error, null);
 await act(async () => { wait.resolve(F.report()); await pending; }); assert.equal(downloads.length, 0);
});
test("unmount during rendering cancels delivery even though PDF work itself cannot be interrupted", async () => {
 await mount(); const wait = deferred(); renderer = () => wait.promise; let pending;
 await act(async () => { pending = handle.download(); }); assert.equal(rendered.length, 1);
 await act(async () => root.unmount()); root = null;
 await act(async () => { wait.resolve({ bytes: new Uint8Array([1]), dossier: { fileName: "late.pdf" } }); await pending; });
 assert.equal(downloads.length, 0);
});
test("notes choice updates both entry points, persists, and is captured in the render options", async () => {
 await mount(source(), true); assert.equal(handle.includeNotes, true); assert.equal(second.includeNotes, true);
 await act(async () => handle.setIncludeNotes(false)); assert.equal(second.includeNotes, false); assert.equal(window.localStorage.getItem("sf-pdf-include-notes"), "false");
 await act(async () => second.download()); assert.equal(rendered[0][1].includeNotes, false);
 window.localStorage.setItem("sf-pdf-include-notes", "true");
 await act(async () => window.dispatchEvent(new window.StorageEvent("storage", { key: "sf-pdf-include-notes" })));
 assert.equal(handle.includeNotes, true); assert.equal(second.includeNotes, true);
});
test("unavailable storage does not prevent notes selection or download", async () => {
 Object.defineProperty(window, "localStorage", { configurable: true, get() { throw Error("storage denied"); } });
 await mount(); await act(async () => handle.setIncludeNotes(false)); assert.equal(handle.includeNotes, false);
 await act(async () => handle.download()); assert.equal(downloads.length, 1); assert.equal(rendered[0][1].includeNotes, false);
});

test("returning to a previously cancelled selection does not revive a stale busy state", async () => {
 await mount(); const wait = deferred(); fetcher = () => wait.promise; let pending;
 await act(async () => { pending = handle.download(); });
 await act(async () => root.render(React.createElement(Harness, { pick: { ...source(), revision: 5 } })));
 await act(async () => root.render(React.createElement(Harness, { pick: source() })));
 assert.equal(handle.busy, false);
 assert.equal(handle.error, null);
 await act(async () => { wait.resolve(F.report()); await pending; });
 assert.equal(downloads.length, 0);
 fetcher = async () => F.report();
 await act(async () => handle.download());
 assert.equal(downloads.length, 1);
});
