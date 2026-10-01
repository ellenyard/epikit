/**
 * Turning a map on screen into a PNG file.
 *
 * The spot map, area map and sketch map each had their own copy of this, and
 * each was broken in a different way:
 *
 *  - html2canvas cannot read the oklch() colours Tailwind 4 emits, and throws.
 *    The spot map worked around it by forcing every background to transparent,
 *    which also blanked the legend swatches and the cluster bubbles. The area
 *    map and sketch map had no workaround, so their PNG export never finished.
 *  - html2canvas applies a CSS transform on an <svg> element twice. Leaflet
 *    positions its marker and polygon layer with exactly such a transform, so
 *    every exported point sat a fifth of the map away from where it was on
 *    screen, and after a pan most of them were clipped off.
 *
 * Both are handled here, once, on the copy of the page html2canvas works from.
 */
import html2canvas from 'html2canvas';

export function waitForNextPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Wait for tiles that are still arriving, without waiting forever on ones that never will. */
export async function waitForMapImages(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll('img'));
  const pendingImages = images.filter(image => !image.complete);

  if (pendingImages.length > 0) {
    await Promise.race<void>([
      Promise.all(pendingImages.map(image => new Promise<void>(resolve => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      }))).then(() => undefined),
      new Promise(resolve => window.setTimeout(resolve, 2500)),
    ]);
  }

  await waitForNextPaint();
}

// Colour notations html2canvas 1.4 does not understand.
const MODERN_COLOR = /\b(?:oklch|oklab|lch|lab|color|color-mix)\((?:[^()]|\([^()]*\))*\)/g;
const HAS_MODERN_COLOR = /\b(?:oklch|oklab|lch|lab|color|color-mix)\(/;

const SINGLE_COLOR_PROPERTIES = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  '-webkit-text-stroke-color',
];

const COMPOUND_COLOR_PROPERTIES = ['box-shadow', 'text-shadow', 'background-image'];

/**
 * Rewrite every colour html2canvas cannot parse as plain rgba().
 *
 * The browser does the conversion: the colour is painted onto a one-pixel
 * canvas and read back. Only the properties that need it are touched, so
 * swatches, bubbles and anything else with an ordinary colour keep it.
 */
