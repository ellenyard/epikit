import { useState, useMemo, useCallback } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import type { ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgHeader,
  svgFooter,
  svgText,
  fitText,
  estimateTextWidth,
  type ExcelExportData,
} from '../../../utils/chartExport';
import { crossAggregate } from '../../../utils/chartAggregation';
import { categoryColumns, orderCategories, recordCount } from '../../../utils/chartCategories';
import { formatFixed, decimalsForValues } from '../../../utils/chartFormat';
import { useLocale } from '../../../contexts/LocaleContext';

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
  const { config: locale } = useLocale();
  const [rowCol, setRowCol] = useState('');
  const [colCol, setColCol] = useState('');
  const [valueMode, setValueMode] = useState<ValueMode>('count');
  const [valueCol, setValueCol] = useState('');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('blue');
  const [showCellLabels, setShowCellLabels] = useState(true);
  // null means "follow the data"; a string is what the user typed.
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const catColumns = useMemo(() => categoryColumns(dataset), [dataset]);
  const colLabel = useCallback(
    (key: string) => dataset.columns.find(c => c.key === key)?.label || key,
    [dataset.columns]
  );

  // Build heatmap data
  const heatmapData = useMemo(() => {
    if (!rowCol || !colCol) return null;
    if (valueMode === 'average' && !valueCol) return null;

    const table = crossAggregate(
      dataset.records, rowCol, colCol, valueMode === 'average' ? valueCol : null,
      valueMode === 'average' ? 'mean' : 'count'
    );

    // Both axes in reading order. The column's declared order is honoured
    // here: it was dropped on the way to the shared sort, so education levels
    // read Higher, None, Primary, Secondary.
    const rows = orderCategories(table.categories, dataset.columns.find(c => c.key === rowCol));
    const cols = orderCategories(table.groups, dataset.columns.find(c => c.key === colCol));

    if (rows.length === 0 || cols.length === 0) return null;

    // Get cell values (null = no data, rendered as an empty cell)
    const cellValues: (number | null)[][] = [];
    let globalMin = Infinity;
    let globalMax = -Infinity;

    for (let ri = 0; ri < rows.length; ri++) {
      cellValues[ri] = [];
      for (let ci = 0; ci < cols.length; ci++) {
        const cell = table.cells.get(rows[ri])?.get(cols[ci]);
        // A combination nobody falls in is a count of zero, but it has no average.
        const val = cell ? cell.value : (valueMode === 'count' ? 0 : null);
        cellValues[ri][ci] = val;
        if (val !== null) {
          if (val < globalMin) globalMin = val;
          if (val > globalMax) globalMax = val;
        }
      }
    }

    if (!isFinite(globalMin) || !isFinite(globalMax)) {
      globalMin = 0;
      globalMax = 0;
    }

    return { rows, cols, cellValues, globalMin, globalMax, excluded: table.excludedMissing };
  }, [rowCol, colCol, valueMode, valueCol, dataset.records, dataset.columns]);

  // What a cell's colour measures
  const statistic = valueMode === 'count' ? 'Number of records' : `Mean of ${colLabel(valueCol)}`;
  const defaultTitle = !rowCol || !colCol
    ? 'Heatmap'
    : `${valueMode === 'count' ? 'Records' : statistic} by ${colLabel(rowCol)} and ${colLabel(colCol)}`;
  const title = titleOverride ?? defaultTitle;

  const svgContent = useMemo(() => {
    if (!heatmapData) return '';

    const { rows, cols, cellValues, globalMin, globalMax } = heatmapData;
    const valRange = globalMax - globalMin || 1;
    const decimals = valueMode === 'count'
      ? 0
      : decimalsForValues(cellValues.flat().filter((v): v is number => v !== null));
    const fmt = (v: number) => formatFixed(v, decimals, locale);

    const dims = getDefaultDimensions('heatmap');
    const header = svgHeader(dims.width, title, subtitle || undefined);

    // Dynamic sizing
    const colLabels = cols.map(c => fitText(c, 90, 10));
    const maxColLabelW = Math.max(...colLabels.map(l => estimateTextWidth(l, 10)));
    const rowLabels = rows.map(r => fitText(r, 170, 10));
    const adjustedLeft = Math.max(60, Math.max(...rowLabels.map(l => estimateTextWidth(l, 10))) + 34);

    const legendWidth = 20;
    const legendGap = 30;
    const adjustedRight = legendGap + legendWidth + 70;

    // Grow the canvas width when many columns need more than the default width
    const minPlotW = dims.width - adjustedLeft - adjustedRight;
    const cellW = Math.max(minPlotW / cols.length, 20);
    const rotateColLabels = maxColLabelW > cellW - 6;
    const colLabelHeight = rotateColLabels ? Math.min(maxColLabelW * 0.72 + 10, 80) : 16;
    // Room above the grid for the column variable's name and the column labels
    const adjustedTop = header.bottom + 24 + colLabelHeight;
    const cellH = Math.max(Math.min(30, 400 / rows.length), 16);
    const actualPlotW = cellW * cols.length;
    const width = Math.max(dims.width, adjustedLeft + actualPlotW + adjustedRight);
    const actualPlotH = cellH * rows.length;

    const ramp = COLOR_RAMPS[colorScheme] || COLOR_RAMPS.blue;

    // The header is laid out again at the final width so the title stays centred
    let svg = svgHeader(width, title, subtitle || undefined).svg;

    // Axis titles: which variable runs across and which runs down
    svg += svgText(adjustedLeft + actualPlotW / 2, header.bottom + 14, fitText(colLabel(colCol), actualPlotW, 11, true), { fontSize: 11, fontWeight: 'bold', fill: '#444' });
    svg += svgText(14, adjustedTop + actualPlotH / 2, fitText(colLabel(rowCol), Math.max(actualPlotH + 40, 120), 11, true), { fontSize: 11, fontWeight: 'bold', fill: '#444', rotate: -90 });

    // Column labels (top)
    for (let ci = 0; ci < cols.length; ci++) {
      const x = adjustedLeft + ci * cellW + cellW / 2;
      const y = adjustedTop - 6;
      if (rotateColLabels) {
        svg += svgText(x, y, colLabels[ci], { anchor: 'start', fontSize: 10, fill: '#555', rotate: -40 });
      } else {
        svg += svgText(x, y, colLabels[ci], { anchor: 'middle', fontSize: 10, fill: '#555' });
      }
    }

    // Row labels (left side) and cells
    for (let ri = 0; ri < rows.length; ri++) {
      const cy = adjustedTop + ri * cellH + cellH / 2;

      // Row label
      svg += svgText(adjustedLeft - 8, cy, rowLabels[ri], { anchor: 'end', fontSize: 10, fill: '#555', dy: '0.35em' });

      for (let ci = 0; ci < cols.length; ci++) {
        const cx = adjustedLeft + ci * cellW;
        const val = cellValues[ri][ci];

        // No-data cell (average mode with no numeric values)
        if (val === null) {
          svg += `<rect x="${cx}" y="${adjustedTop + ri * cellH}" width="${cellW}" height="${cellH}" fill="#F9FAFB" stroke="white" stroke-width="1" rx="1"/>`;
          if (showCellLabels && cellW >= 24 && cellH >= 14) {
            svg += svgText(cx + cellW / 2, adjustedTop + ri * cellH + cellH / 2, '–', {
              anchor: 'middle',
              fontSize: Math.min(10, cellH - 4),
              fill: '#9CA3AF',
              dy: '0.35em',
            });
          }
          continue;
        }

        const t = (val - globalMin) / valRange;
        const fillColor = interpolateColor(ramp.light, ramp.dark, t);

        // Cell rectangle
        svg += `<rect x="${cx}" y="${adjustedTop + ri * cellH}" width="${cellW}" height="${cellH}" fill="${fillColor}" stroke="white" stroke-width="1" rx="1"/>`;

        // Cell label
        if (showCellLabels && cellW >= 24 && cellH >= 14) {
          const textFill = textColorForBg(t);
          svg += svgText(cx + cellW / 2, adjustedTop + ri * cellH + cellH / 2, fmt(val), {
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

    // Color legend (gradient bar on the right), titled with what it measures
    const legendX = adjustedLeft + actualPlotW + legendGap;
    const legendH = Math.max(Math.min(actualPlotH, 200), 40);
    const legendY = adjustedTop + Math.max(0, (actualPlotH - legendH) / 2);
    const legendSteps = 20;
    const stepH = legendH / legendSteps;

    if (globalMax > globalMin) {
      for (let i = 0; i < legendSteps; i++) {
        const t = 1 - i / (legendSteps - 1); // top = high, bottom = low
        const color = interpolateColor(ramp.light, ramp.dark, t);
        svg += `<rect x="${legendX}" y="${legendY + i * stepH}" width="${legendWidth}" height="${stepH + 0.5}" fill="${color}"/>`;
      }
      svg += `<rect x="${legendX}" y="${legendY}" width="${legendWidth}" height="${legendH}" fill="none" stroke="#CCC" stroke-width="1"/>`;
      svg += svgText(legendX + legendWidth + 6, legendY + 8, fmt(globalMax), { anchor: 'start', fontSize: 9, fill: '#555' });
      svg += svgText(legendX + legendWidth + 6, legendY + legendH, fmt(globalMin), { anchor: 'start', fontSize: 9, fill: '#555' });
    } else {
      // Every cell holds the same value, so there is no range for a ramp to show.
      svg += `<rect x="${legendX}" y="${legendY}" width="${legendWidth}" height="${legendWidth}" fill="${ramp.light}" stroke="#CCC" stroke-width="1"/>`;
      svg += svgText(legendX + legendWidth + 6, legendY + 14, fmt(globalMax), { anchor: 'start', fontSize: 9, fill: '#555' });
    }
    svg += svgText(legendX, legendY - 8, fitText(valueMode === 'count' ? 'Records' : 'Mean', 90, 10, true), { anchor: 'start', fontSize: 10, fontWeight: 'bold', fill: '#444' });

    const notes = [
      valueMode === 'count'
        ? `Cells show the number of records for each ${colLabel(rowCol)} and ${colLabel(colCol)}.`
        : `Cells show the mean of ${colLabel(valueCol)} for each ${colLabel(rowCol)} and ${colLabel(colCol)}. A dash marks a combination with no value.`,
    ];
    if (heatmapData.excluded > 0) {
      const fields = [colLabel(rowCol), colLabel(colCol), valueMode === 'average' && colLabel(valueCol)].filter(Boolean);
      notes.push(`${recordCount(heatmapData.excluded)} excluded: no value for ${fields.join(' or ')}.`);
    }
    const footer = svgFooter(width, adjustedTop + Math.max(actualPlotH, legendY + legendH - adjustedTop) + 8, notes, source || undefined);

    return svgWrapper(width, footer.height, svg + footer.svg);
  }, [heatmapData, valueMode, rowCol, colCol, valueCol, colorScheme, showCellLabels, title, subtitle, source, locale, colLabel]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    if (!heatmapData) {
      return { columns: [], rows: [] };
    }
    const { rows, cols, cellValues } = heatmapData;
    const columns = [
      { header: `${colLabel(rowCol)} \\ ${colLabel(colCol)}`, key: '__row' },
      ...cols.map((col, ci) => ({ header: col, key: `c${ci}` })),
    ];
    const excelRows = rows.map((rowLabel, ri) => {
      const row: Record<string, string | number | null> = { __row: rowLabel };
      for (let ci = 0; ci < cols.length; ci++) {
        row[`c${ci}`] = cellValues[ri][ci];
      }
      return row;
    });
    return {
      title,
      subtitle: subtitle ? `${subtitle} (${statistic})` : statistic,
      source: source || undefined,
      columns,
      rows: excelRows,
    };
  }, [heatmapData, rowCol, colCol, statistic, title, subtitle, source, colLabel]);

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Data Mapping</h4>

          <VariableMapper
            label="Row Variable"
            description="Categories shown as rows"
            columns={catColumns}
            value={rowCol}
            onChange={setRowCol}
            required
          />

          <VariableMapper
            label="Column Variable"
            description="Categories shown as columns"
            columns={catColumns}
            value={colCol}
            onChange={setColCol}
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
              onChange={(e) => setTitleOverride(e.target.value)}
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

        <div className="border border-blue-100 rounded-lg overflow-hidden">
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
              <p>• Cross-tabulating two categorical variables (e.g., age group × week)</p>
              <p>• Identifying clusters, hotspots, or patterns in two dimensions</p>
              <p>• Displaying surveillance data by location and time period</p>
              <p>• Showing contact matrices or exposure-outcome associations</p>
              <p className="text-blue-500 italic mt-2">Heat maps are widely used for spatial-temporal epidemiological analysis. Use sequential single-hue palettes for accessibility — avoid rainbow color scales. — CDC</p>
            </div>
          )}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-w-0">
        {svgContent ? (
          <ChartContainer
            title={title}
            svgContent={svgContent}
            excelData={excelData}
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
