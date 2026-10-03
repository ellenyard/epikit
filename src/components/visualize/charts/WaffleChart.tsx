import { useState, useMemo } from 'react';
import { ChartContainer } from '../shared/ChartContainer';
import { CHART_ROW_CLASS, SETTINGS_COLUMN_CLASS, CHART_COLUMN_CLASS, type ChartProps } from '../shared/ChartLayout';
import { pickWaffleColumn, resolveColumnChoice } from '../../../utils/chartDefaults';
import { chartTitle } from '../../../utils/chartTitles';
import { VariableMapper } from '../shared/VariableMapper';
import { VisualizationTip } from '../shared/VisualizationTip';
import { getChartColors, type ChartColorScheme } from '../../../utils/chartColors';
import {
  getDefaultDimensions,
  svgWrapper,
  svgHeader,
  svgFooter,
  svgText,
  fitText,
  escapeXml,
  type ExcelExportData,
} from '../../../utils/chartExport';
import {
  categoryColumns,
  categoryOf,
  orderCategories,
  hasNaturalOrder,
  byCategoryOrder,
  recordCount,
} from '../../../utils/chartCategories';
import { allocateSquares, formatFixed } from '../../../utils/chartFormat';
import { useLocale } from '../../../contexts/LocaleContext';

interface WaffleSlice {
  category: string;
  count: number;
  /** The true share of records, which is what the legend prints. */
  percent: number;
  /** Squares on the grid: the share rounded so that all squares sum to 100. */
  squares: number;
}

