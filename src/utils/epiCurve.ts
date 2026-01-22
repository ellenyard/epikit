import type { CaseRecord } from '../types/analysis';

export type BinSize = 'hourly' | '6hour' | '12hour' | 'daily' | 'weekly-cdc' | 'weekly-iso';
export type ColorScheme = 'default' | 'classification' | 'colorblind' | 'grayscale';

export interface EpiCurveBin {
  startDate: Date;
  endDate: Date;
  label: string;
  cases: CaseRecord[];
  strata: Map<string, CaseRecord[]>;
  total: number;
}

export interface EpiCurveData {
  bins: EpiCurveBin[];
  maxCount: number;
  strataKeys: string[];
  dateRange: { start: Date; end: Date };
}

export interface Annotation {
  id: string;
  type: 'first-case' | 'exposure' | 'intervention' | 'incubation';
  date: Date;
  endDate?: Date;
  label: string;
  color: string;
}

// Common pathogens with incubation periods (in days)
export const PATHOGEN_INCUBATION: Record<string, { min: number; max: number; typical: number }> = {
  'Salmonella': { min: 0.5, max: 3, typical: 1 },
  'E. coli O157:H7': { min: 1, max: 10, typical: 3.5 },
  'Norovirus': { min: 0.5, max: 2, typical: 1.25 },
  'Campylobacter': { min: 2, max: 5, typical: 3 },
  'Listeria': { min: 3, max: 70, typical: 21 },
  'Hepatitis A': { min: 15, max: 50, typical: 28 },
  'Shigella': { min: 1, max: 3, typical: 2 },
  'Vibrio': { min: 0.5, max: 5, typical: 1 },
  'Cryptosporidium': { min: 2, max: 10, typical: 7 },
  'Giardia': { min: 7, max: 14, typical: 10 },
  'Cyclospora': { min: 7, max: 14, typical: 7 },
  'Staphylococcus aureus': { min: 0.04, max: 0.25, typical: 0.125 },
  'Clostridium perfringens': { min: 0.33, max: 0.75, typical: 0.5 },
  'Bacillus cereus (emetic)': { min: 0.04, max: 0.25, typical: 0.125 },
  'Bacillus cereus (diarrheal)': { min: 0.33, max: 0.67, typical: 0.5 },
  'Botulism': { min: 0.5, max: 5, typical: 1.5 },
  'Cholera': { min: 0.08, max: 5, typical: 2 },
  'Typhoid': { min: 7, max: 21, typical: 14 },
  'Legionella': { min: 2, max: 10, typical: 5 },
  'Influenza': { min: 1, max: 4, typical: 2 },
  'COVID-19': { min: 2, max: 14, typical: 5 },
  'Measles': { min: 10, max: 14, typical: 12 },
  'Chickenpox': { min: 14, max: 21, typical: 16 },
  'Mumps': { min: 12, max: 25, typical: 17 },
};

// Helper to parse dates consistently as local time
function parseDate(dateValue: string | Date): Date {
  if (dateValue instanceof Date) {
    return dateValue;
  }
  const dateStr = String(dateValue);
  // If date is in YYYY-MM-DD format without time, append time to parse as local
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
}

export function processEpiCurveData(
  records: CaseRecord[],
  dateColumn: string,
  binSize: BinSize,
  stratifyBy?: string
): EpiCurveData {
  // Filter records with valid dates
  const validRecords = records.filter(r => {
    const dateVal = r[dateColumn];
    if (!dateVal) return false;
    const date = parseDate(String(dateVal));
    return !isNaN(date.getTime());
  });

  if (validRecords.length === 0) {
    return { bins: [], maxCount: 0, strataKeys: [], dateRange: { start: new Date(), end: new Date() } };
  }

  // Get date range
  const dates = validRecords.map(r => parseDate(String(r[dateColumn])));
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

  // Adjust to bin boundaries
  let startDate = getBinStart(minDate, binSize);
  let endDate = getBinEnd(maxDate, binSize);

  // Add padding bins (2 on each side) for visual spacing with 0 cases
  const paddingBins = 2;
  for (let i = 0; i < paddingBins; i++) {
    startDate = getPreviousBinStart(startDate, binSize);
  }
  for (let i = 0; i < paddingBins; i++) {
    endDate = getNextBinStart(endDate, binSize);
  }

  // Generate bins
  const bins: EpiCurveBin[] = [];
  let currentStart = new Date(startDate);

  while (currentStart <= endDate) {
    const currentEnd = getNextBinStart(currentStart, binSize);

    const binCases = validRecords.filter(r => {
      const caseDate = parseDate(String(r[dateColumn]));
      return caseDate >= currentStart && caseDate < currentEnd;
    });

    const strata = new Map<string, CaseRecord[]>();
    if (stratifyBy) {
      binCases.forEach(c => {
        const strataValue = String(c[stratifyBy] ?? 'Unknown');
        if (!strata.has(strataValue)) {
          strata.set(strataValue, []);
        }
        strata.get(strataValue)!.push(c);
      });
    }

    bins.push({
      startDate: new Date(currentStart),
      endDate: new Date(currentEnd),
      label: formatBinLabel(currentStart, binSize),
      cases: binCases,
      strata,
      total: binCases.length,
    });

    currentStart = currentEnd;
  }

  // Get all unique strata keys
  const strataKeysSet = new Set<string>();
  bins.forEach(bin => {
    bin.strata.forEach((_, key) => strataKeysSet.add(key));
  });

  const maxCount = Math.max(...bins.map(b => b.total), 1);

  return {
    bins,
    maxCount,
    strataKeys: Array.from(strataKeysSet).sort(),
    dateRange: { start: startDate, end: endDate },
  };
}

