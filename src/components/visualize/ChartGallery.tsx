import { useMemo, useState, type ReactNode } from 'react';
import type { Dataset, DataColumn } from '../../types/analysis';

export type ChartType =
  | 'bar'
  | 'line'
  | 'slope'
  | 'lollipop'
  | 'grouped'
  | 'bullet'
  | 'waffle'
  | 'dot'
  | 'heatmap'
  | 'paired'
  | 'dumbbell'
  | 'forest';

interface ChartInfo {
  type: ChartType;
  name: string;
  description: string;
  thumbnail: () => ReactNode;
}

const THUMBNAIL_CLASSES = 'text-[#2E5E86]';

function BarThumbnail() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" className={THUMBNAIL_CLASSES}>
      <rect x="8" y="36" width="14" height="18" fill="currentColor" rx="1" />
      <rect x="26" y="20" width="14" height="34" fill="currentColor" rx="1" />
      <rect x="44" y="10" width="14" height="44" fill="currentColor" rx="1" />
      <rect x="62" y="28" width="14" height="26" fill="currentColor" rx="1" />
    </svg>
  );
}

function LineThumbnail() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" className={THUMBNAIL_CLASSES}>
      <polyline
        points="8,44 24,30 40,36 56,16 72,22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="44" r="3" fill="currentColor" />
      <circle cx="24" cy="30" r="3" fill="currentColor" />
      <circle cx="40" cy="36" r="3" fill="currentColor" />
      <circle cx="56" cy="16" r="3" fill="currentColor" />
      <circle cx="72" cy="22" r="3" fill="currentColor" />
    </svg>
  );
}

function SlopeThumbnail() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" className={THUMBNAIL_CLASSES}>
      <line x1="18" y1="14" x2="62" y2="26" stroke="currentColor" strokeWidth="2" />
      <line x1="18" y1="30" x2="62" y2="18" stroke="#E57A3A" strokeWidth="2" />
      <line x1="18" y1="42" x2="62" y2="46" stroke="#5BA155" strokeWidth="2" />
      <circle cx="18" cy="14" r="3" fill="currentColor" />
      <circle cx="62" cy="26" r="3" fill="currentColor" />
      <circle cx="18" cy="30" r="3" fill="#E57A3A" />
      <circle cx="62" cy="18" r="3" fill="#E57A3A" />
      <circle cx="18" cy="42" r="3" fill="#5BA155" />
      <circle cx="62" cy="46" r="3" fill="#5BA155" />
    </svg>
  );
}

function LollipopThumbnail() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" className={THUMBNAIL_CLASSES}>
      <line x1="12" y1="12" x2="12" y2="54" stroke="currentColor" strokeWidth="2" />
      <circle cx="54" cy="12" r="4" fill="currentColor" />
      <line x1="12" y1="12" x2="54" y2="12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="68" cy="24" r="4" fill="currentColor" />
      <line x1="12" y1="24" x2="68" y2="24" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="40" cy="36" r="4" fill="currentColor" />
      <line x1="12" y1="36" x2="40" y2="36" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="60" cy="48" r="4" fill="currentColor" />
      <line x1="12" y1="48" x2="60" y2="48" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function GroupedBarThumbnail() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" className={THUMBNAIL_CLASSES}>
      <rect x="6" y="24" width="8" height="30" fill="currentColor" rx="1" />
      <rect x="15" y="32" width="8" height="22" fill="#E57A3A" rx="1" />
      <rect x="30" y="14" width="8" height="40" fill="currentColor" rx="1" />
      <rect x="39" y="22" width="8" height="32" fill="#E57A3A" rx="1" />
      <rect x="54" y="30" width="8" height="24" fill="currentColor" rx="1" />
      <rect x="63" y="18" width="8" height="36" fill="#E57A3A" rx="1" />
    </svg>
  );
}

function BulletThumbnail() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" className={THUMBNAIL_CLASSES}>
      <rect x="8" y="8" width="64" height="16" fill="#E0E0E0" rx="2" />
      <rect x="8" y="11" width="48" height="10" fill="#B0B0B0" rx="1" />
      <rect x="8" y="13" width="36" height="6" fill="currentColor" rx="1" />
      <line x1="52" y1="8" x2="52" y2="24" stroke="#333" strokeWidth="2" />
      <rect x="8" y="34" width="64" height="16" fill="#E0E0E0" rx="2" />
      <rect x="8" y="37" width="56" height="10" fill="#B0B0B0" rx="1" />
      <rect x="8" y="39" width="44" height="6" fill="currentColor" rx="1" />
      <line x1="60" y1="34" x2="60" y2="50" stroke="#333" strokeWidth="2" />
    </svg>
  );
}

