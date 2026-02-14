import { useState, useMemo } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { EvergreenTip } from '../shared/EvergreenTip';
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

interface GroupedBarChartProps {
  dataset: Dataset;
}

type DisplayMode = 'grouped' | 'stacked';
type ValueMode = 'count' | 'column';

export function GroupedBarChart({ dataset }: GroupedBarChartProps) {
  const [categoryVar, setCategoryVar] = useState('');
  const [groupVar, setGroupVar] = useState('');
  const [valueMode, setValueMode] = useState<ValueMode>('count');
  const [valueVar, setValueVar] = useState('');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('grouped');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showDataLabels, setShowDataLabels] = useState(true);
  const [title, setTitle] = useState('Grouped Bar Chart');
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');

  const svgContent = useMemo(() => {
    if (!categoryVar || !groupVar) return '';
    if (valueMode === 'column' && !valueVar) return '';

    // Build data structure: category -> group -> value
    const dataMap = new Map<string, Map<string, number>>();
    const groupValuesSet = new Set<string>();
    const categoryOrder: string[] = [];

    for (const record of dataset.records) {
      const cat = record[categoryVar];
      const grp = record[groupVar];
      if (cat == null || grp == null || cat === '' || grp === '') continue;

      const catStr = String(cat);
      const grpStr = String(grp);
      groupValuesSet.add(grpStr);

      if (!dataMap.has(catStr)) {
        dataMap.set(catStr, new Map());
        categoryOrder.push(catStr);
      }

      const groupMap = dataMap.get(catStr)!;

      if (valueMode === 'count') {
        groupMap.set(grpStr, (groupMap.get(grpStr) || 0) + 1);
      } else {
        const val = Number(record[valueVar]);
        if (!isNaN(val)) {
          // Sum values for same category+group combo
          groupMap.set(grpStr, (groupMap.get(grpStr) || 0) + val);
        }
      }
    }

    if (categoryOrder.length === 0) return '';

    const groupValues = Array.from(groupValuesSet).sort();
    const colors = getChartColors(groupValues.length, colorScheme);

    const dims = getDefaultDimensions('grouped');
    const width = dims.width;

    const plotLeft = dims.margin.left;
    const plotRight = width - dims.margin.right;
    const plotWidth = plotRight - plotLeft;
    const plotTop = dims.margin.top;
    const plotBottom = dims.height - dims.margin.bottom;
    const plotHeight = plotBottom - plotTop;

    // Determine max value
    let maxValue = 0;
    if (displayMode === 'stacked') {
      for (const catGroups of dataMap.values()) {
        let total = 0;
        for (const v of catGroups.values()) total += v;
        maxValue = Math.max(maxValue, total);
      }
    } else {
      for (const catGroups of dataMap.values()) {
        for (const v of catGroups.values()) {
          maxValue = Math.max(maxValue, v);
        }
      }
    }

    const niceMax = ceilToNice(maxValue);

    // Compute bar widths
    const categoryCount = categoryOrder.length;
    const categoryWidth = plotWidth / categoryCount;
    const categoryPadding = categoryWidth * 0.2;
    const barAreaWidth = categoryWidth - categoryPadding * 2;

    let svg = '';

    // Title
    if (title) {
      svg += svgTitle(width, title, subtitle || undefined);
    }

    // Y-axis gridlines and labels
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const val = (niceMax / tickCount) * i;
      const y = plotBottom - (val / niceMax) * plotHeight;
      svg += svgGridLine(plotLeft, y, plotRight, y);
      svg += svgText(plotLeft - 10, y, formatNumber(val), {
        anchor: 'end',
        fontSize: 11,
        fill: '#666',
        dy: '0.35em',
      });
    }

    // Axes
    svg += svgAxisLine(plotLeft, plotTop, plotLeft, plotBottom);
    svg += svgAxisLine(plotLeft, plotBottom, plotRight, plotBottom);

    // Draw bars
    if (displayMode === 'grouped') {
      svg += drawGroupedBars(
        categoryOrder, groupValues, dataMap, colors,
        plotLeft, plotBottom, plotHeight, niceMax,
        categoryWidth, categoryPadding, barAreaWidth,
        showDataLabels
      );
    } else {
      svg += drawStackedBars(
        categoryOrder, groupValues, dataMap, colors,
        plotLeft, plotBottom, plotHeight, niceMax,
        categoryWidth, categoryPadding, barAreaWidth,
        showDataLabels
      );
    }

    // X-axis category labels
    const shouldRotate = categoryCount > 6;
    for (let i = 0; i < categoryOrder.length; i++) {
      const x = plotLeft + i * categoryWidth + categoryWidth / 2;
      const label = truncateLabel(categoryOrder[i], 15);
      if (shouldRotate) {
        svg += svgText(x, plotBottom + 15, label, {
          anchor: 'end',
          fontSize: 11,
          fill: '#333',
          rotate: -45,
        });
      } else {
        svg += svgText(x, plotBottom + 20, label, {
          anchor: 'middle',
          fontSize: 11,
          fill: '#333',
        });
      }
    }

    // Legend
    const legendY = dims.height - 15;
    const legendItemWidth = 100;
    const legendTotalWidth = groupValues.length * legendItemWidth;
    const legendStartX = (width - legendTotalWidth) / 2;

    for (let i = 0; i < groupValues.length; i++) {
      const lx = legendStartX + i * legendItemWidth;
      svg += `<rect x="${lx}" y="${legendY - 7}" width="12" height="12" fill="${escapeXml(colors[i])}" rx="2"/>`;
      svg += svgText(lx + 18, legendY, truncateLabel(groupValues[i], 12), {
        anchor: 'start',
        fontSize: 11,
        fill: '#333',
        dy: '0.35em',
      });
    }

    // Source
    const height = dims.height;
    if (source) {
      svg += svgSource(width, height, source);
    }

    return svgWrapper(width, height, svg);
  }, [categoryVar, groupVar, valueMode, valueVar, displayMode, colorScheme, showDataLabels, title, subtitle, source, dataset.records]);

  const isReady = categoryVar && groupVar && (valueMode === 'count' || valueVar);

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <EvergreenTip
          tip="Use grouped bars to compare values across sub-groups; use stacked bars to show how parts contribute to totals. Avoid too many groups - 2 to 4 is ideal."
          context="Grouped mode highlights comparison; stacked mode highlights composition."
        />

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Variables</h4>

          <VariableMapper
            label="Category (X-axis)"
            description="The main grouping variable"
            columns={dataset.columns}
            value={categoryVar}
            onChange={setCategoryVar}
            filterTypes={['categorical', 'text']}
            required
          />

          <VariableMapper
            label="Group Variable"
            description="Sub-groups within each category"
            columns={dataset.columns}
            value={groupVar}
            onChange={setGroupVar}
            filterTypes={['categorical', 'text']}
            required
          />

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Value
              <span className="text-red-500 ml-1">*</span>
            </label>
            <select
              value={valueMode}
              onChange={(e) => setValueMode(e.target.value as ValueMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="count">Count (frequency)</option>
              <option value="column">Numeric column</option>
            </select>
          </div>

          {valueMode === 'column' && (
            <VariableMapper
              label="Value Column"
              description="Numeric column to aggregate"
              columns={dataset.columns}
              value={valueVar}
              onChange={setValueVar}
              filterTypes={['number']}
              required
            />
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Display</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setDisplayMode('grouped')}
                className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                  displayMode === 'grouped'
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Grouped
              </button>
              <button
                onClick={() => setDisplayMode('stacked')}
                className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                  displayMode === 'stacked'
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Stacked
              </button>
            </div>
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
              <option value="blue">Blue</option>
              <option value="warm">Warm</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showDataLabels}
              onChange={(e) => setShowDataLabels(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show data labels
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Labels</h4>

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
              placeholder="Optional"
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional"
            />
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-w-0">
        {isReady && svgContent ? (
          <ChartContainer
            title={title}
            subtitle={subtitle || undefined}
            source={source || undefined}
            svgContent={svgContent}
            filename="grouped-bar-chart"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Configure the chart</p>
            <p className="text-gray-400 text-sm mt-2">
              Select a category variable, a group variable, and a value to generate the chart.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Draw bars in grouped (side-by-side) layout */
function drawGroupedBars(
  categories: string[],
  groupValues: string[],
  dataMap: Map<string, Map<string, number>>,
  colors: string[],
  plotLeft: number,
  plotBottom: number,
  plotHeight: number,
  maxValue: number,
  categoryWidth: number,
  categoryPadding: number,
  barAreaWidth: number,
  showLabels: boolean,
): string {
  let svg = '';
  const groupCount = groupValues.length;
  const barWidth = barAreaWidth / groupCount;
  const barPadding = Math.min(2, barWidth * 0.1);

  for (let ci = 0; ci < categories.length; ci++) {
    const cat = categories[ci];
    const groupMap = dataMap.get(cat);
    if (!groupMap) continue;

    for (let gi = 0; gi < groupValues.length; gi++) {
      const grp = groupValues[gi];
      const value = groupMap.get(grp) || 0;
      if (value === 0) continue;

      const barH = (value / maxValue) * plotHeight;
      const x = plotLeft + ci * categoryWidth + categoryPadding + gi * barWidth + barPadding;
      const y = plotBottom - barH;
      const w = barWidth - barPadding * 2;

      svg += `<rect x="${x}" y="${y}" width="${w}" height="${barH}" fill="${escapeXml(colors[gi])}" rx="2"/>`;

      if (showLabels && barH > 14) {
        svg += svgText(x + w / 2, y - 4, formatNumber(value), {
          anchor: 'middle',
          fontSize: 10,
          fill: '#333',
          fontWeight: 'bold',
        });
      }
    }
  }

  return svg;
}

/** Draw bars in stacked layout */
function drawStackedBars(
  categories: string[],
  groupValues: string[],
  dataMap: Map<string, Map<string, number>>,
  colors: string[],
  plotLeft: number,
  plotBottom: number,
  plotHeight: number,
  maxValue: number,
  categoryWidth: number,
  categoryPadding: number,
  barAreaWidth: number,
  showLabels: boolean,
): string {
  let svg = '';

  for (let ci = 0; ci < categories.length; ci++) {
    const cat = categories[ci];
    const groupMap = dataMap.get(cat);
    if (!groupMap) continue;

    const x = plotLeft + ci * categoryWidth + categoryPadding;
    const w = barAreaWidth;
    let currentY = plotBottom;
    let total = 0;

    // Draw segments bottom to top
    for (let gi = 0; gi < groupValues.length; gi++) {
      const grp = groupValues[gi];
      const value = groupMap.get(grp) || 0;
      if (value === 0) continue;

      total += value;
      const segH = (value / maxValue) * plotHeight;
      currentY -= segH;

      svg += `<rect x="${x}" y="${currentY}" width="${w}" height="${segH}" fill="${escapeXml(colors[gi])}" rx="${gi === groupValues.length - 1 ? 2 : 0}"/>`;

      // Segment label if enough space
      if (showLabels && segH > 16) {
        svg += svgText(x + w / 2, currentY + segH / 2, formatNumber(value), {
          anchor: 'middle',
          fontSize: 10,
          fill: '#fff',
          fontWeight: 'bold',
          dy: '0.35em',
        });
      }
    }

    // Total label on top of stacked bar
    if (showLabels && total > 0) {
      const topY = plotBottom - (total / maxValue) * plotHeight;
      svg += svgText(x + w / 2, topY - 6, formatNumber(total), {
        anchor: 'middle',
        fontSize: 10,
        fill: '#333',
        fontWeight: 'bold',
      });
    }
  }

  return svg;
}

/** Round up to a nice number for axis max */
function ceilToNice(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/** Format number for display */
function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Truncate a label string */
function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + '\u2026';
}
