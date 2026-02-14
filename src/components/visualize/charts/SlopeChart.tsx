import { useState, useMemo } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { EvergreenTip } from '../shared/EvergreenTip';
import {
  getDefaultDimensions,
  svgWrapper,
  svgTitle,
  svgSource,
  svgText,
  svgAxisLine,
  escapeXml,
} from '../../../utils/chartExport';
import { INCREASE_COLOR, DECREASE_COLOR, NEUTRAL_COLOR } from '../../../utils/chartColors';

interface SlopeChartProps {
  dataset: Dataset;
}

type InputMode = 'two-columns' | 'single-column';

interface SlopeDataPoint {
  category: string;
  startValue: number;
  endValue: number;
}

export function SlopeChart({ dataset }: SlopeChartProps) {
  const [categoryCol, setCategoryCol] = useState('');
  const [startCol, setStartCol] = useState('');
  const [endCol, setEndCol] = useState('');
  const [valueCol, setValueCol] = useState('');
  const [groupCol, setGroupCol] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('two-columns');
  const [showValues, setShowValues] = useState(true);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');

  // Detect two unique group values for single-column mode
  const groupValues = useMemo(() => {
    if (!groupCol) return [];
    const unique = new Set<string>();
    for (const record of dataset.records) {
      const v = record[groupCol];
      if (v !== null && v !== undefined && v !== '') {
        unique.add(String(v));
      }
    }
    return Array.from(unique).sort();
  }, [dataset.records, groupCol]);

  const hasTwoGroups = groupValues.length === 2;

  // Build slope data
  const slopeData = useMemo((): SlopeDataPoint[] => {
    if (!categoryCol) return [];

    if (inputMode === 'two-columns') {
      if (!startCol || !endCol) return [];
      const points: SlopeDataPoint[] = [];
      for (const record of dataset.records) {
        const cat = record[categoryCol];
        const sv = record[startCol];
        const ev = record[endCol];
        if (cat == null || cat === '' || sv == null || ev == null) continue;
        const startNum = Number(sv);
        const endNum = Number(ev);
        if (isNaN(startNum) || isNaN(endNum)) continue;
        points.push({ category: String(cat), startValue: startNum, endValue: endNum });
      }
      return points;
    } else {
      // single-column mode: pivot on group column
      if (!valueCol || !groupCol || !hasTwoGroups) return [];
      const grouped = new Map<string, { start?: number; end?: number }>();
      const [g1, g2] = groupValues;

      for (const record of dataset.records) {
        const cat = record[categoryCol];
        const grp = record[groupCol];
        const val = record[valueCol];
        if (cat == null || cat === '' || grp == null || val == null) continue;
        const num = Number(val);
        if (isNaN(num)) continue;
        const key = String(cat);
        if (!grouped.has(key)) grouped.set(key, {});
        const entry = grouped.get(key)!;
        if (String(grp) === g1) entry.start = num;
        if (String(grp) === g2) entry.end = num;
      }

      const points: SlopeDataPoint[] = [];
      for (const [category, vals] of grouped) {
        if (vals.start !== undefined && vals.end !== undefined) {
          points.push({ category, startValue: vals.start, endValue: vals.end });
        }
      }
      return points;
    }
  }, [categoryCol, startCol, endCol, valueCol, groupCol, inputMode, dataset.records, groupValues, hasTwoGroups]);

  // Generate SVG
  const svgContent = useMemo(() => {
    if (slopeData.length === 0) return '';

    const dims = getDefaultDimensions('slope');
    const { width, height, margin } = dims;
    const plotH = height - margin.top - margin.bottom;

    // Compute scale
    const allValues = slopeData.flatMap(d => [d.startValue, d.endValue]);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const valueRange = maxVal - minVal || 1;
    const padding = valueRange * 0.1;
    const scaleMin = minVal - padding;
    const scaleMax = maxVal + padding;
    const scaleRange = scaleMax - scaleMin;

    const yScale = (v: number) => margin.top + plotH - ((v - scaleMin) / scaleRange) * plotH;

    const leftX = margin.left;
    const rightX = width - margin.right;

    let svg = '';

    // Title
    if (title) {
      svg += svgTitle(width, title, subtitle || undefined);
    }

    // Left and right axis lines
    svg += svgAxisLine(leftX, margin.top, leftX, margin.top + plotH);
    svg += svgAxisLine(rightX, margin.top, rightX, margin.top + plotH);

    // Column header labels
    const startLabel = inputMode === 'two-columns'
      ? (dataset.columns.find(c => c.key === startCol)?.label || 'Start')
      : groupValues[0] || 'Start';
    const endLabel = inputMode === 'two-columns'
      ? (dataset.columns.find(c => c.key === endCol)?.label || 'End')
      : groupValues[1] || 'End';

    svg += svgText(leftX, margin.top - 10, startLabel, {
      anchor: 'middle', fontSize: 13, fontWeight: 'bold', fill: '#555',
    });
    svg += svgText(rightX, margin.top - 10, endLabel, {
      anchor: 'middle', fontSize: 13, fontWeight: 'bold', fill: '#555',
    });

    // Draw lines and labels for each category
    for (const point of slopeData) {
      const y1 = yScale(point.startValue);
      const y2 = yScale(point.endValue);

      // Determine color based on direction
      let color: string;
      if (point.endValue > point.startValue) {
        color = INCREASE_COLOR;
      } else if (point.endValue < point.startValue) {
        color = DECREASE_COLOR;
      } else {
        color = NEUTRAL_COLOR;
      }

      // Slope line
      svg += `<line x1="${leftX}" y1="${y1}" x2="${rightX}" y2="${y2}" stroke="${color}" stroke-width="2" stroke-opacity="0.8"/>`;

      // Dots at endpoints
      svg += `<circle cx="${leftX}" cy="${y1}" r="4" fill="${color}"/>`;
      svg += `<circle cx="${rightX}" cy="${y2}" r="4" fill="${color}"/>`;

      // Category labels
      svg += svgText(leftX - 8, y1, escapeXml(point.category), {
        anchor: 'end', fontSize: 11, fill: '#333', dy: '0.35em',
      });

      // Value labels
      if (showValues) {
        svg += svgText(leftX + 8, y1, String(point.startValue), {
          anchor: 'start', fontSize: 10, fill: '#666', dy: '0.35em',
        });
        svg += svgText(rightX - 8, y2, String(point.endValue), {
          anchor: 'end', fontSize: 10, fill: '#666', dy: '0.35em',
        });
      }

      // Right-side category label
      svg += svgText(rightX + 8, y2, escapeXml(point.category), {
        anchor: 'start', fontSize: 11, fill: '#333', dy: '0.35em',
      });
    }

    // Source
    if (source) {
      svg += svgSource(width, height, source);
    }

    return svgWrapper(width, height, svg);
  }, [slopeData, showValues, title, subtitle, source, startCol, endCol, inputMode, groupValues, dataset.columns]);

  const displayTitle = title || 'Slope Chart';

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Chart Configuration</h3>

          <EvergreenTip
            tip="Slope charts excel at showing change between exactly two time points or conditions. They reveal both direction and magnitude of change at a glance."
            context="Best used with 3-15 categories for readability."
          />

          {/* Input mode toggle */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Input Mode</label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setInputMode('two-columns')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  inputMode === 'two-columns'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Two Value Columns
              </button>
              <button
                onClick={() => setInputMode('single-column')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  inputMode === 'single-column'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Value + Group
              </button>
            </div>
          </div>

          <VariableMapper
            label="Category"
            description="Labels for each slope line"
            columns={dataset.columns}
            value={categoryCol}
            onChange={setCategoryCol}
            filterTypes={['text', 'categorical']}
            required
          />

          {inputMode === 'two-columns' ? (
            <>
              <VariableMapper
                label="Start Value"
                description="Numeric values for the left axis"
                columns={dataset.columns}
                value={startCol}
                onChange={setStartCol}
                filterTypes={['number']}
                required
              />
              <VariableMapper
                label="End Value"
                description="Numeric values for the right axis"
                columns={dataset.columns}
                value={endCol}
                onChange={setEndCol}
                filterTypes={['number']}
                required
              />
            </>
          ) : (
            <>
              <VariableMapper
                label="Value Column"
                description="Numeric value for each data point"
                columns={dataset.columns}
                value={valueCol}
                onChange={setValueCol}
                filterTypes={['number']}
                required
              />
              <VariableMapper
                label="Group Column"
                description="Column with exactly 2 groups (e.g., Before/After)"
                columns={dataset.columns}
                value={groupCol}
                onChange={setGroupCol}
                filterTypes={['text', 'categorical']}
                required
              />
              {groupCol && !hasTwoGroups && groupValues.length > 0 && (
                <p className="text-xs text-red-600 -mt-1">
                  Found {groupValues.length} groups. Slope chart requires exactly 2.
                </p>
              )}
            </>
          )}
        </div>

        {/* Display options */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Display Options</h4>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showValues}
              onChange={e => setShowValues(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Show value labels
          </label>
        </div>

        {/* Text inputs */}
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
            filename="slope-chart"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-500 text-sm">
              Select a category variable and value columns to generate the slope chart.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
