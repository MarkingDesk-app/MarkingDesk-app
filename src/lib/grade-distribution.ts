export type BoxPlotStats = {
  count: number;
  min: number;
  q1: number;
  mean: number;
  q3: number;
  max: number;
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

  return {
    count: sortedValues.length,
    min: sortedValues[0] ?? 0,
    q1: quantile(sortedValues, 0.25),
    mean: total / sortedValues.length,
    q3: quantile(sortedValues, 0.75),
    max: sortedValues[sortedValues.length - 1] ?? 0,
  };
}