function normalizeColors(clonedDocument: Document, root: HTMLElement): void {
  const view = clonedDocument.defaultView;
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const context = probe.getContext('2d', { willReadFrequently: true });
  if (!view || !context) return;

  const cache = new Map<string, string>();
  const toRgba = (color: string): string => {
    const cached = cache.get(color);
    if (cached) return cached;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#000';
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    const alpha = a / 255;
    // Canvas pixels are premultiplied, so an almost transparent colour comes
    // back with little of its hue left. It is drawn as transparent either way.
    const rgba = alpha === 0 ? 'rgba(0, 0, 0, 0)' : `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(3))})`;
    cache.set(color, rgba);
    return rgba;
  };

  const elements: Element[] = [clonedDocument.documentElement, clonedDocument.body, root];
  const walker = clonedDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    // html2canvas draws an <svg> as one image and never reads the styles of
    // what is inside it, so thousands of marker paths need not be visited.
    acceptNode: node =>
      node.parentElement?.closest('svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  while (walker.nextNode()) elements.push(walker.currentNode as Element);

  for (const element of elements) {
    const style = (element as HTMLElement | SVGElement).style;
    if (!style) continue;
    const computed = view.getComputedStyle(element);

    for (const property of SINGLE_COLOR_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (value && HAS_MODERN_COLOR.test(value)) style.setProperty(property, toRgba(value), 'important');
    }

    for (const property of COMPOUND_COLOR_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (value && HAS_MODERN_COLOR.test(value)) {
        style.setProperty(property, value.replace(MODERN_COLOR, match => toRgba(match)), 'important');
      }
    }
  }
}

/**
 * Give Leaflet's vector layer a position html2canvas reads correctly.
 *
 * Leaflet places the <svg> holding the markers or polygons with a CSS
 * transform. html2canvas copies every computed style onto its copy of an SVG
 * element, serialises that copy into an image, and draws the image where the
 * element sits on the page. The transform is therefore applied once by the
 * page layout and a second time inside the image, and the layer lands twice as
 * far from the corner as it should, cropped by its own edges.
 *
 * The layer is moved into a plain positioned box and stripped of its own
 * positioning, so the offset exists in exactly one place.
 */
function flattenVectorLayerTransforms(clonedDocument: Document, root: HTMLElement): void {
  const view = clonedDocument.defaultView;
  root.querySelectorAll<SVGSVGElement>('.leaflet-pane > svg').forEach(layer => {
    const transform = view?.getComputedStyle(layer).transform ?? '';
    let x = 0;
    let y = 0;
    if (transform && transform !== 'none') {
      const matrix = new DOMMatrixReadOnly(transform);
      x = matrix.m41;
      y = matrix.m42;
    }

    const holder = clonedDocument.createElement('div');
    holder.style.cssText =
      `position:absolute;left:${x}px;top:${y}px;` +
      `width:${layer.getAttribute('width') ?? 0}px;height:${layer.getAttribute('height') ?? 0}px;`;
    layer.parentNode?.insertBefore(holder, layer);
    holder.appendChild(layer);
    layer.removeAttribute('class');
    layer.setAttribute('style', 'display:block;');
  });
}

export interface CaptureOptions {
  scale?: number;
  /** Class names whose elements are left out, on top of the defaults. */
  excludeClasses?: string[];
}

// Controls for using the map, which have no place in a figure.
const ALWAYS_EXCLUDED = ['map-export-exclude', 'leaflet-control-zoom'];

/** Draw a map container, with its overlays, to a canvas. Rejects if it cannot. */
export async function captureMapCanvas(
  element: HTMLElement,
  options: CaptureOptions = {}
): Promise<HTMLCanvasElement> {
  const bounds = element.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    throw new Error('Map has no visible size.');
  }

  const excluded = [...ALWAYS_EXCLUDED, ...(options.excludeClasses ?? [])];
  const marker = 'data-map-capture-root';
  element.setAttribute(marker, 'true');

  // html2canvas finds the text baseline by putting a 1px image beside some
  // text in a <div> on <body> and measuring where it lands. Tailwind makes
  // every image a block, which drops that probe to the next line, and all text
  // is then drawn several pixels too low: labels slide out of line with their
  // swatches and off the scale bar. This rule applies to the probe alone.
  const baselineFix = document.createElement('style');
  baselineFix.textContent = 'body > div > img[width="1"][height="1"] { display: inline !important; }';
  document.head.appendChild(baselineFix);

  try {
    await waitForNextPaint();
    await waitForMapImages(element);

    return await html2canvas(element, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scale: options.scale ?? 2,
      imageTimeout: 15000,
      logging: false,
      ignoreElements: candidate => excluded.some(name => candidate.classList.contains(name)),
      onclone: clonedDocument => {
        const root = clonedDocument.querySelector<HTMLElement>(`[${marker}="true"]`);
        if (!root) return;
        flattenVectorLayerTransforms(clonedDocument, root);
        normalizeColors(clonedDocument, root);
      },
    });
  } finally {
    element.removeAttribute(marker);
    baselineFix.remove();
  }
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('The image could not be encoded as PNG.'));
    }, 'image/png');
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(content: string, filename: string, type: string): void {
  downloadBlob(new Blob([content], { type }), filename);
}

/**
 * Rasterise a self-contained SVG document.
 *
 * Unlike the chart exporter's helper of the same purpose, this rejects on
 * failure so the caller can tell the user, rather than logging and returning.
 */
export function svgToPngBlob(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('Could not get a canvas to draw on.'));
      return;
    }

    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvasToPngBlob(canvas).then(resolve, reject);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The drawing could not be rendered as an image.'));
    };
    image.src = url;
  });
}