function getBinStart(date: Date, binSize: BinSize): Date {
  const d = new Date(date);

  switch (binSize) {
    case 'hourly':
      d.setMinutes(0, 0, 0);
      break;
    case '6hour':
      d.setHours(Math.floor(d.getHours() / 6) * 6, 0, 0, 0);
      break;
    case '12hour':
      d.setHours(Math.floor(d.getHours() / 12) * 12, 0, 0, 0);
      break;
    case 'daily':
      d.setHours(0, 0, 0, 0);
      break;
    case 'weekly-cdc':
      // CDC weeks start on Sunday
      const cdcDay = d.getDay();
      d.setDate(d.getDate() - cdcDay);
      d.setHours(0, 0, 0, 0);
      break;
    case 'weekly-iso':
      // ISO weeks start on Monday
      const isoDay = d.getDay() || 7;
      d.setDate(d.getDate() - (isoDay - 1));
      d.setHours(0, 0, 0, 0);
      break;
  }

  return d;
}

function getBinEnd(date: Date, binSize: BinSize): Date {
  const start = getBinStart(date, binSize);
  return getNextBinStart(start, binSize);
}

function getNextBinStart(date: Date, binSize: BinSize): Date {
  const d = new Date(date);

  switch (binSize) {
    case 'hourly':
      d.setHours(d.getHours() + 1);
      break;
    case '6hour':
      d.setHours(d.getHours() + 6);
      break;
    case '12hour':
      d.setHours(d.getHours() + 12);
      break;
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly-cdc':
    case 'weekly-iso':
      d.setDate(d.getDate() + 7);
      break;
  }

  return d;
}

function getPreviousBinStart(date: Date, binSize: BinSize): Date {
  const d = new Date(date);

  switch (binSize) {
    case 'hourly':
      d.setHours(d.getHours() - 1);
      break;
    case '6hour':
      d.setHours(d.getHours() - 6);
      break;
    case '12hour':
      d.setHours(d.getHours() - 12);
      break;
    case 'daily':
      d.setDate(d.getDate() - 1);
      break;
    case 'weekly-cdc':
    case 'weekly-iso':
      d.setDate(d.getDate() - 7);
      break;
  }

  return d;
}

function formatBinLabel(date: Date, binSize: BinSize): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  switch (binSize) {
    case 'hourly':
      return `${months[date.getMonth()]} ${date.getDate()} ${date.getHours()}:00`;
    case '6hour':
    case '12hour':
      return `${months[date.getMonth()]} ${date.getDate()} ${date.getHours()}:00`;
    case 'daily':
      return `${months[date.getMonth()]} ${date.getDate()}`;
    case 'weekly-cdc':
    case 'weekly-iso':
      return `${months[date.getMonth()]} ${date.getDate()}`;
  }
}

export function getColorForStrata(
  strataKey: string,
  index: number,
  scheme: ColorScheme,
  _allKeys: string[]
): string {
  const defaultColors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];

  const classificationColors: Record<string, string> = {
    'Confirmed': '#DC2626',
    'Probable': '#F59E0B',
    'Suspected': '#3B82F6',
    'Unknown': '#9CA3AF',
  };

  const colorblindColors = [
    '#0077BB', '#33BBEE', '#009988', '#EE7733', '#CC3311',
    '#EE3377', '#BBBBBB', '#000000'
  ];

  const grayscaleColors = [
    '#1F2937', '#374151', '#4B5563', '#6B7280', '#9CA3AF',
    '#D1D5DB', '#E5E7EB', '#F3F4F6'
  ];

  switch (scheme) {
    case 'classification':
      return classificationColors[strataKey] || defaultColors[index % defaultColors.length];
    case 'colorblind':
      return colorblindColors[index % colorblindColors.length];
    case 'grayscale':
      return grayscaleColors[index % grayscaleColors.length];
    default:
      return defaultColors[index % defaultColors.length];
  }
}

export function findFirstCaseDate(records: CaseRecord[], dateColumn: string): Date | null {
  const validRecords = records.filter(r => {
    const dateVal = r[dateColumn];
    if (!dateVal) return false;
    const date = parseDate(String(dateVal));
    return !isNaN(date.getTime());
  });

  if (validRecords.length === 0) return null;

  const dates = validRecords.map(r => parseDate(String(r[dateColumn])));
  return new Date(Math.min(...dates.map(d => d.getTime())));
}
