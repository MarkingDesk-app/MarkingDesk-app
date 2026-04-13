export const LONDON_TIME_ZONE = "Europe/London";
export const ACADEMIC_YEAR_START_MONTH = 8;

export function formatAcademicYearLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function parseAcademicYearStart(value: string): number | null {
  const match = value.match(/^(\d{4})\/(\d{2})$/);

  if (!match) {
    return null;
  }

  const startYear = Number(match[1]);
  const endYearSuffix = Number(match[2]);

  if (!Number.isFinite(startYear) || !Number.isFinite(endYearSuffix)) {
    return null;
  }

  const expectedSuffix = (startYear + 1) % 100;

  if (endYearSuffix !== expectedSuffix) {
    return null;
  }

  return startYear;
}

function getLondonParts(date: Date): { year: number; month: number } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
  };
}

export function getCurrentAcademicYearLabel(now: Date): string {
  const { year, month } = getLondonParts(now);
  const startYear = month >= ACADEMIC_YEAR_START_MONTH + 1 ? year : year - 1;

  return formatAcademicYearLabel(startYear);
}
