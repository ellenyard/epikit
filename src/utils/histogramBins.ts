/**
 * Histogram binning for the variable explorer.
 *
 * The bin width is typed by the user. The input carries min="0.01", but that is
 * only an HTML hint and the change handler accepted any positive number, so a
 * width of 0.0001 against a variable reaching 100000 asked for a billion bins.
 * Each bin then re-scanned every value, so the tab locked up with no way back:
 * the same failure as an unvalidated bin size once caused on the epi curve.
 *
 * Counting is a single pass that computes each value's bin directly, rather
 * than a filter per bin, and the bin count is capped by widening the request
 * rather than refusing it, so the histogram still answers the question asked.
 */

export interface HistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
  label: string;
  /** The lower edge alone, for an axis tick, with as many decimals as the width needs. */
  startLabel: string;
}

export interface HistogramResult {
  bins: HistogramBin[];
  /** The width actually used, which may be wider than requested. */
  binWidth: number;
  requestedBinWidth: number;
  /** True when the request was too fine and was widened to stay drawable. */
  widened: boolean;
}

/**
 * More bins than this cannot be read on screen and cost time to compute, so a
 * finer request is widened to fit.
 */
export const MAX_HISTOGRAM_BINS = 250;

/** Decimals needed to tell adjacent bin edges apart at this width. */
function labelPrecision(binWidth: number): number {
  if (!Number.isFinite(binWidth) || binWidth <= 0) return 1;
  if (binWidth >= 1) return 1;
  return Math.min(6, Math.ceil(-Math.log10(binWidth)) + 1);
}

/** Decimals needed to write the bin width itself: 0 for 5, 1 for 0.2, 2 for 0.25. */
function widthDecimals(binWidth: number): number {
  for (let d = 0; d <= 6; d++) {
    if (Math.abs(binWidth - Number(binWidth.toFixed(d))) < 1e-9 * Math.max(1, Math.abs(binWidth))) return d;
  }
  return 6;
}

/**
 * A quotient that should be a whole number but is not quite, because the
 * operands are decimal fractions: 0.6 / 0.2 is 2.9999999999999996 and
 * 38.4 - 36 over 0.2 is 11.999999999999993. Floored as they stand, a value
 * sitting exactly on a bin's lower edge is counted in the bin below, so
 * temperatures recorded to 0.2 came out as 2, 1, 0, 2, 0 instead of one per
 * bin. Snapping to the nearest integer when within rounding error fixes that
 * without moving any value that is genuinely inside a bin.
 */
function snap(quotient: number): number {
  const nearest = Math.round(quotient);
  return Math.abs(quotient - nearest) < 1e-9 * Math.max(1, Math.abs(nearest)) ? nearest : quotient;
}

export function computeHistogram(
  values: number[],
  requestedBinWidth: number,
  maxBins: number = MAX_HISTOGRAM_BINS
): HistogramResult {
  const usable = values.filter(v => Number.isFinite(v));
  const fallback: HistogramResult = {
    bins: [],
    binWidth: requestedBinWidth,
    requestedBinWidth,
    widened: false,
  };
  if (usable.length === 0) return fallback;
  if (!Number.isFinite(requestedBinWidth) || requestedBinWidth <= 0) return fallback;

  let min = usable[0];
  let max = usable[0];
  for (const v of usable) {
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const limit = Math.max(1, Math.floor(maxBins));
  let binWidth = requestedBinWidth;
  let binStart = Math.floor(snap(min / binWidth)) * binWidth;
  let binEnd = Math.ceil(snap(max / binWidth)) * binWidth;
  let binCount = Math.max(1, Math.round((binEnd - binStart) / binWidth));

  // Widen until the histogram is drawable. Recomputing the edges each time
  // matters because rounding them outward can add a bin back.
  let widened = false;
  let guard = 0;
  while (binCount > limit && guard < 64) {
    binWidth *= Math.max(2, Math.ceil(binCount / limit));
    binStart = Math.floor(snap(min / binWidth)) * binWidth;
    binEnd = Math.ceil(snap(max / binWidth)) * binWidth;
    binCount = Math.max(1, Math.round((binEnd - binStart) / binWidth));
    widened = true;
    guard++;
  }

  const counts = new Array<number>(binCount).fill(0);
  for (const v of usable) {
    // Clamping covers both ends: float drift below binStart, and the maximum
    // value landing exactly on the final edge, which would otherwise fall out
    // of the histogram entirely.
    let index = Math.floor(snap((v - binStart) / binWidth));
    if (index < 0) index = 0;
    if (index >= binCount) index = binCount - 1;
    counts[index]++;
  }

  const decimals = labelPrecision(binWidth);
  const tickDecimals = widthDecimals(binWidth);
  const bins: HistogramBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const start = binStart + i * binWidth;
    const end = start + binWidth;
    bins.push({
      binStart: start,
      binEnd: end,
      count: counts[i],
      label: `${start.toFixed(decimals)} - ${end.toFixed(decimals)}`,
      startLabel: start.toFixed(tickDecimals),
    });
  }

  return { bins, binWidth, requestedBinWidth, widened };
}
