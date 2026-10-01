export type ChartColorScheme = 'evergreen' | 'colorblind' | 'grayscale' | 'blue' | 'warm';

// Default palette: muted, professional colors.
//
// The hues are the original ones; their lightness was re-tuned so that every
// pair stays apart under the common colour-vision deficiencies. The previous
// green (#5BA155) and red (#C44E52) were third and fourth in the list, the
// usual colours of "Probable" and "Suspected" in a four-level classification,
// and were all but identical to a deuteranope (a colour difference of 7, where
// about 15 is needed to tell two marks apart). The smallest difference in this
// set, for normal, deuteranopic and protanopic vision alike, is 19. The first
// two colours are unchanged.
const evergreenColors = ['#2E5E86', '#E57A3A', '#7EB979', '#732629', '#A48AC1', '#7C501D', '#215E5E', '#8C8C8C'];
const colorblindColors = ['#0077BB', '#33BBEE', '#009988', '#EE7733', '#CC3311', '#EE3377', '#BBBBBB', '#000000'];
// Greys alternate dark and light so that neighbours in a stack or a legend
// differ clearly. In strict dark-to-light order each step was too small to see.
const grayscaleColors = ['#1F1F1F', '#B5B5B5', '#5C5C5C', '#D9D9D9', '#3D3D3D', '#999999', '#7A7A7A', '#C7C7C7'];
const blueColors = ['#08306B', '#08519C', '#2171B5', '#4292C6', '#6BAED6', '#9ECAE1', '#C6DBEF', '#DEEBF7'];
const warmColors = ['#7F2704', '#A63603', '#D94801', '#F16913', '#FD8D3C', '#FDAE6B', '#FDD0A2', '#FEEDDE'];

const palettes: Record<ChartColorScheme, string[]> = {
  evergreen: evergreenColors,
  colorblind: colorblindColors,
  grayscale: grayscaleColors,
  blue: blueColors,
  warm: warmColors,
};

/** Blend a hex colour toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0;
  const weight = Math.abs(amount);
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(value + (target - value) * weight).toString(16).padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
}

/**
 * The colour for the nth series.
 *
 * A palette has eight colours. Past the eighth the same colours used to come
 * round again unchanged, so a waffle chart of 42 neighbourhoods had five
 * categories for every colour and its legend could not be read. Later rounds
 * are now a lighter and then a darker shade of the palette: still not ideal
 * for that many categories, but no two neighbours in the legend are identical.
 */
export function getChartColor(index: number, scheme: ChartColorScheme = 'evergreen'): string {
  const palette = palettes[scheme];
  const base = palette[index % palette.length];
  const round = Math.floor(index / palette.length) % 3;
  if (round === 1) return shade(base, 0.45);
  if (round === 2) return shade(base, -0.35);
  return base;
}

/** Black or white, whichever reads better as text on the given fill. */
export function textColorOn(fill: string): string {
  const hex = /^#[0-9a-f]{6}$/i.test(fill) ? fill : '#000000';
  const linear = [1, 3, 5].map(offset => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  // The crossover where white and near-black give equal contrast is about 0.18.
  return luminance > 0.2 ? '#1F2937' : '#FFFFFF';
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
// Direction of change on a slope chart. These were green for an increase and
// red for a decrease, which reads as good and bad: a rise in cases was drawn in
// green. The pair was also nearly indistinguishable to a deuteranope. Blue and
// orange carry no verdict and stay apart for every viewer.
export const INCREASE_COLOR = '#2E5E86'; // Blue for a rise
export const DECREASE_COLOR = '#E57A3A'; // Orange for a fall
export const NEUTRAL_COLOR = '#8C8C8C'; // Gray for no change