export function WaffleChart({ dataset, filterNote = '' }: ChartProps) {
  const { config: locale } = useLocale();
  const [categoryVarChoice, setCategoryVar] = useState('');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  // null means "follow the data"; a string is what the user typed.
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const catColumns = useMemo(() => categoryColumns(dataset), [dataset]);
  // The user's choice while it is valid for the dataset, else the first
  // column with few enough values to colour: the chart used to open blank.
  const categoryVar = resolveColumnChoice(dataset, categoryVarChoice, useMemo(() => pickWaffleColumn(dataset), [dataset]));
  const categoryColumn = useMemo(
    () => dataset.columns.find(c => c.key === categoryVar),
    [dataset.columns, categoryVar]
  );
  const categoryLabel = categoryColumn?.label || categoryVar;

  const waffle = useMemo(() => {
    if (!categoryVar) return null;

    const counts = new Map<string, number>();
    let missing = 0;
    for (const record of dataset.records) {
      const category = categoryOf(record[categoryVar]);
      if (category === null) missing++;
      else counts.set(category, (counts.get(category) || 0) + 1);
    }
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return null;

    // Largest share first, unless the categories have an order of their own
    const order = orderCategories(counts.keys(), categoryColumn);
    const entries = Array.from(counts.entries()).sort(byCategoryOrder(order, e => e[0]));
    if (!hasNaturalOrder(order, categoryColumn)) entries.sort((a, b) => b[1] - a[1]);

    const squares = allocateSquares(entries.map(e => e[1]));
    const slices: WaffleSlice[] = entries.map(([category, count], i) => ({
      category,
      count,
      percent: (count / total) * 100,
      squares: squares[i],
    }));
    return { slices, total, missing };
  }, [categoryVar, categoryColumn, dataset.records]);

  const defaultTitle = categoryVar ? chartTitle('Share of records', categoryLabel) : 'Waffle Chart';
  const title = titleOverride ?? defaultTitle;

  const svgContent = useMemo(() => {
    if (!waffle) return '';
    const { slices, total, missing } = waffle;

    const dims = getDefaultDimensions('waffle');
    const gridSize = 10;
    const squareSize = 30;
    const squareGap = 3;
    const gridTotalSize = gridSize * squareSize + (gridSize - 1) * squareGap;
    const width = dims.width;

    const header = svgHeader(width, title, subtitle || undefined);

    // Center grid horizontally
    const gridLeft = (width - gridTotalSize) / 2;
    const gridTop = header.bottom + 14;

    const colors = getChartColors(slices.length, colorScheme);

    // Build square-to-category mapping
    const squareColors: string[] = [];
    const squareCategories: string[] = [];
    slices.forEach((slice, i) => {
      for (let j = 0; j < slice.squares; j++) {
        squareColors.push(colors[i]);
        squareCategories.push(slice.category);
      }
    });

    let svg = header.svg;

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

    // Legend below the grid: one row per category, with its real percentage
    // and its count. The legend used to print the number of squares as if it
    // were the percentage, so six equal categories read 17%, 17%, 17%, 17%,
    // 16%, 16%, and one death in 300 read 1%.
    const legendItemHeight = 18;
    const legendTop = gridTop + gridTotalSize + 18;
    const legendLeft = Math.max(16, gridLeft - 40);
    const legendWidth = width - legendLeft * 2;
    slices.forEach((slice, i) => {
      const ly = legendTop + i * legendItemHeight;
      svg += `<rect x="${legendLeft}" y="${ly}" width="14" height="14" fill="${escapeXml(colors[i])}" rx="2"/>`;
      const share = `${formatFixed(slice.percent, slice.percent < 10 || !Number.isInteger(slice.percent) ? 1 : 0, locale)}% (n = ${formatFixed(slice.count, 0, locale)})`;
      svg += svgText(legendLeft + 20, ly + 7, fitText(slice.category, legendWidth - 150, 11), {
        anchor: 'start',
        fontSize: 11,
        fill: '#333',
        dy: '0.35em',
      });
      svg += svgText(legendLeft + legendWidth, ly + 7, share, {
        anchor: 'end',
        fontSize: 11,
        fill: '#333',
        dy: '0.35em',
      });
    });

    const notes = [
      `Each square is 1% of the ${recordCount(total)} with ${categoryLabel} recorded.`,
    ];
    if (slices.some(sl => sl.squares === 0)) {
      notes.push('A category under half a percent may have no square; its share is in the legend.');
    }
    if (slices.length > 8) {
      notes.push('Colours repeat in lighter and darker shades beyond eight categories; a bar chart reads better with this many.');
    }
    if (missing > 0) {
      notes.push(`${recordCount(missing)} excluded: no ${categoryLabel} recorded.`);
    }
    if (filterNote) notes.push(filterNote);
    const footer = svgFooter(width, legendTop + slices.length * legendItemHeight + 2, notes, source || undefined);

    return svgWrapper(width, footer.height, svg + footer.svg);
  }, [waffle, categoryLabel, colorScheme, title, subtitle, source, locale, filterNote]);

  // Build Excel export data
  const excelData = useMemo((): ExcelExportData => {
    if (!waffle) {
      return { columns: [], rows: [] };
    }
    const columns = [
      { header: categoryLabel || 'Category', key: 'category' },
      { header: 'Count', key: 'count' },
      { header: 'Percent of records', key: 'percent' },
      { header: 'Squares', key: 'squares' },
    ];
    const rows = waffle.slices.map(slice => ({
      category: slice.category,
      count: slice.count,
      percent: slice.percent,
      squares: slice.squares,
    }));
    return {
      title,
      subtitle: subtitle || undefined,
      source: source || undefined,
      columns,
      rows,
    };
  }, [waffle, categoryLabel, title, subtitle, source]);

  const isReady = !!categoryVar;

  return (
    <div className={CHART_ROW_CLASS}>
      {/* Config panel */}
      <div className={SETTINGS_COLUMN_CLASS}>
        <VisualizationTip
          tip="Waffle charts make proportions tangible: each square is 1% of the whole. They are more accurate than pie charts and easier for audiences to read quickly."
          context="Best for a variable with two to eight values, such as case status or vaccination status."
        />

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
              <p>• Displaying a single percentage or proportion visually</p>
              <p>• Showing vaccination coverage, positivity rates, or case resolution</p>
              <p>• When you need an intuitive alternative to pie charts</p>
              <p>• Communicating proportions to non-technical audiences</p>
              <p className="text-blue-500 italic mt-2">CDC COVE officially features waffle charts. Each square represents 1% — more accurate and intuitive than pie charts for showing proportions.</p>
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Variables</h4>

          <VariableMapper
            label="Category Variable"
            description="The variable whose frequency becomes the waffle"
            columns={catColumns}
            value={categoryVar}
            onChange={setCategoryVar}
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
      <div className={CHART_COLUMN_CLASS}>
        {isReady && svgContent ? (
          <ChartContainer
            title={title}
            svgContent={svgContent}
            excelData={excelData}
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
