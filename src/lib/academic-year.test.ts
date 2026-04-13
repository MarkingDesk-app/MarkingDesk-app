import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { formatAcademicYearLabel, getCurrentAcademicYearLabel, parseAcademicYearStart } from "@/lib/academic-year";

describe("formatAcademicYearLabel", () => {
  test("formats the academic year label with a two-digit suffix", () => {
    assert.equal(formatAcademicYearLabel(2025), "2025/26");
  });
});

describe("parseAcademicYearStart", () => {
  test("returns the start year for a valid academic year label", () => {
    assert.equal(parseAcademicYearStart("2025/26"), 2025);
  });

  test("returns null for an invalid academic year label", () => {
    assert.equal(parseAcademicYearStart("2025/27"), null);
    assert.equal(parseAcademicYearStart("2025-26"), null);
  });
});

describe("getCurrentAcademicYearLabel", () => {
  test("uses the previous start year before 1 September in London", () => {
    assert.equal(getCurrentAcademicYearLabel(new Date("2026-08-31T21:30:00.000Z")), "2025/26");
  });

  test("rolls over on 1 September in London", () => {
    assert.equal(getCurrentAcademicYearLabel(new Date("2026-08-31T23:30:00.000Z")), "2026/27");
  });
});