function WaffleThumbnail() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" className={THUMBNAIL_CLASSES}>
      {Array.from({ length: 5 }).map((_, row) =>
        Array.from({ length: 10 }).map((_, col) => {
          const index = row * 10 + col;
          const filled = index < 35;
          return (
            <rect
              key={`${row}-${col}`}
              x={6 + col * 7.2}
              y={6 + row * 10}
              width="6"
              height="8.5"
              rx="1"
              fill={filled ? 'currentColor' : '#E0E0E0'}
            />
          );
        })
      )}
    </svg>
  );
}

function DotPlotThumbnail() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" className={THUMBNAIL_CLASSES}>
      <line x1="12" y1="6" x2="12" y2="54" stroke="#E0E0E0" strokeWidth="1" />
      <circle cx="48" cy="12" r="4" fill="currentColor" />
      <line x1="12" y1="12" x2="44" y2="12" stroke="#E0E0E0" strokeWidth="1" strokeDasharray="2,2" />
      <circle cx="64" cy="24" r="4" fill="currentColor" />
      <line x1="12" y1="24" x2="60" y2="24" stroke="#E0E0E0" strokeWidth="1" strokeDasharray="2,2" />
      <circle cx="36" cy="36" r="4" fill="currentColor" />
      <line x1="12" y1="36" x2="32" y2="36" stroke="#E0E0E0" strokeWidth="1" strokeDasharray="2,2" />
      <circle cx="56" cy="48" r="4" fill="currentColor" />
      <line x1="12" y1="48" x2="52" y2="48" stroke="#E0E0E0" strokeWidth="1" strokeDasharray="2,2" />
    </svg>
  );
}

function HeatmapThumbnail() {
  const opacities = [
    [0.2, 0.6, 0.9, 0.4, 0.7],
    [0.8, 0.3, 0.5, 1.0, 0.2],
    [0.4, 0.9, 0.3, 0.6, 0.8],
    [0.7, 0.4, 0.8, 0.2, 0.5],
  ];
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" className={THUMBNAIL_CLASSES}>
      {opacities.map((row, ri) =>
        row.map((opacity, ci) => (
          <rect
            key={`${ri}-${ci}`}
            x={6 + ci * 14.4}
            y={6 + ri * 12.5}
            width="13"
            height="11"
            rx="2"
            fill="currentColor"
            opacity={opacity}
          />
        ))
      )}
    </svg>
  );
}

function PairedBarThumbnail() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" className={THUMBNAIL_CLASSES}>
      <rect x="10" y="8" width="26" height="8" fill="currentColor" rx="1" />
      <rect x="16" y="22" width="20" height="8" fill="currentColor" rx="1" />
      <rect x="6" y="36" width="30" height="8" fill="currentColor" rx="1" />
      <line x1="40" y1="4" x2="40" y2="54" stroke="#999" strokeWidth="1" />
      <rect x="44" y="8" width="22" height="8" fill="#E57A3A" rx="1" />
      <rect x="44" y="22" width="28" height="8" fill="#E57A3A" rx="1" />
      <rect x="44" y="36" width="18" height="8" fill="#E57A3A" rx="1" />
    </svg>
  );
}

function DumbbellThumbnail() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" className={THUMBNAIL_CLASSES}>
      <line x1="12" y1="6" x2="12" y2="54" stroke="#E0E0E0" strokeWidth="1" />
      {/* Row 1 */}
      <line x1="30" y1="12" x2="60" y2="12" stroke="#BBBFC4" strokeWidth="2" />
      <circle cx="30" cy="12" r="4" fill="currentColor" />
      <circle cx="60" cy="12" r="4" fill="#E57A3A" />
      {/* Row 2 */}
      <line x1="24" y1="26" x2="52" y2="26" stroke="#BBBFC4" strokeWidth="2" />
      <circle cx="24" cy="26" r="4" fill="currentColor" />
      <circle cx="52" cy="26" r="4" fill="#E57A3A" />
      {/* Row 3 */}
      <line x1="36" y1="40" x2="66" y2="40" stroke="#BBBFC4" strokeWidth="2" />
      <circle cx="36" cy="40" r="4" fill="currentColor" />
      <circle cx="66" cy="40" r="4" fill="#E57A3A" />
      {/* Row 4 */}
      <line x1="20" y1="54" x2="48" y2="54" stroke="#BBBFC4" strokeWidth="2" />
      <circle cx="20" cy="54" r="4" fill="currentColor" />
      <circle cx="48" cy="54" r="4" fill="#E57A3A" />
    </svg>
  );
}

