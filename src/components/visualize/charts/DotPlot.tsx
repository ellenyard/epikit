import { useState, useMemo } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { getChartColors, type ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgTitle,
  svgSource,
  svgText,
  svgAxisLine,
  svgGridLine,
} from '../../../utils/chartExport';

interface DotPlotProps {
  dataset: Dataset;
}

type SortMode = 'value' | 'alphabetical';

export function DotPlot({ dataset }: DotPlotProps) {
  const [categoryCol, setCategoryCol] = useState('');
  const [value1Col, setValue1Col] = useState('');
  const [value2Col, setValue2Col] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('value');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showLabels, setShowLabels] = useState(true);
  const [title, setTitle] = useState('Dot Plot');
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');

  const svgContent = useMemo(() => {
    if (!categoryCol || !value1Col) return '';

    const dims = getDefaultDimensions('dot');
    const { width, height, margin } = dims;
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // Aggregate data: for each category, compute average of value column(s)
    const categoryMap = new Map<string, { sum1: number; count1: number; sum2: number; count2: number }>();

    for (const rec of dataset.records) {
      const cat = rec[categoryCol];
      if (cat === null || cat === undefined || cat === '') continue;
      const catStr = String(cat);

      if (!categoryMap.has(catStr)) {
        categoryMap.set(catStr, { sum1: 0, count1: 0, sum2: 0, count2: 0 });
      }
      const entry = categoryMap.get(catStr)!;

      const v1 = Number(rec[value1Col]);
      if (!isNaN(v1)) {
        entry.sum1 += v1;
        entry.count1++;
      }

      if (value2Col) {
        const v2 = Number(rec[value2Col]);
        if (!isNaN(v2)) {
          entry.sum2 += v2;
          entry.count2++;
        }
      }
    }

    // Build data rows
    let rows = Array.from(categoryMap.entries()).map(([cat, agg]) => ({
      category: cat,
      val1: agg.count1 > 0 ? agg.sum1 / agg.count1 : 0,
      val2: value2Col && agg.count2 > 0 ? agg.sum2 / agg.count2 : null,
    }));

    // Sort
    if (sortMode === 'value') {
      rows.sort((a, b) => b.val1 - a.val1);
    } else {
      rows.sort((a, b) => a.category.localeCompare(b.category));
    }

    if (rows.length === 0) return '';

    // Determine value range
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const r of rows) {
      if (r.val1 < minVal) minVal = r.val1;
      if (r.val1 > maxVal) maxVal = r.val1;
      if (r.val2 !== null) {
        if (r.val2 < minVal) minVal = r.val2;
        if (r.val2 > maxVal) maxVal = r.val2;
      }
    }

    // Add padding to range
    const range = maxVal - minVal || 1;
    const paddedMin = Math.max(0, minVal - range * 0.05);
    const paddedMax = maxVal + range * 0.1;
    const valRange = paddedMax - paddedMin || 1;

    const hasTwoSeries = value2Col !== '';
    const colors = getChartColors(2, colorScheme);
    const dotRadius = 5;
    const rowHeight = Math.min(plotH / rows.length, 30);
    const actualPlotH = rowHeight * rows.length;

    // Dynamically adjust height if many categories
    const adjustedHeight = margin.top + actualPlotH + margin.bottom;

    // Scale helpers
    const xScale = (val: number) => margin.left + ((val - paddedMin) / valRange) * plotW;
    const yScale = (i: number) => margin.top + i * rowHeight + rowHeight / 2;

    let svg = '';

    // Title
    svg += svgTitle(width, title, subtitle || undefined);

    // Grid lines (vertical)
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const val = paddedMin + (valRange * i) / tickCount;
      const x = xScale(val);
      svg += svgGridLine(x, margin.top, x, margin.top + actualPlotH);
      // Tick label
      const formatted = val >= 1000 ? `${(val / 1000).toFixed(1)}k` : Number.isInteger(val) ? String(val) : val.toFixed(1);
      svg += svgText(x, margin.top + actualPlotH + 18, formatted, { fontSize: 10, fill: '#666' });
    }

    // X-axis line
    svg += svgAxisLine(margin.left, margin.top + actualPlotH, margin.left + plotW, margin.top + actualPlotH);
    // Y-axis line
    svg += svgAxisLine(margin.left, margin.top, margin.left, margin.top + actualPlotH);

    // Rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cy = yScale(i);

      // Category label (left side)
      const labelText = row.category.length > 22 ? row.category.slice(0, 20) + '...' : row.category;
      svg += svgText(margin.left - 8, cy, labelText, { anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em' });

      // Thin baseline
      svg += `<line x1="${margin.left}" y1="${cy}" x2="${margin.left + plotW}" y2="${cy}" stroke="#E5E7EB" stroke-width="1"/>`;

      // Connecting line between dots if two series
      if (hasTwoSeries && row.val2 !== null) {
        const x1 = xScale(row.val1);
        const x2 = xScale(row.val2);
        svg += `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" stroke="#999" stroke-width="1.5"/>`;
      }

      // Dot 1
      const dot1X = xScale(row.val1);
      svg += `<circle cx="${dot1X}" cy="${cy}" r="${dotRadius}" fill="${colors[0]}" stroke="white" stroke-width="1"/>`;

      // Value label for dot 1
      if (showLabels) {
        const labelVal1 = Number.isInteger(row.val1) ? String(row.val1) : row.val1.toFixed(1);
        const labelAnchor = hasTwoSeries && row.val2 !== null && row.val2 > row.val1 ? 'end' as const : 'start' as const;
        const labelOffset = labelAnchor === 'start' ? dotRadius + 4 : -(dotRadius + 4);
        svg += svgText(dot1X + labelOffset, cy, labelVal1, { anchor: labelAnchor, fontSize: 10, fill: '#555', dy: '0.35em' });
      }

      // Dot 2
      if (hasTwoSeries && row.val2 !== null) {
        const dot2X = xScale(row.val2);
        svg += `<circle cx="${dot2X}" cy="${cy}" r="${dotRadius}" fill="${colors[1]}" stroke="white" stroke-width="1"/>`;

        if (showLabels) {
          const labelVal2 = Number.isInteger(row.val2) ? String(row.val2) : row.val2.toFixed(1);
          const labelAnchor = row.val2 >= row.val1 ? 'start' as const : 'end' as const;
          const labelOffset = labelAnchor === 'start' ? dotRadius + 4 : -(dotRadius + 4);
          svg += svgText(dot2X + labelOffset, cy, labelVal2, { anchor: labelAnchor, fontSize: 10, fill: '#555', dy: '0.35em' });
        }
      }
    }

    // Legend (if two series)
    if (hasTwoSeries) {
      const col1Label = dataset.columns.find(c => c.key === value1Col)?.label || value1Col;
      const col2Label = dataset.columns.find(c => c.key === value2Col)?.label || value2Col;
      const legendY = margin.top - 10;
      const legendX = margin.left;

      svg += `<circle cx="${legendX}" cy="${legendY}" r="4" fill="${colors[0]}"/>`;
      svg += svgText(legendX + 8, legendY, col1Label, { anchor: 'start', fontSize: 10, fill: '#555', dy: '0.35em' });

      svg += `<circle cx="${legendX + 120}" cy="${legendY}" r="4" fill="${colors[1]}"/>`;
      svg += svgText(legendX + 128, legendY, col2Label, { anchor: 'start', fontSize: 10, fill: '#555', dy: '0.35em' });
    }

    // Source
    if (source) {
      svg += svgSource(width, adjustedHeight, source);
    }

    return svgWrapper(width, adjustedHeight, svg);
  }, [categoryCol, value1Col, value2Col, sortMode, colorScheme, showLabels, title, subtitle, source, dataset]);

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Data Mapping</h4>

          <VariableMapper
            label="Category"
            description="Groups shown on the y-axis"
            columns={dataset.columns}
            value={categoryCol}
            onChange={setCategoryCol}
            filterTypes={['text', 'categorical']}
            required
          />

          <VariableMapper
            label="Value 1"
            description="Numeric column for first series of dots"
            columns={dataset.columns}
            value={value1Col}
            onChange={setValue1Col}
            filterTypes={['number']}
            required
          />

          <VariableMapper
            label="Value 2"
            description="Optional second series for comparison"
            columns={dataset.columns}
            value={value2Col}
            onChange={setValue2Col}
            filterTypes={['number']}
            placeholder="None (single series)"
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Options</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort</label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="value">By value (descending)</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Color Scheme</label>
            <select
              value={colorScheme}
              onChange={(e) => setColorScheme(e.target.value as ChartColorScheme)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="evergreen">Evergreen</option>
              <option value="colorblind">Colorblind-safe</option>
              <option value="grayscale">Grayscale</option>
              <option value="blue">Blue sequential</option>
              <option value="warm">Warm</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show value labels
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Annotations</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <VisualizationTip
          tip="Cleveland dot plots reduce visual clutter compared to bar charts. Use two series to highlight gaps between groups."
          context="Best for comparing a single quantitative value across categories"
        />
      </div>

      {/* Chart area */}
      <div className="flex-1 min-w-0">
        {svgContent ? (
          <ChartContainer
            title={title}
            subtitle={subtitle}
            source={source}
            svgContent={svgContent}
            filename="dot-plot"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Select a category and value column to create a dot plot</p>
            <p className="text-gray-400 text-sm mt-2">Map your data using the panel on the left</p>
          </div>
        )}
      </div>
    </div>
  );
}
