import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildDashboardProgressSummary } from "@/lib/dashboard-utils";

describe("buildDashboardProgressSummary", () => {
  test("only counts instances that have scripts in the progress totals", () => {
    const summary = buildDashboardProgressSummary(
      [
        {
          dueAt: new Date("2026-10-01T09:00:00.000Z"),
          moderatorUserId: "user-1",
          totalScripts: 12,
          markedScripts: 7,
          myAllocatedScripts: 4,
          myMarkedScripts: 3,
        },
        {
          dueAt: new Date("2026-09-01T09:00:00.000Z"),
          moderatorUserId: "user-1",
          totalScripts: 0,
          markedScripts: 0,
          myAllocatedScripts: 0,
          myMarkedScripts: 0,
        },
      ],
      "user-1"
    );

    assert.equal(summary.totalScripts, 12);
    assert.equal(summary.markedScripts, 7);
    assert.equal(summary.remainingScripts, 5);
    assert.equal(summary.myAllocatedScripts, 4);
    assert.equal(summary.myMarkedScripts, 3);
    assert.equal(summary.progressPercentage, 58);
    assert.equal(summary.moderatedAssessments, 2);
    assert.equal(summary.nextDeadline?.toISOString(), "2026-09-01T09:00:00.000Z");
  });
});
