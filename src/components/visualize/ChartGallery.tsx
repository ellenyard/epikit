import type { ReactNode } from 'react';

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
  | 'paired';

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
      {/* Left bars (e.g., male) */}
      <rect x="10" y="8" width="26" height="8" fill="currentColor" rx="1" />
      <rect x="16" y="22" width="20" height="8" fill="currentColor" rx="1" />
      <rect x="6" y="36" width="30" height="8" fill="currentColor" rx="1" />
      {/* Center axis */}
      <line x1="40" y1="4" x2="40" y2="54" stroke="#999" strokeWidth="1" />
      {/* Right bars (e.g., female) */}
      <rect x="44" y="8" width="22" height="8" fill="#E57A3A" rx="1" />
      <rect x="44" y="22" width="28" height="8" fill="#E57A3A" rx="1" />
      <rect x="44" y="36" width="18" height="8" fill="#E57A3A" rx="1" />
    </svg>
  );
}

interface ChartGroup {
  label: string;
  charts: ChartInfo[];
}

const CHART_GROUPS: ChartGroup[] = [
  {
    label: 'Core Charts',
    charts: [
      { type: 'bar', name: 'Bar Chart', description: 'Compare categories with horizontal or vertical bars', thumbnail: BarThumbnail },
      { type: 'line', name: 'Line Chart', description: 'Show trends over time with connected data points', thumbnail: LineThumbnail },
      { type: 'slope', name: 'Slope Chart', description: 'Compare changes between two time points', thumbnail: SlopeThumbnail },
      { type: 'lollipop', name: 'Lollipop Chart', description: 'A lighter alternative to bar charts with dot endpoints', thumbnail: LollipopThumbnail },
    ],
  },
  {
    label: 'Comparison Charts',
    charts: [
      { type: 'grouped', name: 'Grouped Bar Chart', description: 'Compare multiple series side by side', thumbnail: GroupedBarThumbnail },
      { type: 'bullet', name: 'Bullet Chart', description: 'Show performance against a target or benchmark', thumbnail: BulletThumbnail },
      { type: 'waffle', name: 'Waffle Chart', description: 'Display proportions as filled squares in a grid', thumbnail: WaffleThumbnail },
    ],
  },
  {
    label: 'Advanced Charts',
    charts: [
      { type: 'dot', name: 'Dot Plot', description: 'Plot individual values along a single axis', thumbnail: DotPlotThumbnail },
      { type: 'heatmap', name: 'Heatmap', description: 'Visualize values across two dimensions with color intensity', thumbnail: HeatmapThumbnail },
      { type: 'paired', name: 'Paired Bar Chart', description: 'Compare two groups as mirrored horizontal bars', thumbnail: PairedBarThumbnail },
    ],
  },
];

interface ChartGalleryProps {
  onSelectChart: (chartType: ChartType) => void;
}

export function ChartGallery({ onSelectChart }: ChartGalleryProps) {
  return (
    <div className="space-y-8">
      {CHART_GROUPS.map((group) => (
        <div key={group.label}>
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {group.label}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.charts.map((chart) => {
              const Thumbnail = chart.thumbnail;
              return (
                <button
                  key={chart.type}
                  onClick={() => onSelectChart(chart.type)}
                  className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-lg text-left hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className="flex-shrink-0 bg-gray-50 rounded-md p-2 group-hover:bg-blue-50 transition-colors">
                    <Thumbnail />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                      {chart.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                      {chart.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