function ForestPlotThumbnail() {
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" className={THUMBNAIL_CLASSES}>
      {/* Null line (dashed) */}
      <line x1="40" y1="4" x2="40" y2="52" stroke="#999" strokeWidth="1" strokeDasharray="3,2" />
      {/* Study 1: CI line + square */}
      <line x1="28" y1="12" x2="58" y2="12" stroke="currentColor" strokeWidth="1.5" />
      <rect x="39" y="8" width="8" height="8" fill="currentColor" />
      {/* Study 2: CI line + square */}
      <line x1="22" y1="26" x2="50" y2="26" stroke="currentColor" strokeWidth="1.5" />
      <rect x="32" y="22" width="6" height="6" fill="currentColor" />
      {/* Study 3: CI line + square */}
      <line x1="34" y1="40" x2="64" y2="40" stroke="currentColor" strokeWidth="1.5" />
      <rect x="45" y="36" width="7" height="7" fill="currentColor" />
      {/* Pooled diamond */}
      <polygon points="40,48 48,52 40,56 32,52" fill="currentColor" />
    </svg>
  );
}

interface ChartGroup {
  label: string;
  description: string;
  charts: ChartInfo[];
}

const CHART_GROUPS: ChartGroup[] = [
  {
    label: 'Describe & Count',
    description: 'Show frequencies, proportions, and single metrics',
    charts: [
      { type: 'bar', name: 'Bar Chart', description: 'Compare categories with horizontal bars and direct labels', thumbnail: BarThumbnail },
      { type: 'lollipop', name: 'Lollipop Chart', description: 'A lighter alternative to bar charts with dot endpoints', thumbnail: LollipopThumbnail },
      { type: 'dot', name: 'Dot Plot', description: 'Plot individual values along a single axis with precision', thumbnail: DotPlotThumbnail },
      { type: 'waffle', name: 'Waffle Chart', description: 'Display proportions as filled squares — 1 square = 1%', thumbnail: WaffleThumbnail },
      { type: 'bullet', name: 'Bullet Chart', description: 'Show performance against a target or benchmark', thumbnail: BulletThumbnail },
    ],
  },
  {
    label: 'Compare Groups',
    description: 'Compare values across two or more groups or subpopulations',
    charts: [
      { type: 'grouped', name: 'Grouped/Stacked Bar', description: 'Compare sub-groups side by side, stacked, or as 100% proportions', thumbnail: GroupedBarThumbnail },
      { type: 'dumbbell', name: 'Dumbbell Chart', description: 'Compare two values per category with connected dots', thumbnail: DumbbellThumbnail },
      { type: 'paired', name: 'Paired Bar Chart', description: 'Compare two groups as mirrored horizontal bars (population pyramids)', thumbnail: PairedBarThumbnail },
    ],
  },
  {
    label: 'Show Change Over Time',
    description: 'Track trends, shifts, and temporal patterns',
    charts: [
      { type: 'line', name: 'Line Chart', description: 'Show trends over time with connected data points', thumbnail: LineThumbnail },
      { type: 'slope', name: 'Slope Chart', description: 'Compare changes between exactly two time points', thumbnail: SlopeThumbnail },
    ],
  },
  {
    label: 'Analyze Relationships',
    description: 'Cross-tabulations, effect estimates, and multi-dimensional patterns',
    charts: [
      { type: 'heatmap', name: 'Heatmap', description: 'Visualize values across two dimensions with color intensity', thumbnail: HeatmapThumbnail },
      { type: 'forest', name: 'Forest Plot', description: 'Display effect estimates with confidence intervals across studies or subgroups', thumbnail: ForestPlotThumbnail },
    ],
  },
];

interface ChartGalleryProps {
  onSelectChart: (chartType: ChartType) => void;
  dataset?: Dataset;
}

