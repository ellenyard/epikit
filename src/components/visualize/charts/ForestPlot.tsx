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

interface ForestRow {
  label: string;
  estimate: number;
  lower: number;
  upper: number;
  weight: number;
  isPooled: boolean;
}

export function ForestPlot({ dataset }: { dataset: Dataset }) {
  const [labelCol, setLabelCol] = useState('');
  const [estimateCol, setEstimateCol] = useState('');
  const [lowerCICol, setLowerCICol] = useState('');
  const [upperCICol, setUpperCICol] = useState('');
  const [weightCol, setWeightCol] = useState('');
  const [effectMeasure, setEffectMeasure] = useState<'ratio' | 'difference'>('ratio');
  const [showNullLine, setShowNullLine] = useState(true);
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showLabels, setShowLabels] = useState(true);
  const [title, setTitle] = useState('Forest Plot');
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  // Process data
  const forestData = useMemo((): ForestRow[] => {
    if (!labelCol || !estimateCol || !lowerCICol || !upperCICol) return [];

    const rows: ForestRow[] = [];

    for (const record of dataset.records) {
      const label = record[labelCol];
      const est = Number(record[estimateCol]);
      const lo = Number(record[lowerCICol]);
      const hi = Number(record[upperCICol]);
      const wt = weightCol ? Number(record[weightCol]) : 1;

      if (label == null || label === '' || isNaN(est) || isNaN(lo) || isNaN(hi)) continue;
      // For ratio measures, skip non-positive values (can't log them)
      if (effectMeasure === 'ratio' && (est <= 0 || lo <= 0 || hi <= 0)) continue;

      const isPooled = /\b(overall|pooled|summary|total)\b/i.test(String(label));

      rows.push({
        label: String(label),
        estimate: est,
        lower: Math.min(lo, hi),
        upper: Math.max(lo, hi),
        weight: isNaN(wt) || wt <= 0 ? 1 : wt,
        isPooled,
      });
    }

    // Sort: non-pooled in original order, pooled at bottom
    const nonPooled = rows.filter(r => !r.isPooled);
    const pooled = rows.filter(r => r.isPooled);
    return [...nonPooled, ...pooled];
  }, [dataset.records, labelCol, estimateCol, lowerCICol, upperCICol, weightCol, effectMeasure]);

  // Generate SVG
  const svgContent = useMemo(() => {
    if (forestData.length === 0) return '';

    const useLog = effectMeasure === 'ratio';
    const toScale = (v: number) => useLog ? Math.log(v) : v;
    const nullValue = useLog ? 0 : 0; // log(1)=0 for ratio, 0 for difference

    const dims = getDefaultDimensions('forest');
    const rowHeight = 30;
    const minPlotHeight = forestData.length * rowHeight;
    const width = dims.width;
    const height = Math.max(dims.height, minPlotHeight + dims.margin.top + dims.margin.bottom);
    const margin = { ...dims.margin, right: showLabels ? 180 : 60 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // Compute scale range from all CI bounds
    const allScaled = forestData.flatMap(r => [toScale(r.lower), toScale(r.estimate), toScale(r.upper)]);
    let minVal = Math.min(...allScaled, nullValue);
    let maxVal = Math.max(...allScaled, nullValue);
    const range = maxVal - minVal || 1;
    minVal -= range * 0.1;
    maxVal += range * 0.1;
    const valRange = maxVal - minVal;

    const xScale = (scaled: number) => margin.left + ((scaled - minVal) / valRange) * plotW;
    const yScale = (i: number) => margin.top + (i + 0.5) * (plotH / forestData.length);

    const maxWeight = Math.max(...forestData.map(r => r.weight));
    const colors = getChartColors(2, colorScheme);

    let svg = '';

    // Title
    if (title) {
      svg += svgTitle(width, title, subtitle || undefined);
    }

    // Vertical gridlines
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const scaledVal = minVal + (valRange / tickCount) * i;
      const x = xScale(scaledVal);
      svg += svgGridLine(x, margin.top, x, margin.top + plotH);

      // Tick label — convert back to original scale for display
      const displayVal = useLog ? Math.exp(scaledVal) : scaledVal;
      const label = useLog
        ? displayVal.toFixed(displayVal < 10 ? 2 : 1)
        : displayVal.toFixed(1);
      svg += svgText(x, margin.top + plotH + 18, label, {
        anchor: 'middle', fontSize: 11, fill: '#666',
      });
    }

    // Null effect reference line (dashed)
    if (showNullLine) {
      const nullX = xScale(nullValue);
      svg += `<line x1="${nullX}" y1="${margin.top}" x2="${nullX}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1" stroke-dasharray="4,3"/>`;
      // Label the null line
      const nullLabel = useLog ? '1.0' : '0';
      svg += svgText(nullX, margin.top - 6, nullLabel, {
        anchor: 'middle', fontSize: 10, fill: '#666',
      });
    }

    // Axes
    svg += svgAxisLine(margin.left, margin.top + plotH, margin.left + plotW, margin.top + plotH);

    // X-axis label
    const axisLabel = useLog ? 'Effect Estimate (log scale)' : 'Effect Estimate';
    svg += svgText(margin.left + plotW / 2, margin.top + plotH + 40, axisLabel, {
      anchor: 'middle', fontSize: 12, fill: '#555',
    });

    // Separator line before pooled rows
    const firstPooledIdx = forestData.findIndex(r => r.isPooled);
    if (firstPooledIdx > 0) {
      const sepY = yScale(firstPooledIdx) - rowHeight / 2;
      svg += `<line x1="${margin.left}" y1="${sepY}" x2="${margin.left + plotW}" y2="${sepY}" stroke="#999" stroke-width="1" stroke-dasharray="2,2"/>`;
    }

    // Draw each row
    for (let i = 0; i < forestData.length; i++) {
      const row = forestData[i];
      const y = yScale(i);

      // Label on left
      const labelText = row.label.length > 24 ? row.label.slice(0, 22) + '\u2026' : row.label;
      svg += svgText(margin.left - 8, y, escapeXml(labelText), {
        anchor: 'end', fontSize: 11, fill: row.isPooled ? '#000' : '#333',
        fontWeight: row.isPooled ? 'bold' : 'normal', dy: '0.35em',
      });

      const xLo = xScale(toScale(row.lower));
      const xHi = xScale(toScale(row.upper));
      const xEst = xScale(toScale(row.estimate));

      // CI line
      svg += `<line x1="${xLo}" y1="${y}" x2="${xHi}" y2="${y}" stroke="${colors[0]}" stroke-width="1.5"/>`;

      // CI whiskers (small vertical caps)
      svg += `<line x1="${xLo}" y1="${y - 4}" x2="${xLo}" y2="${y + 4}" stroke="${colors[0]}" stroke-width="1.5"/>`;
      svg += `<line x1="${xHi}" y1="${y - 4}" x2="${xHi}" y2="${y + 4}" stroke="${colors[0]}" stroke-width="1.5"/>`;

      // Marker
      const markerSize = 3 + (row.weight / maxWeight) * 6;

      if (row.isPooled) {
        // Diamond for pooled estimate
        const half = markerSize + 1;
        svg += `<polygon points="${xEst},${y - half} ${xEst + half * 1.5},${y} ${xEst},${y + half} ${xEst - half * 1.5},${y}" fill="${colors[1]}" stroke="white" stroke-width="1"/>`;
      } else {
        // Square for individual studies
        svg += `<rect x="${xEst - markerSize}" y="${y - markerSize}" width="${markerSize * 2}" height="${markerSize * 2}" fill="${colors[0]}" stroke="white" stroke-width="1"/>`;
      }

      // Value label
      if (showLabels) {
        const estDisplay = row.estimate.toFixed(2);
        const loDisplay = row.lower.toFixed(2);
        const hiDisplay = row.upper.toFixed(2);
        const valText = `${estDisplay} (${loDisplay}, ${hiDisplay})`;
        svg += svgText(margin.left + plotW + 8, y, valText, {
          anchor: 'start', fontSize: 10, fill: '#555', dy: '0.35em',
        });
      }
    }

    // Favors labels below the x-axis
    if (useLog) {
      const nullX = xScale(nullValue);
      svg += svgText(nullX - plotW * 0.2, margin.top + plotH + 54, '\u2190 Favors control', {
        anchor: 'middle', fontSize: 10, fill: '#888',
      });
      svg += svgText(nullX + plotW * 0.2, margin.top + plotH + 54, 'Favors treatment \u2192', {
        anchor: 'middle', fontSize: 10, fill: '#888',
      });
    }

    // Source
    if (source) {
      svg += svgSource(width, height, source);
    }

    return svgWrapper(width, height, svg);
  }, [forestData, effectMeasure, showNullLine, showLabels, colorScheme, title, subtitle, source]);

  const displayTitle = title || 'Forest Plot';

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Forest Plot Configuration</h3>

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
                <p>{'\u2022'} Displaying effect estimates (odds ratios, relative risks) with confidence intervals</p>
                <p>{'\u2022'} Comparing results across multiple studies, subgroups, or strata</p>
                <p>{'\u2022'} Showing which factors are statistically significant (CI crossing the null line)</p>
                <p>{'\u2022'} Meta-analyses or systematic reviews of epidemiological studies</p>
                <p className="text-blue-500 italic mt-2">CDC provides forest plot templates. The gold standard for displaying pooled epidemiological evidence.</p>
              </div>
            )}
          </div>

          <VisualizationTip
            tip="Forest plots are the gold standard for displaying effect estimates with uncertainty. Each row shows a point estimate and its confidence interval. If the CI crosses the null line, the result is not statistically significant."
            context="Essential for analytic epidemiology, meta-analyses, and comparing risk factors across subgroups."
          />

          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Data Mapping</h4>

            <VariableMapper
              label="Study/Subgroup Label"
              description="Text column identifying each study or row"
              columns={dataset.columns}
              value={labelCol}
              onChange={setLabelCol}
              filterTypes={['text', 'categorical']}
              required
            />

            <VariableMapper
              label="Point Estimate"
              description="Numeric column with OR, RR, or effect estimate"
              columns={dataset.columns}
              value={estimateCol}
              onChange={setEstimateCol}
              filterTypes={['number']}
              required
            />

            <VariableMapper
              label="Lower CI"
              description="Lower confidence limit"
              columns={dataset.columns}
              value={lowerCICol}
              onChange={setLowerCICol}
              filterTypes={['number']}
              required
            />

            <VariableMapper
              label="Upper CI"
              description="Upper confidence limit"
              columns={dataset.columns}
              value={upperCICol}
              onChange={setUpperCICol}
              filterTypes={['number']}
              required
            />

            <VariableMapper
              label="Weight (Optional)"
              description="Study weight — affects marker size"
              columns={dataset.columns}
              value={weightCol}
              onChange={setWeightCol}
              filterTypes={['number']}
              placeholder="None (equal weights)"
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Options</h4>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Effect Measure</label>
              <select
                value={effectMeasure}
                onChange={e => setEffectMeasure(e.target.value as 'ratio' | 'difference')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="ratio">Ratio (OR, RR) — Log Scale</option>
                <option value="difference">Difference (RD, MD) — Linear</option>
              </select>
            </div>

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

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showNullLine}
                onChange={e => setShowNullLine(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show null effect line
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={e => setShowLabels(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show estimate labels
            </label>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Annotations</h4>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
              <input
                type="text"
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <input
                type="text"
                value={source}
                onChange={e => setSource(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
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
            filename="forest-plot"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Configure the forest plot</p>
            <p className="text-gray-400 text-sm mt-2">
              Select a label column, point estimate, and confidence interval columns to generate the chart.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
