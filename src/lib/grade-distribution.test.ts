import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { computeBoxPlotStats } from "@/lib/grade-distribution";

function assertWithin(actual: number, expected: number, tolerance = 0.000001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

describe("computeBoxPlotStats", () => {
  test("returns null for an empty set", () => {
    assert.equal(computeBoxPlotStats([]), null);
  });

  test("returns identical values for a single grade", () => {
    assert.deepEqual(computeBoxPlotStats([68]), {
      count: 1,
      min: 68,
      q1: 68,
      median: 68,
      mean: 68,
      q3: 68,
      max: 68,
      range: 0,
      standardDeviation: 0,
    });
  });

  test("computes quartiles and summary statistics for multiple grades", () => {
    const stats = computeBoxPlotStats([30, 60, 70, 90]);

    assert.ok(stats);
    assert.equal(stats.count, 4);
    assert.equal(stats.min, 30);
    assert.equal(stats.q1, 52.5);
    assert.equal(stats.median, 65);
    assert.equal(stats.mean, 62.5);
    assert.equal(stats.q3, 75);
    assert.equal(stats.max, 90);
    assert.equal(stats.range, 60);
    assertWithin(stats.standardDeviation, 21.6506350946);
  });
});