/** Map from ChartType to the full ChartInfo for quick lookup */
const ALL_CHARTS = CHART_GROUPS.flatMap(g => g.charts);
const CHART_MAP = new Map(ALL_CHARTS.map(c => [c.type, c]));

/**
 * Analytical intent categories for the intent-based suggestion layer.
 */
type AnalyticalIntent =
  | 'compare_groups'
  | 'show_trends'
  | 'show_proportions'
  | 'show_effects'
  | 'cross_tabulate';

const INTENT_LABELS: Record<AnalyticalIntent, string> = {
  compare_groups: 'Compare Groups',
  show_trends: 'Show Trends Over Time',
  show_proportions: 'Display Proportions',
  show_effects: 'Show Effect Estimates',
  cross_tabulate: 'Cross-tabulate Variables',
};

const INTENT_CHARTS: Record<AnalyticalIntent, { type: ChartType; reason: string }[]> = {
  compare_groups: [
    { type: 'grouped', reason: 'Compare sub-groups side by side, stacked, or as proportions' },
    { type: 'dumbbell', reason: 'Show the gap between two values per category' },
    { type: 'paired', reason: 'Mirror two groups for direct comparison (e.g., age-sex pyramid)' },
    { type: 'bar', reason: 'Simple comparison across categories' },
  ],
  show_trends: [
    { type: 'line', reason: 'Track continuous trends over time' },
    { type: 'slope', reason: 'Compare values between two time points' },
  ],
  show_proportions: [
    { type: 'waffle', reason: 'Each square = 1% — intuitive for non-technical audiences' },
    { type: 'grouped', reason: 'Use 100% stacked mode for proportional composition' },
    { type: 'bar', reason: 'Rank proportions from highest to lowest' },
  ],
  show_effects: [
    { type: 'forest', reason: 'Display effect estimates (OR, RR) with confidence intervals' },
    { type: 'dot', reason: 'Plot point estimates for comparison' },
  ],
  cross_tabulate: [
    { type: 'heatmap', reason: 'Cross-tabulate two categorical variables with color intensity' },
    { type: 'grouped', reason: 'Compare counts or values across two grouping variables' },
  ],
};

/**
 * Suggest charts based on the column types present in the dataset.
 */
function suggestCharts(columns: DataColumn[]): { type: ChartType; reason: string }[] {
  const numericCols = columns.filter(c => c.type === 'number');
  const categoricalCols = columns.filter(c => c.type === 'categorical' || c.type === 'text');
  const dateCols = columns.filter(c => c.type === 'date');
  const suggestions: { type: ChartType; reason: string }[] = [];

  // CI-like columns suggest forest plot
  const hasCIColumns = numericCols.some(c => {
    const lower = c.key.toLowerCase();
    return lower.includes('lower') || lower.includes('ci_lo') || lower.includes('lcl');
  }) && numericCols.some(c => {
    const lower = c.key.toLowerCase();
    return lower.includes('upper') || lower.includes('ci_hi') || lower.includes('ucl');
  });
  if (hasCIColumns && categoricalCols.length >= 1) {
    suggestions.push({ type: 'forest', reason: 'Your data has confidence interval columns — ideal for a forest plot' });
  }

  // Binary categorical (exactly 2 values) + categorical = paired bar or dumbbell
  const hasBinaryCat = categoricalCols.some(c => c.valueOrder && c.valueOrder.length === 2);
  if (hasBinaryCat && categoricalCols.length >= 2) {
    suggestions.push({ type: 'paired', reason: 'Your data has a binary grouping variable — great for comparing two groups' });
  }

  // Two numeric columns + categorical = dumbbell
  if (numericCols.length >= 2 && categoricalCols.length >= 1) {
    suggestions.push({ type: 'dumbbell', reason: 'Two numeric columns can show the gap between paired values per category' });
  }

  // Multiple numeric columns = slope chart
  if (numericCols.length >= 2 && categoricalCols.length >= 1) {
    suggestions.push({ type: 'slope', reason: 'Multiple numeric columns can show change between two measures' });
  }

  // Categorical + numeric = bar
  if (categoricalCols.length >= 1 && numericCols.length >= 1) {
    suggestions.push({ type: 'bar', reason: 'Compare categories using numeric values' });
  }

  // Date column + numeric = line chart
  if (dateCols.length >= 1 && numericCols.length >= 1) {
    suggestions.push({ type: 'line', reason: 'Visualize trends over time with your date and numeric columns' });
  }

  // Two categorical = heatmap
  if (categoricalCols.length >= 2) {
    suggestions.push({ type: 'heatmap', reason: 'Cross-tabulate two categorical variables with color intensity' });
  }

  // Numeric with target-like columns = bullet chart
  const hasTarget = numericCols.some(c => c.key.includes('target') || c.label.toLowerCase().includes('target'));
  if (hasTarget && categoricalCols.length >= 1) {
    suggestions.push({ type: 'bullet', reason: 'Compare actual values against targets in your data' });
  }

  // Deduplicate
  const seen = new Set<ChartType>();
  return suggestions.filter(s => {
    if (seen.has(s.type)) return false;
    seen.add(s.type);
    return true;
  }).slice(0, 5);
}

