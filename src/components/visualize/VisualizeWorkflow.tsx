import { useState } from 'react';
import { TabHeader } from '../shared/TabHeader';
import { DatasetSummary } from './DatasetSummary';
import { ChartGallery } from './ChartGallery';
import type { ChartType } from './ChartGallery';
import type { Dataset } from '../../types/analysis';
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

const chartComponents: Record<ChartType, React.ComponentType<{ dataset: Dataset }>> = {
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4">
        <TabHeader title="Visualize" />

        {selectedChart === null ? (
          <>
            <DatasetSummary dataset={dataset} />
            <ChartGallery onSelectChart={setSelectedChart} />
          </>
        ) : (
          <div>
            <button
              onClick={() => setSelectedChart(null)}
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
              return <ChartComponent key={dataset.id} dataset={dataset} />;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
