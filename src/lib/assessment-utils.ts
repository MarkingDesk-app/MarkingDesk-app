type CsvScriptRow = {
  studentNumber: string;
  name: string | null;
  externalUrl: string;
};

const TURNITIN_ID_REGEX = /\b\d{9}\b/g;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"(.*)"$/, "$1").trim());
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function parseScriptCsv(csvText: string): CsvScriptRow[] {
  const lines = csvText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const parsed = lines.map(parseCsvLine);

  const headerCandidate = parsed[0] ?? [];
  const normalizedHeaders = headerCandidate.map(normalizeHeader);
  const hasHeader =
    normalizedHeaders.includes("studentnumber") || normalizedHeaders.includes("externalurl");

  const startIndex = hasHeader ? 1 : 0;

  const studentNumberIndex = hasHeader ? normalizedHeaders.indexOf("studentnumber") : 0;
  const nameIndex = hasHeader ? normalizedHeaders.indexOf("name") : 1;
  const externalUrlIndex = hasHeader ? normalizedHeaders.indexOf("externalurl") : 2;

  const rows: CsvScriptRow[] = [];

  for (let i = startIndex; i < parsed.length; i += 1) {
    const row = parsed[i] ?? [];
    const studentNumber = (row[studentNumberIndex] ?? "").trim();

    if (!studentNumber) {
      continue;
    }

    let externalUrl = "";
    let name: string | null = null;

    if (externalUrlIndex >= 0) {
      externalUrl = (row[externalUrlIndex] ?? "").trim();
      name = nameIndex >= 0 ? (row[nameIndex] ?? "").trim() || null : null;
    } else {
      externalUrl = (row[1] ?? "").trim();
    }

    if (!externalUrl) {
      throw new Error(`Row ${i + 1} is missing externalUrl.`);
    }

    rows.push({
      studentNumber,
      name,
      externalUrl,
    });
  }

  return rows;
}

export function extractTurnitinIds(rawText: string): string[] {
  return rawText.match(TURNITIN_ID_REGEX) ?? [];
}

export function findDuplicateIds(ids: string[]): string[] {
  const counts = new Map<string, number>();

  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((left, right) => left.localeCompare(right));
}

export function buildTurnitinSubmissionUrl(turnitinId: string): string {
  return `https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=${encodeURIComponent(turnitinId)}`;
}

export function formatSubmissionType(type: "FIRST_SUBMISSION" | "SEVEN_DAY_WINDOW"): string {
  return type === "FIRST_SUBMISSION" ? "1st Submission" : "7-day";
}

export function formatModerationStatus(
  status: "NO_ISSUES" | "MINOR_ADJUSTMENTS_REQUIRED" | "MAJOR_ISSUES" | null | undefined
): string {
  if (!status) {
    return "Pending";
  }

  switch (status) {
    case "NO_ISSUES":
      return "No issues";
    case "MINOR_ADJUSTMENTS_REQUIRED":
      return "Minor adjustments required";
    case "MAJOR_ISSUES":
      return "Major issues";
    default:
      return status;
  }
}

export function buildBalancedAssignments(
  scriptIds: string[],
  markerIds: string[],
  existingCounts: Record<string, number>
): Record<string, string> {
  if (scriptIds.length === 0) {
    return {};
  }
  if (markerIds.length === 0) {
    throw new Error("No marker users available for auto-allocation.");
  }

  const markerQueue = markerIds
    .map((markerId) => ({
      markerId,
      count: existingCounts[markerId] ?? 0,
    }))
    .sort((a, b) => a.count - b.count || a.markerId.localeCompare(b.markerId));

  const assignments: Record<string, string> = {};

  for (const scriptId of scriptIds) {
    markerQueue.sort((a, b) => a.count - b.count || a.markerId.localeCompare(b.markerId));
    const next = markerQueue[0];
    if (!next) continue;

    assignments[scriptId] = next.markerId;
    next.count += 1;
  }

  return assignments;
}

export type { CsvScriptRow };
