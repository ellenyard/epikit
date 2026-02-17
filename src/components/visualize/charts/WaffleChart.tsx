import { useState, useMemo } from 'react';
import type { Dataset } from '../../../types/analysis';
import { ChartContainer } from '../shared/ChartContainer';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { getChartColors, type ChartColorScheme } from '../../../utils/chartColors';
import { calculateFrequency } from '../../../utils/statistics';
import {
  getDefaultDimensions,
  svgWrapper,
  svgTitle,
  svgSource,
  svgText,
  escapeXml,
} from '../../../utils/chartExport';

interface WaffleChartProps {
  dataset: Dataset;
}

export function WaffleChart({ dataset }: WaffleChartProps) {
  const [categoryVar, setCategoryVar] = useState('');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [title, setTitle] = useState('Waffle Chart');
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');

  const svgContent = useMemo(() => {
    if (!categoryVar) return '';

    // Get values for the category variable
    const values = dataset.records.map(r => r[categoryVar]).filter(v => v != null && v !== '');
    if (values.length === 0) return '';

    // Calculate frequencies
    const freq = calculateFrequency(values);
    if (freq.length === 0) return '';

    // Round percentages to whole numbers that sum to 100
    const rounded = roundToHundred(freq.map(f => f.percent));

    const dims = getDefaultDimensions('waffle');
    const gridSize = 10;
    const squareSize = 30;
    const squareGap = 3;
    const gridTotalSize = gridSize * squareSize + (gridSize - 1) * squareGap;

    // Center grid horizontally
    const gridLeft = (dims.width - gridTotalSize) / 2;
    const gridTop = dims.margin.top;

    // Calculate needed height: grid + legend
    const legendItemHeight = 20;
    const legendTop = gridTop + gridTotalSize + 25;
    const legendHeight = Math.ceil(freq.length / 2) * legendItemHeight + 10;
    const height = legendTop + legendHeight + dims.margin.bottom;
    const width = dims.width;

    const colors = getChartColors(freq.length, colorScheme);

    // Build square-to-category mapping
    const squareColors: string[] = [];
    const squareCategories: string[] = [];
    for (let i = 0; i < freq.length; i++) {
      const count = rounded[i];
      for (let j = 0; j < count; j++) {
        squareColors.push(colors[i]);
        squareCategories.push(freq[i].value);
      }
    }

    let svg = '';

    // Title
    if (title) {
      svg += svgTitle(width, title, subtitle || undefined);
    }

    // Draw 10x10 grid (top-left to bottom-right, row by row)
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const index = row * gridSize + col;
        const x = gridLeft + col * (squareSize + squareGap);
        const y = gridTop + row * (squareSize + squareGap);
        const color = index < squareColors.length ? squareColors[index] : '#F3F4F6';
        const category = index < squareCategories.length ? squareCategories[index] : '';

        svg += `<rect x="${x}" y="${y}" width="${squareSize}" height="${squareSize}" fill="${escapeXml(color)}" rx="3">`;
        if (category) {
          svg += `<title>${escapeXml(category)}</title>`;
        }
        svg += `</rect>`;
      }
    }

    // Legend below grid (two columns)
    const legendColWidth = gridTotalSize / 2;
    for (let i = 0; i < freq.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const lx = gridLeft + col * legendColWidth;
      const ly = legendTop + row * legendItemHeight;

      // Color swatch
      svg += `<rect x="${lx}" y="${ly}" width="14" height="14" fill="${escapeXml(colors[i])}" rx="2"/>`;

      // Label with percentage
      svg += svgText(lx + 20, ly + 7, `${freq[i].value} (${rounded[i]}%)`, {
        anchor: 'start',
        fontSize: 11,
        fill: '#333',
        dy: '0.35em',
      });
    }

    // Source
    if (source) {
      svg += svgSource(width, height, source);
    }

    return svgWrapper(width, height, svg);
  }, [categoryVar, colorScheme, title, subtitle, source, dataset.records]);

  const isReady = !!categoryVar;

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <VisualizationTip
          tip="Waffle charts make proportions tangible: each square equals 1%, making it easy for audiences to grasp part-to-whole relationships."
          context="Best used when you have a small number of categories (2-6)."
        />

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Variables</h4>

          <VariableMapper
            label="Category Variable"
            description="The variable whose frequency becomes the waffle"
            columns={dataset.columns}
            value={categoryVar}
            onChange={setCategoryVar}
            filterTypes={['categorical', 'text']}
            required
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Styling</h4>

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
            filename="waffle-chart"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Configure the chart</p>
            <p className="text-gray-400 text-sm mt-2">
              Select a categorical variable to display its proportions as a waffle grid.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Round an array of percentages so they sum to exactly 100.
 * Uses largest-remainder method to minimize rounding error.
 */
function roundToHundred(percents: number[]): number[] {
  const floored = percents.map(p => Math.floor(p));
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);

  // Get fractional parts with their indices
  const fractions = percents.map((p, i) => ({ index: i, frac: p - Math.floor(p) }));
  fractions.sort((a, b) => b.frac - a.frac);

  // Distribute remaining units to largest fractional parts
  for (let i = 0; i < remainder && i < fractions.length; i++) {
    floored[fractions[i].index]++;
  }

  return floored;
}
