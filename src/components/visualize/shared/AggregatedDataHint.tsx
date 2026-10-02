interface AggregatedDataHintProps {
  /** Label of the column that holds the number of cases per record. */
  countLabel: string;
  /** Switch the chart to adding up that column. */
  onUseCounts: () => void;
}

/**
 * Shown when a chart is counting the rows of a dataset whose rows are reports
 * rather than cases. The count is then the number of reports, which is the
 * same for every district and month, and reads as a chart with nothing in it.
 */
export function AggregatedDataHint({ countLabel, onUseCounts }: AggregatedDataHintProps) {
  return (
    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
      Each record in this dataset is a report with a number of cases, so this counts reports, not cases.{' '}
      <button onClick={onUseCounts} className="font-medium underline hover:text-amber-900">
        Add up {countLabel} instead
      </button>
    </p>
  );
}
