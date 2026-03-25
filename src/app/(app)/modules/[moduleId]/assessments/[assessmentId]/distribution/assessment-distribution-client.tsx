"use client";

import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type DistributionSeries = {
  key: string;
  assessmentId: string;
  academicYear: string;
  markerId: string;
  markerName: string;
  isCurrentYear: boolean;
  count: number;
  min: number;
  q1: number;
  mean: number;
  q3: number;
  max: number;
};

export type DistributionMarkerSlot = {
  markerId: string;
  markerName: string;
  currentDistribution: DistributionSeries | null;
  previousDistributions: DistributionSeries[];
};

type PreviousYearOption = {
  academicYear: string;
  distributionCount: number;
};

type AssessmentDistributionClientProps = {
  moduleCode: string;
  assessmentName: string;
  academicYear: string;
  isArchived: boolean;
  slots: DistributionMarkerSlot[];
  previousYears: PreviousYearOption[];
};

type VisibleDistribution = DistributionSeries & {
  stroke: string;
  fill: string;
  dash: string | undefined;
  boxWidth: number;
  xOffset: number;
};

type TooltipState = {
  x: number;
  y: number;
  distribution: DistributionSeries;
} | null;

const CURRENT_STROKE = "#0284c7";
const CURRENT_FILL = "rgba(14, 165, 233, 0.16)";
const PREVIOUS_STROKES = ["#475569", "#0f766e", "#b45309", "#be123c"];
const PREVIOUS_FILLS = [
  "rgba(71, 85, 105, 0.10)",
  "rgba(15, 118, 110, 0.10)",
  "rgba(180, 83, 9, 0.10)",
  "rgba(190, 18, 60, 0.10)",
];

function formatStat(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildMarkerLabelLines(markerName: string): string[] {
  if (markerName.length <= 16) {
    return [markerName];
  }

  const words = markerName.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > 16 && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 2);
}

function getPreviousOffset(index: number): number {
  const step = 12;
  const direction = index % 2 === 0 ? -1 : 1;
  const distance = Math.floor(index / 2) + 1;
  return direction * distance * step;
}

function useVisibleSlots(slots: DistributionMarkerSlot[], includePreviousYears: boolean): DistributionMarkerSlot[] {
  return useMemo(
    () =>
      slots.filter((slot) => {
        if (slot.currentDistribution) {
          return true;
        }

        return includePreviousYears && slot.previousDistributions.length > 0;
      }),
    [includePreviousYears, slots]
  );
}

