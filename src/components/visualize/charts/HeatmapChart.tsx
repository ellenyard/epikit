import { useState, useMemo } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import type { ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgTitle,
  svgSource,
  svgText,
} from '../../../utils/chartExport';

interface HeatmapChartProps {
  dataset: Dataset;
}

type ValueMode = 'count' | 'average';

// Sequential color ramps for heatmap intensity
const COLOR_RAMPS: Record<string, { light: string; dark: string }> = {
  blue: { light: '#DEEBF7', dark: '#08306B' },
  evergreen: { light: '#D4E8D9', dark: '#1A4D2E' },
  warm: { light: '#FEEDDE', dark: '#7F2704' },
  grayscale: { light: '#F0F0F0', dark: '#2D2D2D' },
  colorblind: { light: '#D1ECF1', dark: '#0077BB' },
};

function interpolateColor(light: string, dark: string, t: number): string {
  // Parse hex to RGB
  const lR = parseInt(light.slice(1, 3), 16);
  const lG = parseInt(light.slice(3, 5), 16);
  const lB = parseInt(light.slice(5, 7), 16);
  const dR = parseInt(dark.slice(1, 3), 16);
  const dG = parseInt(dark.slice(3, 5), 16);
  const dB = parseInt(dark.slice(5, 7), 16);

  const r = Math.round(lR + (dR - lR) * t);
  const g = Math.round(lG + (dG - lG) * t);
  const b = Math.round(lB + (dB - lB) * t);

  return `rgb(${r},${g},${b})`;
}

function textColorForBg(t: number): string {
  return t > 0.55 ? '#FFFFFF' : '#333333';
}

