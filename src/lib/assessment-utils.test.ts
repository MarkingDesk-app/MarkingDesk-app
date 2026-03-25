import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildBalancedAssignments,
  buildTurnitinSubmissionUrl,
  extractTurnitinIds,
  findDuplicateIds,
  formatModerationStatus,
  formatReviewFlagStatus,
  formatSubmissionType,
  isReviewFlagResolved,
  parseScriptCsv,
} from "@/lib/assessment-utils";

describe("parseScriptCsv", () => {
  test("parses csv with headers", () => {
    const rows = parseScriptCsv(
      "studentNumber,name,externalUrl\nS001,Alex Smith,https://files/1\nS002,,https://files/2"
    );

    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      studentNumber: "S001",
      name: "Alex Smith",
      externalUrl: "https://files/1",
    });
    assert.deepEqual(rows[1], {
      studentNumber: "S002",
      name: null,
      externalUrl: "https://files/2",
    });
  });

  test("parses csv without headers", () => {
    const rows = parseScriptCsv("S001,Alex Smith,https://files/1\nS002,Bea Jones,https://files/2");
    assert.equal(rows.length, 2);
    assert.equal(rows[1]?.studentNumber, "S002");
  });
});

describe("buildBalancedAssignments", () => {
  test("allocates to least-loaded markers first", () => {
    const assignments = buildBalancedAssignments(
      ["scriptA", "scriptB", "scriptC"],
      ["marker1", "marker2"],
      {
        marker1: 3,
        marker2: 1,
      }
    );

    assert.equal(assignments.scriptA, "marker2");
    assert.equal(assignments.scriptB, "marker2");
    assert.equal(assignments.scriptC, "marker1");
  });
});

describe("extractTurnitinIds", () => {
  test("extracts nine-digit ids from pasted Turnitin text", () => {
    const ids = extractTurnitinIds("Essay 123456789\nAnother row 987654321 and 123456789");

    assert.deepEqual(ids, ["123456789", "987654321", "123456789"]);
  });
});

describe("findDuplicateIds", () => {
  test("returns only ids that appear more than once", () => {
    const duplicates = findDuplicateIds(["123456789", "987654321", "123456789"]);

    assert.deepEqual(duplicates, ["123456789"]);
  });
});

describe("buildTurnitinSubmissionUrl", () => {
  test("builds the fixed Turnitin submission url", () => {
    assert.equal(
      buildTurnitinSubmissionUrl("123456789"),
      "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456789"
    );
  });
});

describe("formatSubmissionType", () => {
  test("formats submission labels for the UI", () => {
    assert.equal(formatSubmissionType("FIRST_SUBMISSION"), "1st Submission");
    assert.equal(formatSubmissionType("SEVEN_DAY_WINDOW"), "7-day");
  });
});

describe("formatModerationStatus", () => {
  test("formats moderation status labels for the UI", () => {
    assert.equal(formatModerationStatus(null), "Pending");
    assert.equal(formatModerationStatus("NO_ISSUES"), "No issues");
    assert.equal(formatModerationStatus("MINOR_ADJUSTMENTS_REQUIRED"), "Minor adjustments required");
    assert.equal(formatModerationStatus("MAJOR_ISSUES"), "Major issues");
  });
});

describe("formatReviewFlagStatus", () => {
  test("formats review flag labels for the UI", () => {
    assert.equal(formatReviewFlagStatus(null), "No flag");
    assert.equal(formatReviewFlagStatus("FLAGGED"), "Flagged");
    assert.equal(formatReviewFlagStatus("ACADEMIC_CONDUCT_REVIEW"), "Academic Conduct Review");
    assert.equal(formatReviewFlagStatus("NO_ISSUE"), "No issue");
    assert.equal(formatReviewFlagStatus("REVIEW_COMPLETED"), "Review completed");
  });
});

describe("isReviewFlagResolved", () => {
  test("returns whether a review flag is resolved", () => {
    assert.equal(isReviewFlagResolved("FLAGGED"), false);
    assert.equal(isReviewFlagResolved("ACADEMIC_CONDUCT_REVIEW"), false);
    assert.equal(isReviewFlagResolved("NO_ISSUE"), true);
    assert.equal(isReviewFlagResolved("REVIEW_COMPLETED"), true);
  });
});
