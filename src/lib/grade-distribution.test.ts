import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { computeBoxPlotStats } from "@/lib/grade-distribution";

describe("computeBoxPlotStats", () => {
  test("returns null for an empty set", () => {
    assert.equal(computeBoxPlotStats([]), null);
  });

  test("returns identical values for a single grade", () => {
    assert.deepEqual(computeBoxPlotStats([68]), {
      count: 1,
      min: 68,
      q1: 68,
      mean: 68,
      q3: 68,
      max: 68,
    });
  });

  test("computes quartiles and mean for multiple grades", () => {
    const stats = computeBoxPlotStats([30, 60, 70, 90]);

    assert.deepEqual(stats, {
      count: 4,
      min: 30,
      q1: 52.5,
      mean: 62.5,
      q3: 75,
      max: 90,
    });
  });
});
