import type { CaseRecord, Dataset } from '../../../types/analysis';
import { VariableMapper } from './VariableMapper';
import { ChartContainer } from './ChartContainer';
import { composeFacetSvg, svgWrapper, svgText, FACET_PANEL_WIDTH } from '../../../utils/chartExport';
import type { ExcelExportData, FacetPanel } from '../../../utils/chartExport';
import { categoriesInColumn, categoryOf, recordCount } from '../../../utils/chartCategories';

interface FacetWrapperProps {
  dataset: Dataset;
  facetCol: string;
  title: string;
  subtitle?: string;
  source?: string;
  /** Notes that apply to the whole figure, printed once under the panels. */
  notes: string[];
  /**
   * Draw one panel from the records of one stratum, FACET_PANEL_WIDTH wide.
   * An empty string means the stratum has nothing to plot.
   */
  renderPanel: (records: CaseRecord[], label: string) => string;
  filename: string;
  excelData?: ExcelExportData;
}

/**
 * A chart split into one panel per value of a stratifying variable.
 *
 * The panels are composed into a single drawing. They used to be separate
 * 800px charts inside narrow scrolling boxes, which showed the left 350px of
 * each (every bar appeared to run to the edge of its box, with no values or
 * axis in view) and could not be exported at all.
 */
export function FacetWrapper({
  dataset,
  facetCol,
  title,
  subtitle,
  source,
  notes,
  renderPanel,
  filename,
  excelData,
}: FacetWrapperProps) {
  const column = dataset.columns.find(c => c.key === facetCol);
  const facetValues = categoriesInColumn(dataset.records, column);
  const facetLabel = column?.label || facetCol;

  const panels: FacetPanel[] = facetValues.map(value => {
    const records = dataset.records.filter(r => categoryOf(r[facetCol]) === value);
    const svg = renderPanel(records, value)
      || svgWrapper(FACET_PANEL_WIDTH, 80, svgText(FACET_PANEL_WIDTH / 2, 44, 'Nothing to plot in this panel', { fontSize: 12, fill: '#6B7280' }));
    return { label: value, records: records.length, svg };
  });

  // A record with no value for the stratifier belongs to no panel. Say so,
  // rather than letting the panels quietly add up to less than the dataset.
  const unplaced = dataset.records.filter(r => categoryOf(r[facetCol]) === null).length;
  const allNotes = unplaced > 0
    ? [...notes, `${recordCount(unplaced)} with no ${facetLabel} ${unplaced === 1 ? 'is' : 'are'} not shown.`]
    : notes;

  const svgContent = composeFacetSvg(panels, {
    title,
    subtitle: subtitle || `By ${facetLabel}`,
    notes: allNotes,
    source,
  });

  if (!svgContent) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        No panels to draw: {facetLabel} has no values.
      </div>
    );
  }

  return (
    <ChartContainer title={title} svgContent={svgContent} excelData={excelData} filename={filename}>
      <div dangerouslySetInnerHTML={{ __html: svgContent }} />
    </ChartContainer>
  );
}

interface FacetControlProps {
  /** The columns that can stratify a chart (see categoryColumns). */
  columns: Dataset['columns'];
  value: string;
  onChange: (col: string) => void;
  /** Whether every panel uses one value axis. Omit to hide the choice. */
  sharedScale?: boolean;
  onSharedScaleChange?: (shared: boolean) => void;
}

export function FacetControl({ columns, value, onChange, sharedScale, onSharedScaleChange }: FacetControlProps) {
  return (
    <div className="border-t border-gray-200 pt-3 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        <p className="text-xs font-medium text-purple-700">Stratify</p>
      </div>
      <VariableMapper
        label="Stratify by"
        description="Split chart into panels by this variable"
        columns={columns}
        value={value}
        onChange={onChange}
        placeholder="None (single chart)"
      />
      {value && onSharedScaleChange && (
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={sharedScale ?? true}
            onChange={(e) => onSharedScaleChange(e.target.checked)}
            className="rounded border-gray-300"
          />
          Same scale in every panel
        </label>
      )}
    </div>
  );
}
