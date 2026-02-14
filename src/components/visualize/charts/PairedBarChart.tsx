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
} from '../../../utils/chartExport';

interface PairedBarChartProps {
  dataset: Dataset;
}

type InputMode = 'two-columns' | 'group-split';

export function PairedBarChart({ dataset }: PairedBarChartProps) {
  const [categoryCol, setCategoryCol] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('two-columns');

  // Two-column mode
  const [leftValueCol, setLeftValueCol] = useState('');
  const [rightValueCol, setRightValueCol] = useState('');

  // Group-split mode
  const [numericCol, setNumericCol] = useState('');
  const [groupCol, setGroupCol] = useState('');

  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('evergreen');
  const [showLabels, setShowLabels] = useState(true);
  const [title, setTitle] = useState('Paired Bar Chart');
  const [subtitle, setSubtitle] = useState('');
  const [source, setSource] = useState('');

  // Detect the two unique group values when in group-split mode
  const groupValues = useMemo(() => {
    if (inputMode !== 'group-split' || !groupCol) return [];
    const unique = new Set<string>();
    for (const rec of dataset.records) {
      const v = rec[groupCol];
      if (v !== null && v !== undefined && v !== '') unique.add(String(v));
    }
    return Array.from(unique).sort();
  }, [inputMode, groupCol, dataset]);

  const svgContent = useMemo(() => {
    if (!categoryCol) return '';

    // Determine if we have valid config
    const isTwoCol = inputMode === 'two-columns' && leftValueCol && rightValueCol;
    const isGroupSplit = inputMode === 'group-split' && numericCol && groupCol && groupValues.length === 2;

    if (!isTwoCol && !isGroupSplit) return '';

    // Build data: { category, leftVal, rightVal }
    const categoryMap = new Map<string, {
      leftSum: number; leftCount: number;
      rightSum: number; rightCount: number;
    }>();

    for (const rec of dataset.records) {
      const cat = rec[categoryCol];
      if (cat === null || cat === undefined || cat === '') continue;
      const catStr = String(cat);

      if (!categoryMap.has(catStr)) {
        categoryMap.set(catStr, { leftSum: 0, leftCount: 0, rightSum: 0, rightCount: 0 });
      }
      const entry = categoryMap.get(catStr)!;

      if (isTwoCol) {
        const lv = Number(rec[leftValueCol]);
        if (!isNaN(lv)) { entry.leftSum += lv; entry.leftCount++; }
        const rv = Number(rec[rightValueCol]);
        if (!isNaN(rv)) { entry.rightSum += rv; entry.rightCount++; }
      } else if (isGroupSplit) {
        const grp = String(rec[groupCol]);
        const val = Number(rec[numericCol]);
        if (isNaN(val)) continue;
        if (grp === groupValues[0]) {
          entry.leftSum += val;
          entry.leftCount++;
        } else if (grp === groupValues[1]) {
          entry.rightSum += val;
          entry.rightCount++;
        }
      }
    }

    const rows = Array.from(categoryMap.entries()).map(([cat, agg]) => ({
      category: cat,
      leftVal: agg.leftCount > 0 ? agg.leftSum / agg.leftCount : 0,
      rightVal: agg.rightCount > 0 ? agg.rightSum / agg.rightCount : 0,
    }));

    // Sort alphabetically by category
    rows.sort((a, b) => a.category.localeCompare(b.category));

    if (rows.length === 0) return '';

    // Group labels
    let leftLabel: string;
    let rightLabel: string;
    if (isTwoCol) {
      leftLabel = dataset.columns.find(c => c.key === leftValueCol)?.label || leftValueCol;
      rightLabel = dataset.columns.find(c => c.key === rightValueCol)?.label || rightValueCol;
    } else {
      leftLabel = groupValues[0];
      rightLabel = groupValues[1];
    }

    // Determine max value for scaling
    let maxVal = 0;
    for (const r of rows) {
      if (r.leftVal > maxVal) maxVal = r.leftVal;
      if (r.rightVal > maxVal) maxVal = r.rightVal;
    }
    maxVal = maxVal || 1;

    const dims = getDefaultDimensions('paired');
    const { width, height, margin } = dims;
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const halfW = plotW / 2;
    const centerX = margin.left + halfW;
    const barHeight = Math.min(plotH / rows.length - 4, 20);
    const rowHeight = plotH / rows.length;
    const colors = getChartColors(2, colorScheme);

    // Scale: value -> pixel width of bar
    const barScale = (val: number) => (val / maxVal) * (halfW - 40); // leave room for labels

    let svg = '';

    // Title
    svg += svgTitle(width, title, subtitle || undefined);

    // Group labels at top
    svg += svgText(centerX - halfW / 2, margin.top - 12, leftLabel, { anchor: 'middle', fontSize: 12, fontWeight: 'bold', fill: colors[0] });
    svg += svgText(centerX + halfW / 2, margin.top - 12, rightLabel, { anchor: 'middle', fontSize: 12, fontWeight: 'bold', fill: colors[1] });

    // Center axis
    svg += svgAxisLine(centerX, margin.top, centerX, margin.top + plotH);

    // Grid lines on both sides
    const tickCount = 4;
    for (let i = 1; i <= tickCount; i++) {
      const val = (maxVal * i) / tickCount;
      const barW = barScale(val);

      // Left side grid
      svg += svgGridLine(centerX - barW, margin.top, centerX - barW, margin.top + plotH);
      // Right side grid
      svg += svgGridLine(centerX + barW, margin.top, centerX + barW, margin.top + plotH);

      // Tick labels at bottom
      const formatted = val >= 1000 ? `${(val / 1000).toFixed(1)}k` : (Number.isInteger(val) ? String(val) : val.toFixed(1));
      svg += svgText(centerX - barW, margin.top + plotH + 16, formatted, { anchor: 'middle', fontSize: 9, fill: '#888' });
      svg += svgText(centerX + barW, margin.top + plotH + 16, formatted, { anchor: 'middle', fontSize: 9, fill: '#888' });
    }

    // Bottom axis
    svg += svgAxisLine(margin.left, margin.top + plotH, margin.left + plotW, margin.top + plotH);

    // Bars
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cy = margin.top + i * rowHeight + rowHeight / 2;

      // Category label (center)
      const labelText = row.category.length > 14 ? row.category.slice(0, 12) + '...' : row.category;
      svg += svgText(centerX, cy, labelText, { anchor: 'middle', fontSize: 10, fill: '#333', dy: '0.35em' });

      // Left bar (extends leftward from center)
      const leftBarW = barScale(row.leftVal);
      if (leftBarW > 0) {
        svg += `<rect x="${centerX - leftBarW}" y="${cy - barHeight / 2}" width="${leftBarW}" height="${barHeight}" fill="${colors[0]}" rx="2"/>`;

        // Left data label
        if (showLabels) {
          const lbl = Number.isInteger(row.leftVal) ? String(row.leftVal) : row.leftVal.toFixed(1);
          svg += svgText(centerX - leftBarW - 4, cy, lbl, { anchor: 'end', fontSize: 9, fill: '#555', dy: '0.35em' });
        }
      }

      // Right bar (extends rightward from center)
      const rightBarW = barScale(row.rightVal);
      if (rightBarW > 0) {
        svg += `<rect x="${centerX}" y="${cy - barHeight / 2}" width="${rightBarW}" height="${barHeight}" fill="${colors[1]}" rx="2"/>`;

        // Right data label
        if (showLabels) {
          const lbl = Number.isInteger(row.rightVal) ? String(row.rightVal) : row.rightVal.toFixed(1);
          svg += svgText(centerX + rightBarW + 4, cy, lbl, { anchor: 'start', fontSize: 9, fill: '#555', dy: '0.35em' });
        }
      }
    }

    // Source
    if (source) {
      svg += svgSource(width, height, source);
    }

    return svgWrapper(width, height, svg);
  }, [categoryCol, inputMode, leftValueCol, rightValueCol, numericCol, groupCol, groupValues, colorScheme, showLabels, title, subtitle, source, dataset]);

  return (
    <div className="flex gap-6">
      {/* Config panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Data Mapping</h4>

          <VariableMapper
            label="Category"
            description="Groups shown in the center"
            columns={dataset.columns}
            value={categoryCol}
            onChange={setCategoryCol}
            filterTypes={['text', 'categorical']}
            required
          />

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Input Mode</label>
            <select
              value={inputMode}
              onChange={(e) => setInputMode(e.target.value as InputMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="two-columns">Two numeric columns</option>
              <option value="group-split">One numeric + group variable</option>
            </select>
          </div>

          {inputMode === 'two-columns' ? (
            <>
              <VariableMapper
                label="Left Value"
                description="Numeric column for left-side bars"
                columns={dataset.columns}
                value={leftValueCol}
                onChange={setLeftValueCol}
                filterTypes={['number']}
                required
              />
              <VariableMapper
                label="Right Value"
                description="Numeric column for right-side bars"
                columns={dataset.columns}
                value={rightValueCol}
                onChange={setRightValueCol}
                filterTypes={['number']}
                required
              />
            </>
          ) : (
            <>
              <VariableMapper
                label="Numeric Value"
                description="Value to compare between groups"
                columns={dataset.columns}
                value={numericCol}
                onChange={setNumericCol}
                filterTypes={['number']}
                required
              />
              <VariableMapper
                label="Group Variable"
                description="Must have exactly 2 unique values"
                columns={dataset.columns}
                value={groupCol}
                onChange={setGroupCol}
                filterTypes={['text', 'categorical']}
                required
              />
              {groupCol && groupValues.length !== 2 && (
                <p className="text-xs text-red-600 mt-1">
                  Selected column has {groupValues.length} unique values. Exactly 2 required.
                </p>
              )}
              {groupCol && groupValues.length === 2 && (
                <p className="text-xs text-gray-500 mt-1">
                  Left: {groupValues[0]} | Right: {groupValues[1]}
                </p>
              )}
            </>
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
            Show data labels
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

        <EvergreenTip
          tip="Paired bar charts (population pyramids) are ideal for comparing two groups across the same categories, such as age-sex distributions."
          context="Use the group-split mode when your data has a binary grouping variable"
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
            filename="paired-bar-chart"
          >
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </ChartContainer>
        ) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-lg">Configure data mapping to create a paired bar chart</p>
            <p className="text-gray-400 text-sm mt-2">Select a category and two value sources using the panel on the left</p>
          </div>
        )}
      </div>
    </div>
  );
}
