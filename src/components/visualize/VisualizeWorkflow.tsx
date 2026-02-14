import { useState } from 'react';
import { TabHeader } from '../shared/TabHeader';
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
};

export function VisualizeWorkflow({ dataset }: VisualizeWorkflowProps) {
  const [selectedChart, setSelectedChart] = useState<ChartType | null>(null);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4">
        <TabHeader
          title="Visualize"
          description="Create publication-ready charts following data visualization best practices"
        />

        {selectedChart === null ? (
          <ChartGallery onSelectChart={setSelectedChart} />
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
              return <ChartComponent dataset={dataset} />;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
