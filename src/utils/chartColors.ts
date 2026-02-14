export type ChartColorScheme = 'evergreen' | 'colorblind' | 'grayscale' | 'blue' | 'warm';

// Evergreen-inspired palette: muted, professional colors
const evergreenColors = ['#2E5E86', '#E57A3A', '#5BA155', '#C44E52', '#8C6BB1', '#D4944A', '#4ABFBF', '#7F7F7F'];
const colorblindColors = ['#0077BB', '#33BBEE', '#009988', '#EE7733', '#CC3311', '#EE3377', '#BBBBBB', '#000000'];
const grayscaleColors = ['#2D2D2D', '#4D4D4D', '#6D6D6D', '#8D8D8D', '#ADADAD', '#CDCDCD', '#E0E0E0', '#F0F0F0'];
const blueColors = ['#08306B', '#08519C', '#2171B5', '#4292C6', '#6BAED6', '#9ECAE1', '#C6DBEF', '#DEEBF7'];
const warmColors = ['#7F2704', '#A63603', '#D94801', '#F16913', '#FD8D3C', '#FDAE6B', '#FDD0A2', '#FEEDDE'];

const palettes: Record<ChartColorScheme, string[]> = {
  evergreen: evergreenColors,
  colorblind: colorblindColors,
  grayscale: grayscaleColors,
  blue: blueColors,
  warm: warmColors,
};

export function getChartColor(index: number, scheme: ChartColorScheme = 'evergreen'): string {
  const palette = palettes[scheme];
  return palette[index % palette.length];
}

export function getChartColors(count: number, scheme: ChartColorScheme = 'evergreen'): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(getChartColor(i, scheme));
  }
  return colors;
}

// Single highlight color for charts with one series
export const PRIMARY_COLOR = '#2E5E86';
export const SECONDARY_COLOR = '#E57A3A';
export const INCREASE_COLOR = '#2E8B57'; // Green for positive slopes
export const DECREASE_COLOR = '#C44E52'; // Red for negative slopes
export const NEUTRAL_COLOR = '#8C8C8C'; // Gray for no change
