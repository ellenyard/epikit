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
  escapeXml,
} from '../../../utils/chartExport';

type SortMode = 'gap-desc' | 'gap-asc' | 'value1' | 'alpha';

interface DumbbellPoint {
  category: string;
  value1: number;
  value2: number;
  gap: number;
}

export function DumbbellChart({ dataset }: { dataset: Dataset }) {
  const [categoryCol, setCategoryCol] = useState('');
  const [value1Col, setValue1Col] = useState('');
  const [value2Col, setValue2Col] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('gap-desc');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showLabels, setShowLabels] = useState(true);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  // Process data
  const dumbbellData = useMemo((): DumbbellPoint[] => {
    if (!categoryCol || !value1Col || !value2Col) return [];

    const grouped = new Map<string, { v1: number[]; v2: number[] }>();

    for (const record of dataset.records) {
      const cat = record[categoryCol];
      const v1 = Number(record[value1Col]);
      const v2 = Number(record[value2Col]);
      if (cat == null || cat === '' || isNaN(v1) || isNaN(v2)) continue;

      const key = String(cat);
      if (!grouped.has(key)) grouped.set(key, { v1: [], v2: [] });
      const entry = grouped.get(key)!;
      entry.v1.push(v1);
      entry.v2.push(v2);
    }

    let points: DumbbellPoint[] = Array.from(grouped.entries()).map(([category, { v1, v2 }]) => {
      const value1 = v1.reduce((a, b) => a + b, 0) / v1.length;
      const value2 = v2.reduce((a, b) => a + b, 0) / v2.length;
      return { category, value1, value2, gap: Math.abs(value2 - value1) };
    });

    // Sort
    if (sortMode === 'gap-desc') points.sort((a, b) => b.gap - a.gap);
    else if (sortMode === 'gap-asc') points.sort((a, b) => a.gap - b.gap);
    else if (sortMode === 'value1') points.sort((a, b) => b.value1 - a.value1);
    else points.sort((a, b) => a.category.localeCompare(b.category));

    return points;
  }, [dataset.records, categoryCol, value1Col, value2Col, sortMode]);

  // Generate SVG
  const svgContent = useMemo(() => {
    if (dumbbellData.length === 0) return '';

    const dims = getDefaultDimensions('dumbbell');
    const rowHeight = 28;
    const minPlotHeight = dumbbellData.length * rowHeight;
    const width = dims.width;
    const height = Math.max(dims.height, minPlotHeight + dims.margin.top + dims.margin.bottom);
    const { margin } = dims;
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // Value range
    const allValues = dumbbellData.flatMap(d => [d.value1, d.value2]);
    let minVal = Math.min(0, ...allValues);
    let maxVal = Math.max(...allValues);
    const range = maxVal - minVal || 1;
    minVal = Math.max(0, minVal - range * 0.05);
    maxVal = maxVal + range * 0.1;
    const valRange = maxVal - minVal || 1;

    const xScale = (v: number) => margin.left + ((v - minVal) / valRange) * plotW;
    const yScale = (i: number) => margin.top + (i + 0.5) * (plotH / dumbbellData.length);

    const colors = getChartColors(2, colorScheme);
    const dotRadius = 6;

    let svg = '';

    // Title
    if (title) {
      svg += svgTitle(width, title, subtitle || undefined);
    }

    // Legend
    const col1Label = dataset.columns.find(c => c.key === value1Col)?.label || value1Col;
    const col2Label = dataset.columns.find(c => c.key === value2Col)?.label || value2Col;
    const legendY = margin.top - 12;
    svg += `<circle cx="${margin.left}" cy="${legendY}" r="4" fill="${colors[0]}"/>`;
    svg += svgText(margin.left + 8, legendY, col1Label, { anchor: 'start', fontSize: 11, fill: '#555', dy: '0.35em' });
    svg += `<circle cx="${margin.left + 150}" cy="${legendY}" r="4" fill="${colors[1]}"/>`;
    svg += svgText(margin.left + 158, legendY, col2Label, { anchor: 'start', fontSize: 11, fill: '#555', dy: '0.35em' });

    // Vertical gridlines
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const tickVal = minVal + (valRange / tickCount) * i;
      const x = xScale(tickVal);
      svg += svgGridLine(x, margin.top, x, margin.top + plotH);
      const label = Number.isInteger(tickVal) ? String(tickVal) : tickVal.toFixed(1);
      svg += svgText(x, margin.top + plotH + 18, label, {
        anchor: 'middle', fontSize: 11, fill: '#888',
      });
    }

    // Axes
    svg += svgAxisLine(margin.left, margin.top, margin.left, margin.top + plotH);
    svg += svgAxisLine(margin.left, margin.top + plotH, margin.left + plotW, margin.top + plotH);

    // Draw dumbbells
    for (let i = 0; i < dumbbellData.length; i++) {
      const point = dumbbellData[i];
      const y = yScale(i);
      const x1 = xScale(point.value1);
      const x2 = xScale(point.value2);

      // Category label
      const labelText = point.category.length > 22 ? point.category.slice(0, 20) + '\u2026' : point.category;
      svg += svgText(margin.left - 8, y, escapeXml(labelText), {
        anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em',
      });

      // Connecting line
      svg += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#BBBFC4" stroke-width="2.5"/>`;

      // Dot 1
      svg += `<circle cx="${x1}" cy="${y}" r="${dotRadius}" fill="${colors[0]}" stroke="white" stroke-width="1.5"/>`;

      // Dot 2
      svg += `<circle cx="${x2}" cy="${y}" r="${dotRadius}" fill="${colors[1]}" stroke="white" stroke-width="1.5"/>`;

      // Value labels
      if (showLabels) {
        const lab1 = Number.isInteger(point.value1) ? String(point.value1) : point.value1.toFixed(1);
        const lab2 = Number.isInteger(point.value2) ? String(point.value2) : point.value2.toFixed(1);
        // Position labels on the outer sides of each dot
        const leftDot = x1 < x2 ? x1 : x2;
        const rightDot = x1 < x2 ? x2 : x1;
        const leftLabel = x1 < x2 ? lab1 : lab2;
        const rightLabel = x1 < x2 ? lab2 : lab1;

        svg += svgText(leftDot - dotRadius - 3, y, leftLabel, {
          anchor: 'end', fontSize: 10, fill: '#555', dy: '0.35em',
        });
        svg += svgText(rightDot + dotRadius + 3, y, rightLabel, {
          anchor: 'start', fontSize: 10, fill: '#555', dy: '0.35em',
        });
      }
    }

    // Source
    if (source) {
      svg += svgSource(width, height, source);
    }

    return svgWrapper(width, height, svg);
  }, [dumbbellData, showLabels, colorScheme, title, subtitle, source, value1Col, value2Col, dataset.columns]);

  const displayTitle = title || 'Dumbbell Chart';

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Dumbbell Chart Configuration</h3>

          <div className="border border-blue-100 rounded-lg overflow-hidden mb-3">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="w-full flex items-center justify-between px-3 py-2 bg-blue-50 text-sm font-medium text-blue-800 hover:bg-blue-100 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                When to Use This Chart
              </span>
              <svg className={`w-4 h-4 transition-transform ${showGuide ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showGuide && (
              <div className="px-3 py-2 text-xs text-blue-700 space-y-1.5 bg-white">
                <p>{'\u2022'} Comparing two values per category (e.g., before/after, male/female, vaccinated/unvaccinated)</p>
                <p>{'\u2022'} Showing the gap or disparity between two groups across many categories</p>
                <p>{'\u2022'} When you have 5{'\u2013'}20+ categories and need a cleaner look than grouped bars</p>
                <p className="text-blue-500 italic mt-2">Aligns with CDC COVE principles for reducing visual clutter in comparisons.</p>
              </div>
            )}
          </div>

          <VisualizationTip
            tip="Dumbbell charts excel at showing the gap between two values. The connecting line makes disparities immediately visible, so viewers can quickly spot which categories have the largest or smallest gaps."
            context="Best for comparing exactly two values per category, such as pre/post intervention or between two demographic groups."
          />

          <VariableMapper
            label="Category"
            description="Categorical variable for each row"
            columns={dataset.columns}
            value={categoryCol}
            onChange={setCategoryCol}
            filterTypes={['text', 'categorical']}
            required
          />

          <VariableMapper
            label="Value 1"
            description="First numeric column (e.g., before, group A)"
            columns={dataset.columns}
            value={value1Col}
            onChange={setValue1Col}
            filterTypes={['number']}
            required
          />

          <VariableMapper
            label="Value 2"
            description="Second numeric column (e.g., after, group B)"
            columns={dataset.columns}
            value={value2Col}
            onChange={setValue2Col}
            filterTypes={['number']}
            required
          />

          {/* Sort mode */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="gap-desc">Gap (largest first)</option>
              <option value="gap-asc">Gap (smallest first)</option>
              <option value="value1">Value 1 (high to low)</option>
              <option value="alpha">Alphabetical</option>
            </select>
          </div>

          {/* Color scheme */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Color Scheme</label>
            <select
              value={colorScheme}
              onChange={e => setColorScheme(e.target.value as ChartColorScheme)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="evergreen">Evergreen</option>
              <option value="colorblind">Colorblind-safe</option>
              <option value="grayscale">Grayscale</option>
              <option value="blue">Blue</option>
              <option value="warm">Warm</option>
            </select>
          </div>
        </div>

        {/* Display options */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Display Options</h4>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={e => setShowLabels(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Show value labels
          </label>
        </div>

        {/* Annotations */}
        <div className="border-t border-gray-200 pt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Chart title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
            <input
              type="text"
              value={subtitle}
              onChange={e => setSubtitle(e.target.value)}
              placeholder="Optional subtitle"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input
              type="text"
              value={source}
              onChange={e => setSource(e.target.value)}
              placeholder="Data source"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-w-0">
        {svgContent ? (
          <ChartContainer
            title={displayTitle}
            subtitle={subtitle || undefined}
            source={source || undefined}
            svgContent={svgContent}
            filename="dumbbell-chart"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Configure the dumbbell chart</p>
            <p className="text-gray-400 text-sm mt-2">
              Select a category, and two numeric value columns to compare.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