export function HeatmapChart({ dataset }: HeatmapChartProps) {
  const [rowCol, setRowCol] = useState('');
  const [colCol, setColCol] = useState('');
  const [valueMode, setValueMode] = useState<ValueMode>('count');
  const [valueCol, setValueCol] = useState('');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('blue');
  const [showCellLabels, setShowCellLabels] = useState(true);
  const [title, setTitle] = useState('Heatmap');
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');

  const svgContent = useMemo(() => {
    if (!rowCol || !colCol) return '';
    if (valueMode === 'average' && !valueCol) return '';

    const dims = getDefaultDimensions('heatmap');
    const { width, margin } = dims;

    // Collect unique row and column values
    const rowValues = new Set<string>();
    const colValues = new Set<string>();

    for (const rec of dataset.records) {
      const rv = rec[rowCol];
      const cv = rec[colCol];
      if (rv !== null && rv !== undefined && rv !== '') rowValues.add(String(rv));
      if (cv !== null && cv !== undefined && cv !== '') colValues.add(String(cv));
    }

    const rows = Array.from(rowValues).sort();
    const cols = Array.from(colValues).sort();

    if (rows.length === 0 || cols.length === 0) return '';

    // Build matrix
    const matrix = new Map<string, { sum: number; count: number }>();
    for (const rec of dataset.records) {
      const rv = rec[rowCol];
      const cv = rec[colCol];
      if (rv === null || rv === undefined || rv === '') continue;
      if (cv === null || cv === undefined || cv === '') continue;

      const key = `${String(rv)}|||${String(cv)}`;
      if (!matrix.has(key)) {
        matrix.set(key, { sum: 0, count: 0 });
      }
      const entry = matrix.get(key)!;
      entry.count++;

      if (valueMode === 'average' && valueCol) {
        const v = Number(rec[valueCol]);
        if (!isNaN(v)) {
          entry.sum += v;
        }
      }
    }

    // Get cell values
    const cellValues: number[][] = [];
    let globalMin = Infinity;
    let globalMax = -Infinity;

    for (let ri = 0; ri < rows.length; ri++) {
      cellValues[ri] = [];
      for (let ci = 0; ci < cols.length; ci++) {
        const key = `${rows[ri]}|||${cols[ci]}`;
        const entry = matrix.get(key);
        let val = 0;
        if (entry) {
          val = valueMode === 'count' ? entry.count : (entry.count > 0 ? entry.sum / entry.count : 0);
        }
        cellValues[ri][ci] = val;
        if (val < globalMin) globalMin = val;
        if (val > globalMax) globalMax = val;
      }
    }

    const valRange = globalMax - globalMin || 1;

    // Dynamic sizing
    const maxColLabelLen = Math.max(...cols.map(c => c.length));
    const rotateColLabels = cols.length > 6 || maxColLabelLen > 8;
    const colLabelHeight = rotateColLabels ? Math.min(maxColLabelLen * 5.5, 80) : 20;
    const adjustedTop = margin.top + colLabelHeight;

    const maxRowLabelLen = Math.max(...rows.map(r => r.length));
    const adjustedLeft = Math.max(margin.left, maxRowLabelLen * 6.5 + 16);

    const legendWidth = 20;
    const legendGap = 30;
    const adjustedRight = margin.right + legendWidth + legendGap + 30;

    const plotW = width - adjustedLeft - adjustedRight;
    const cellW = Math.max(plotW / cols.length, 20);
    const cellH = Math.max(Math.min(30, 400 / rows.length), 16);
    const actualPlotW = cellW * cols.length;
    const actualPlotH = cellH * rows.length;
    const adjustedHeight = adjustedTop + actualPlotH + margin.bottom;

    const ramp = COLOR_RAMPS[colorScheme] || COLOR_RAMPS.blue;

    let svg = '';

    // Title
    svg += svgTitle(width, title, subtitle || undefined);

    // Column labels (top)
    for (let ci = 0; ci < cols.length; ci++) {
      const x = adjustedLeft + ci * cellW + cellW / 2;
      const y = adjustedTop - 6;
      const labelText = cols[ci].length > 14 ? cols[ci].slice(0, 12) + '...' : cols[ci];

      if (rotateColLabels) {
        svg += svgText(x, y, labelText, { anchor: 'start', fontSize: 10, fill: '#555', rotate: -45 });
      } else {
        svg += svgText(x, y, labelText, { anchor: 'middle', fontSize: 10, fill: '#555' });
      }
    }

    // Row labels (left side) and cells
    for (let ri = 0; ri < rows.length; ri++) {
      const cy = adjustedTop + ri * cellH + cellH / 2;

      // Row label
      const rowLabel = rows[ri].length > 16 ? rows[ri].slice(0, 14) + '...' : rows[ri];
      svg += svgText(adjustedLeft - 8, cy, rowLabel, { anchor: 'end', fontSize: 10, fill: '#555', dy: '0.35em' });

      for (let ci = 0; ci < cols.length; ci++) {
        const cx = adjustedLeft + ci * cellW;
        const val = cellValues[ri][ci];
        const t = (val - globalMin) / valRange;
        const fillColor = interpolateColor(ramp.light, ramp.dark, t);

        // Cell rectangle
        svg += `<rect x="${cx}" y="${adjustedTop + ri * cellH}" width="${cellW}" height="${cellH}" fill="${fillColor}" stroke="white" stroke-width="1" rx="1"/>`;

        // Cell label
        if (showCellLabels && cellW >= 24 && cellH >= 14) {
          const displayVal = valueMode === 'count'
            ? String(val)
            : (Number.isInteger(val) ? String(val) : val.toFixed(1));
          const textFill = textColorForBg(t);
          svg += svgText(cx + cellW / 2, adjustedTop + ri * cellH + cellH / 2, displayVal, {
            anchor: 'middle',
            fontSize: Math.min(10, cellH - 4),
            fill: textFill,
            dy: '0.35em',
          });
        }
      }
    }

    // Border around grid
    svg += `<rect x="${adjustedLeft}" y="${adjustedTop}" width="${actualPlotW}" height="${actualPlotH}" fill="none" stroke="#CCC" stroke-width="1"/>`;

    // Color legend (gradient bar on the right)
    const legendX = adjustedLeft + actualPlotW + legendGap;
    const legendH = Math.min(actualPlotH, 200);
    const legendY = adjustedTop + (actualPlotH - legendH) / 2;
    const legendSteps = 20;
    const stepH = legendH / legendSteps;

    for (let i = 0; i < legendSteps; i++) {
      const t = 1 - i / (legendSteps - 1); // top = high, bottom = low
      const color = interpolateColor(ramp.light, ramp.dark, t);
      svg += `<rect x="${legendX}" y="${legendY + i * stepH}" width="${legendWidth}" height="${stepH + 0.5}" fill="${color}"/>`;
    }

    // Legend border
    svg += `<rect x="${legendX}" y="${legendY}" width="${legendWidth}" height="${legendH}" fill="none" stroke="#CCC" stroke-width="1"/>`;

    // Legend labels
    const maxLabel = valueMode === 'count'
      ? String(globalMax)
      : (Number.isInteger(globalMax) ? String(globalMax) : globalMax.toFixed(1));
    const minLabel = valueMode === 'count'
      ? String(globalMin)
      : (Number.isInteger(globalMin) ? String(globalMin) : globalMin.toFixed(1));

    svg += svgText(legendX + legendWidth + 6, legendY + 4, maxLabel, { anchor: 'start', fontSize: 9, fill: '#666', dy: '0em' });
    svg += svgText(legendX + legendWidth + 6, legendY + legendH, minLabel, { anchor: 'start', fontSize: 9, fill: '#666', dy: '0em' });

    // Source
    if (source) {
      svg += svgSource(width, adjustedHeight, source);
    }

    return svgWrapper(width, adjustedHeight, svg);
  }, [rowCol, colCol, valueMode, valueCol, colorScheme, showCellLabels, title, subtitle, source, dataset]);

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Data Mapping</h4>

          <VariableMapper
            label="Row Variable"
            description="Categories shown as rows"
            columns={dataset.columns}
            value={rowCol}
            onChange={setRowCol}
            filterTypes={['text', 'categorical']}
            required
          />

          <VariableMapper
            label="Column Variable"
            description="Categories shown as columns"
            columns={dataset.columns}
            value={colCol}
            onChange={setColCol}
            filterTypes={['text', 'categorical']}
            required
          />

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
            <select
              value={valueMode}
              onChange={(e) => setValueMode(e.target.value as ValueMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="count">Count (frequency)</option>
              <option value="average">Average of column</option>
            </select>
          </div>

          {valueMode === 'average' && (
            <VariableMapper
              label="Value Column"
              description="Numeric column to average per cell"
              columns={dataset.columns}
              value={valueCol}
              onChange={setValueCol}
              filterTypes={['number']}
              required
            />
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Options</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Color Scheme</label>
            <select
              value={colorScheme}
              onChange={(e) => setColorScheme(e.target.value as ChartColorScheme)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="blue">Blue (sequential)</option>
              <option value="evergreen">Evergreen</option>
              <option value="warm">Warm</option>
              <option value="grayscale">Grayscale</option>
              <option value="colorblind">Colorblind-safe</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showCellLabels}
              onChange={(e) => setShowCellLabels(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show cell labels
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
          tip="Use sequential color schemes (light-to-dark) for heatmaps. Avoid rainbow palettes, which create false boundaries."
          context="Heatmaps excel at revealing patterns in two-dimensional categorical data"
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
            filename="heatmap"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Select row and column variables to create a heatmap</p>
            <p className="text-gray-400 text-sm mt-2">Map your data using the panel on the left</p>
          </div>
        )}
      </div>
    </div>
  );
}