export function AssessmentDistributionClient({
  moduleCode,
  assessmentName,
  academicYear,
  isArchived,
  slots,
  previousYears,
}: AssessmentDistributionClientProps) {
  const [includePreviousYears, setIncludePreviousYears] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleSlots = useVisibleSlots(slots, includePreviousYears);
  const chartHeight = 480;
  const chartPadding = {
    top: 28,
    right: 28,
    bottom: 92,
    left: 72,
  };
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const slotWidth = 144;
  const chartWidth = Math.max(760, chartPadding.left + chartPadding.right + visibleSlots.length * slotWidth);
  const visiblePlotCount = visibleSlots.reduce(
    (sum, slot) => sum + (slot.currentDistribution ? 1 : 0) + (includePreviousYears ? slot.previousDistributions.length : 0),
    0
  );

  const legendItems = [
    {
      label: academicYear,
      stroke: CURRENT_STROKE,
      fill: CURRENT_FILL,
      dash: undefined,
    },
    ...(includePreviousYears
      ? previousYears.map((year, index) => ({
          label: year.academicYear,
          stroke: PREVIOUS_STROKES[index % PREVIOUS_STROKES.length] ?? PREVIOUS_STROKES[0],
          fill: PREVIOUS_FILLS[index % PREVIOUS_FILLS.length] ?? PREVIOUS_FILLS[0],
          dash: "5 4",
        }))
      : []),
  ];

  const toY = (value: number) => chartPadding.top + ((100 - value) / 100) * plotHeight;

  const handleDistributionHover = (
    event: ReactMouseEvent<SVGGElement>,
    distribution: DistributionSeries
  ) => {
    const bounds = containerRef.current?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    setTooltip({
      x: event.clientX - bounds.left + 14,
      y: event.clientY - bounds.top - 18,
      distribution,
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">{moduleCode}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Grade distribution</h1>
            <p className="mt-2 text-base text-slate-600">
              {assessmentName} <span className="text-slate-400">/</span> {academicYear}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isArchived ? (
                <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white">
                  Archived for audit
                </span>
              ) : null}
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {visibleSlots.length} marker{visibleSlots.length === 1 ? "" : "s"} shown
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {visiblePlotCount} distribution{visiblePlotCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includePreviousYears}
              onChange={(event) => setIncludePreviousYears(event.target.checked)}
              disabled={previousYears.length === 0}
            />
            <span>
              Include previous academic years
              {previousYears.length > 0 ? ` (${previousYears.map((year) => year.academicYear).join(", ")})` : ""}
            </span>
          </label>
        </div>
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-slate-200/80">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-xl">Marker grade distribution</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {legendItems.map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full border"
                    style={{
                      backgroundColor: item.fill,
                      borderColor: item.stroke,
                      borderStyle: item.dash ? "dashed" : "solid",
                    }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {visibleSlots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-14 text-center text-sm text-slate-500">
              No grade distribution data is available for this assessment yet.
            </div>
          ) : (
            <div ref={containerRef} className="relative overflow-x-auto pb-2" onMouseLeave={() => setTooltip(null)}>
              <svg width={chartWidth} height={chartHeight} className="min-w-full">
                {Array.from({ length: 11 }, (_, index) => {
                  const value = index * 10;
                  const y = toY(value);

                  return (
                    <g key={value}>
                      <line
                        x1={chartPadding.left}
                        x2={chartWidth - chartPadding.right}
                        y1={y}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeDasharray={value === 0 || value === 100 ? undefined : "3 5"}
                      />
                      <text
                        x={chartPadding.left - 14}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="12"
                        fill="#64748b"
                      >
                        {value}
                      </text>
                    </g>
                  );
                })}

                <line
                  x1={chartPadding.left}
                  x2={chartPadding.left}
                  y1={chartPadding.top}
                  y2={chartHeight - chartPadding.bottom}
                  stroke="#94a3b8"
                />
                <line
                  x1={chartPadding.left}
                  x2={chartWidth - chartPadding.right}
                  y1={chartHeight - chartPadding.bottom}
                  y2={chartHeight - chartPadding.bottom}
                  stroke="#94a3b8"
                />

                <text
                  x={24}
                  y={chartPadding.top - 8}
                  fontSize="12"
                  fontWeight="600"
                  fill="#64748b"
                >
                  Grade
                </text>

                {visibleSlots.map((slot, index) => {
                  const centerX = chartPadding.left + slotWidth * index + slotWidth / 2;
                  const visibleDistributions: VisibleDistribution[] = [
                    ...(slot.currentDistribution
                      ? [
                          {
                            ...slot.currentDistribution,
                            stroke: CURRENT_STROKE,
                            fill: CURRENT_FILL,
                            dash: undefined,
                            boxWidth: 34,
                            xOffset: 0,
                          },
                        ]
                      : []),
                    ...(includePreviousYears
                      ? slot.previousDistributions.map((distribution, previousIndex) => ({
                          ...distribution,
                          stroke:
                            PREVIOUS_STROKES[
                              previousYears.findIndex((year) => year.academicYear === distribution.academicYear) %
                                PREVIOUS_STROKES.length
                            ] ?? PREVIOUS_STROKES[0],
                          fill:
                            PREVIOUS_FILLS[
                              previousYears.findIndex((year) => year.academicYear === distribution.academicYear) %
                                PREVIOUS_FILLS.length
                            ] ?? PREVIOUS_FILLS[0],
                          dash: "5 4",
                          boxWidth: 20,
                          xOffset: getPreviousOffset(previousIndex),
                        }))
                      : []),
                  ];

                  return (
                    <g key={slot.markerId}>
                      {visibleDistributions.map((distribution) => {
                        const x = centerX + distribution.xOffset;
                        const minY = toY(distribution.min);
                        const q1Y = toY(distribution.q1);
                        const meanY = toY(distribution.mean);
                        const q3Y = toY(distribution.q3);
                        const maxY = toY(distribution.max);
                        const rectTop = Math.min(q1Y, q3Y);
                        const rectHeight = Math.max(Math.abs(q1Y - q3Y), 4);
                        const whiskerTop = Math.min(minY, maxY);
                        const whiskerHeight = Math.max(Math.abs(maxY - minY), 10);

                        return (
                          <g
                            key={distribution.key}
                            onMouseEnter={(event) => handleDistributionHover(event, distribution)}
                            onMouseMove={(event) => handleDistributionHover(event, distribution)}
                          >
                            <rect
                              x={x - distribution.boxWidth}
                              y={whiskerTop}
                              width={distribution.boxWidth * 2}
                              height={whiskerHeight}
                              fill="transparent"
                            />
                            <line
                              x1={x}
                              x2={x}
                              y1={minY}
                              y2={maxY}
                              stroke={distribution.stroke}
                              strokeWidth={2}
                              strokeDasharray={distribution.dash}
                            />
                            <line
                              x1={x - distribution.boxWidth / 1.4}
                              x2={x + distribution.boxWidth / 1.4}
                              y1={minY}
                              y2={minY}
                              stroke={distribution.stroke}
                              strokeWidth={2}
                              strokeDasharray={distribution.dash}
                            />
                            <line
                              x1={x - distribution.boxWidth / 1.4}
                              x2={x + distribution.boxWidth / 1.4}
                              y1={maxY}
                              y2={maxY}
                              stroke={distribution.stroke}
                              strokeWidth={2}
                              strokeDasharray={distribution.dash}
                            />
                            <rect
                              x={x - distribution.boxWidth / 2}
                              y={rectTop}
                              width={distribution.boxWidth}
                              height={rectHeight}
                              fill={distribution.fill}
                              stroke={distribution.stroke}
                              strokeWidth={2}
                              strokeDasharray={distribution.dash}
                              rx={6}
                            />
                            <line
                              x1={x - distribution.boxWidth / 2}
                              x2={x + distribution.boxWidth / 2}
                              y1={meanY}
                              y2={meanY}
                              stroke={distribution.stroke}
                              strokeWidth={3}
                            />
                          </g>
                        );
                      })}

                      <text
                        x={centerX}
                        y={chartHeight - chartPadding.bottom + 24}
                        textAnchor="middle"
                        fontSize="12"
                        fontWeight="600"
                        fill="#0f172a"
                      >
                        {buildMarkerLabelLines(slot.markerName).map((line, lineIndex) => (
                          <tspan key={lineIndex} x={centerX} dy={lineIndex === 0 ? 0 : 14}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {tooltip ? (
                <div
                  className="pointer-events-none absolute z-10 w-64 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                  style={{
                    left: Math.min(tooltip.x, Math.max(24, chartWidth - 280)),
                    top: Math.max(12, tooltip.y),
                  }}
                >
                  <p className="text-sm font-semibold text-slate-950">{tooltip.distribution.markerName}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    {tooltip.distribution.academicYear}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-600">
                    <span>Scripts</span>
                    <span className="text-right font-medium text-slate-900">{tooltip.distribution.count}</span>
                    <span>Min</span>
                    <span className="text-right font-medium text-slate-900">{formatStat(tooltip.distribution.min)}</span>
                    <span>Q1</span>
                    <span className="text-right font-medium text-slate-900">{formatStat(tooltip.distribution.q1)}</span>
                    <span>Mean</span>
                    <span className="text-right font-medium text-slate-900">{formatStat(tooltip.distribution.mean)}</span>
                    <span>Q3</span>
                    <span className="text-right font-medium text-slate-900">{formatStat(tooltip.distribution.q3)}</span>
                    <span>Max</span>
                    <span className="text-right font-medium text-slate-900">{formatStat(tooltip.distribution.max)}</span>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
