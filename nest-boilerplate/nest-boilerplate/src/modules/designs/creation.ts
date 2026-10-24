import { z } from "zod";
import { AppException } from "@/common/errors";

import { importDesign } from "@/modules/simulation/engine/import-design";
import { scriptedDraft } from "@/modules/designs/scripted-draft";
import { getCatalog } from "@/modules/simulation/engine/templates";
import {
  PrepareDesign,
  preparedDesignSchema,
} from "@/modules/designs/creation.schema";

/** Preparation has no database, worker, provider or quota side effects. */
export function prepareDesign(input: PrepareDesign) {
  try {
    if (input.source === "import") {
      const value = importDesign(input.text);
      return preparedDesignSchema.parse({
        assumptions: [],
        design: {
          ...value.snapshot,
          name: value.name,
          description: value.description,
          source: "import",
          templateId: null,
        },
      });
    }
    if (input.source === "blank") {
      const preset = getCatalog().presets.find((p) => p.id === input.preset)!;
      return preparedDesignSchema.parse({
        assumptions: [],
        design: {
          schemaVersion: 1,
          name: input.name,
          description: "",
          source: "blank",
          templateId: null,
          graph: {
            nodes:
              input.start === "clients"
                ? [
                    {
                      id: "n1",
                      type: "client",
                      label: "Users",
                      x: 80,
                      y: 220,
                      props: { region: input.region },
                    },
                  ]
                : [],
            edges: [],
          },
          traffic: preset.traffic,
        },
      });
    }
    const draft = scriptedDraft(input.text);
    const assumptions = [
      "Scripted mock: keyword rules only; no AI model was called.",
      ...draft.assumptions,
    ];
    return preparedDesignSchema.parse({
      assumptions,
      design: {
        schemaVersion: 1,
        source: "scripted",
        templateId: null,
        name: draft.name,
        graph: draft.design,
        traffic: draft.traffic,
        description:
          input.text +
          "\n\nScripted mock assumptions:\n" +
          assumptions.map((a) => "- " + a).join("\n"),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      throw new AppException("VALIDATION_FAILED", "Check the design fields", {
        issues: creationIssues(error.issues).slice(0, 20),
      });
    if (error instanceof RangeError || error instanceof SyntaxError)
      throw new AppException("VALIDATION_FAILED", error.message);
    throw error;
  }
}

function creationIssues(
  issues: z.core.$ZodIssue[],
): { path: string; message: string }[] {
  return issues.flatMap((issue) => {
    if (issue.code !== "invalid_union")
      return [{ path: issue.path.join("."), message: issue.message }];
    // For a known node type, report its property errors, not the other eleven types.
    const branches = issue.errors.filter(
      (branch) =>
        !branch.some(
          (e) => e.code === "invalid_value" && e.path.at(-1) === "type",
        ),
    );
    if (!branches.length)
      return [
        {
          path: issue.path.join("."),
          message:
            "Unknown component type. Use client, cdn, lb, gateway, app, worker, cache, db, replica, queue, storage or external.",
        },
      ];
    const best = [...branches].sort((a, b) => a.length - b.length)[0];
    return creationIssues(best);
  });
}
