import { useMemo, useRef, useState } from 'react';
import { TabHeader } from '../shared/TabHeader';
import { DatasetSummary } from './DatasetSummary';
import { ChartGallery } from './ChartGallery';
import { RecordFilter } from './RecordFilter';
import type { ChartProps } from './shared/ChartLayout';
import type { ChartType } from './ChartGallery';
import type { Dataset } from '../../types/analysis';
import {
  ALL_RECORDS,
  applySubset,
  findCaseColumn,
  resolveSubset,
  subsetNote,
  type RecordSubset,
} from '../../utils/recordSubset';
import { BarChart } from './charts/BarChart';
import { LineChart } from './charts/LineChart';
import { SlopeChart } from './charts/SlopeChart';
import { LollipopChart } from './charts/LollipopChart';
import { GroupedBarChart } from './charts/GroupedBarChart';
import { BulletChart } from './charts/BulletChart';
import { WaffleChart } from './charts/WaffleChart';
import { DotPlot } from './charts/DotPlot';
import { HeatmapChart } from './charts/HeatmapChart';
import { PairedBarChart } from './charts/PairedBarChart';
import { DumbbellChart } from './charts/DumbbellChart';
import { ForestPlot } from './charts/ForestPlot';

interface VisualizeWorkflowProps {
  dataset: Dataset;
}

const chartComponents: Record<ChartType, React.ComponentType<ChartProps>> = {
  bar: BarChart,
  line: LineChart,
  slope: SlopeChart,
  lollipop: LollipopChart,
  grouped: GroupedBarChart,
  bullet: BulletChart,
  waffle: WaffleChart,
  dot: DotPlot,
  heatmap: HeatmapChart,
  paired: PairedBarChart,
  dumbbell: DumbbellChart,
  forest: ForestPlot,
};

export function VisualizeWorkflow({ dataset }: VisualizeWorkflowProps) {
  const [selectedChart, setSelectedChart] = useState<ChartType | null>(null);
  // The module's scrolling area. A chart picked from the bottom of the
  // gallery used to open with the view still scrolled to where the card was.
  const scrollArea = useRef<HTMLDivElement>(null);
  const openChart = (chart: ChartType | null) => {
    setSelectedChart(chart);
    scrollArea.current?.scrollTo({ top: 0 });
  };
  // The Records filter applies to every chart. It belongs to the dataset it
  // was set on: resolveSubset drops it when the dataset is switched.
  const [subsetChoice, setSubsetChoice] = useState<RecordSubset>(ALL_RECORDS);
  const subset = resolveSubset(subsetChoice, dataset.columns);

  const caseColumn = useMemo(() => findCaseColumn(dataset.columns, dataset.records), [dataset.columns, dataset.records]);
  const records = useMemo(() => applySubset(dataset.records, subset), [dataset.records, subset]);
  // The dataset the charts see. The same object when nothing is excluded, so
  // nothing downstream re-computes for a filter that does nothing.
  const chartDataset = useMemo(
    () => (records.length === dataset.records.length ? dataset : { ...dataset, records }),
    [dataset, records]
  );
  const filterNote = subsetNote(subset, dataset.columns, dataset.records.length, records.length, caseColumn);

  return (
    <div ref={scrollArea} className="h-full overflow-y-auto">
      <div className="p-4">
        <TabHeader title="Visualize" />

        <RecordFilter
          dataset={dataset}
          subset={subset}
          onChange={setSubsetChoice}
          caseColumn={caseColumn}
          kept={records.length}
        />

        {selectedChart === null ? (
          <>
            <DatasetSummary dataset={dataset} />
            <ChartGallery onSelectChart={openChart} />
          </>
        ) : (
          <div>
            <button
              onClick={() => openChart(null)}
              className="mb-4 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors cursor-pointer"
            >
              &larr; Back to Chart Gallery
            </button>
            {(() => {
              const ChartComponent = chartComponents[selectedChart];
              // Keyed by dataset so a chart starts afresh when the dataset is
              // switched from the toolbar. Its column choices belong to the
              // dataset they were made on; carried over, they showed a blank
              // chart with stale selections, and the forest plot wrote the
              // old dataset's case definition into the new one's saved settings.
              return <ChartComponent key={dataset.id} dataset={chartDataset} filterNote={filterNote} />;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