function ChartCard({ chart, onSelect }: { chart: ChartInfo; onSelect: () => void; reason?: string }) {
  const Thumbnail = chart.thumbnail;
  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-lg text-left hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer group"
    >
      <div className="flex-shrink-0 bg-gray-50 rounded-md p-2 group-hover:bg-blue-50 transition-colors">
        <Thumbnail />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
          {chart.name}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
          {chart.description}
        </p>
      </div>
    </button>
  );
}

/**
 * Intent-based quick filter buttons for the "What are you trying to do?" prompt.
 */
function IntentFilter({
  selectedIntent,
  onSelect,
}: {
  selectedIntent: AnalyticalIntent | null;
  onSelect: (intent: AnalyticalIntent | null) => void;
}) {
  const intents: AnalyticalIntent[] = ['compare_groups', 'show_trends', 'show_proportions', 'show_effects', 'cross_tabulate'];

  return (
    <div className="mb-6">
      <p className="text-sm font-medium text-gray-700 mb-2">What are you trying to do?</p>
      <div className="flex flex-wrap gap-2">
        {intents.map((intent) => (
          <button
            key={intent}
            onClick={() => onSelect(selectedIntent === intent ? null : intent)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer ${
              selectedIntent === intent
                ? 'bg-blue-100 border-blue-300 text-blue-800'
                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700'
            }`}
          >
            {INTENT_LABELS[intent]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChartGallery({ onSelectChart, dataset }: ChartGalleryProps) {
  const [selectedIntent, setSelectedIntent] = useState<AnalyticalIntent | null>(null);

  const suggestions = useMemo(() => {
    if (!dataset) return [];
    return suggestCharts(dataset.columns);
  }, [dataset]);

  const intentSuggestions = selectedIntent ? INTENT_CHARTS[selectedIntent] : null;

  return (
    <div className="space-y-8">
      {/* Intent-based filter */}
      <IntentFilter selectedIntent={selectedIntent} onSelect={setSelectedIntent} />

      {/* Intent-based recommendations */}
      {intentSuggestions && (
        <div>
          <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-1 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Recommended for: {INTENT_LABELS[selectedIntent!]}
          </h4>
          <p className="text-xs text-gray-500 mb-3">Charts best suited to this analytical goal</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {intentSuggestions.map(({ type, reason }) => {
              const chart = CHART_MAP.get(type);
              if (!chart) return null;
              return (
                <div key={type} className="relative">
                  <ChartCard chart={chart} onSelect={() => onSelectChart(type)} />
                  <p className="text-xs text-blue-600 mt-1 ml-1">{reason}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Data-driven suggestions */}
      {suggestions.length > 0 && !selectedIntent && (
        <div>
          <h4 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-1 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Suggested for Your Data
          </h4>
          <p className="text-xs text-gray-500 mb-3">Based on the columns in your dataset</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggestions.map(({ type, reason }) => {
              const chart = CHART_MAP.get(type);
              if (!chart) return null;
              return (
                <div key={type} className="relative">
                  <ChartCard chart={chart} onSelect={() => onSelectChart(type)} />
                  <p className="text-xs text-green-600 mt-1 ml-1">{reason}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All charts by workflow category */}
      {CHART_GROUPS.map((group) => (
        <div key={group.label}>
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
            {group.label}
          </h4>
          <p className="text-xs text-gray-400 mb-3">{group.description}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.charts.map((chart) => (
              <ChartCard
                key={chart.type}
                chart={chart}
                onSelect={() => onSelectChart(chart.type)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
