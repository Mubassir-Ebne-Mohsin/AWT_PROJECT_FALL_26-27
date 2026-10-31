const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000",
});
for (const n of [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
])
  Object.defineProperty(global, n, {
    configurable: true,
    value: dom.window[n],
  });
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const id = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222",
  design = "33333333-3333-4333-8333-333333333333";
require.cache[require.resolve("next/navigation")] = {
  exports: {
    useParams: () => ({ id }),
    useRouter: () => ({ replace() {} }),
    useSearchParams: () => new URLSearchParams("attempt=" + id),
  },
};
require.cache[require.resolve("next/link")] = {
  exports: {
    __esModule: true,
    default: ({ children, ...props }) =>
      React.createElement("a", props, children),
  },
};
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = {
  exports: { useAuth: () => ({ user: { id: user }, status: "authed" }) },
};
require.cache[
  require.resolve("../src/components/workspace/draft-provider.tsx")
] = {
  exports: {
    useDrafts: () =>
      new Map([[user + ":" + design, { hasUnsettledWork: true }]]),
  },
};
require.cache[require.resolve("@tanstack/react-query")] = {
  exports: {
    useQuery: ({ queryKey }) => ({
      data:
        queryKey[0] === "challenge-attempt"
          ? {
              attempt: { id, designId: design, challengeId: id },
              challenge: { archived: false },
              submissions: [],
              feedback: [],
            }
          : {
              id,
              title: "Test challenge",
              summary: "Test",
              goal: { p95Ms: 300, errorRate: 0.01 },
            },
      refetch: async () => {},
      isError: false,
      error: null,
    }),
  },
};
const {
  LearnerChallenge,
} = require("../src/components/learner/challenges.tsx");
test("R5.2 retained unsaved editor work blocks actual submit UI without a network call", async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw Error("must not submit");
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(LearnerChallenge)));
    const button = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Submit saved revision",
    );
    assert.ok(button);
    await act(async () => button.click());
    assert.match(
      host.textContent,
      /Save your edits and resolve pending editor work/,
    );
    assert.equal(calls, 0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    global.fetch = original;
  }
});
