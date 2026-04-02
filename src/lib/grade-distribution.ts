export type BoxPlotStats = {
  count: number;
  min: number;
  q1: number;
  median: number;
  mean: number;
  q3: number;
  max: number;
  range: number;
  standardDeviation: number;
};

function quantile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 1) {
    return sortedValues[0] ?? 0;
  }

  const position = (sortedValues.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lowerValue = sortedValues[lowerIndex] ?? 0;
  const upperValue = sortedValues[upperIndex] ?? lowerValue;

  if (lowerIndex === upperIndex) {
    return lowerValue;
  }

  const weight = position - lowerIndex;
  return lowerValue + (upperValue - lowerValue) * weight;
}

export function computeBoxPlotStats(values: number[]): BoxPlotStats | null {
  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const total = sortedValues.reduce((sum, value) => sum + value, 0);
  const mean = total / sortedValues.length;
  const min = sortedValues[0] ?? 0;
  const max = sortedValues[sortedValues.length - 1] ?? 0;
  const variance =
    sortedValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sortedValues.length;

  return {
    count: sortedValues.length,
    min,
    q1: quantile(sortedValues, 0.25),
    median: quantile(sortedValues, 0.5),
    mean,
    q3: quantile(sortedValues, 0.75),
    max,
    range: max - min,
    standardDeviation: Math.sqrt(variance),
  };
}
