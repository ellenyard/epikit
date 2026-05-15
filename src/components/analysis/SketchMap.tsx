import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import html2canvas from 'html2canvas';
import { ExportIcons, ResultsActions, TabHeader } from '../shared';

type SketchTool = 'select' | 'pen' | 'line' | 'curve' | 'wavy' | 'area' | 'irregularArea' | 'marker' | 'label';
type SketchBackground = 'grid' | 'dots' | 'blank';
type FillPattern = 'solid' | 'hatch' | 'crosshatch' | 'dots' | 'waves' | 'grid';
type LineStyle = 'solid' | 'dashed' | 'dotted';
type LegendPosition = 'side' | 'below';
type MarkerShape =
  | 'circle'
  | 'house'
  | 'tree'
  | 'triangle'
  | 'paw'
  | 'water'
  | 'field'
  | 'garden'
  | 'star'
  | 'square'
  | 'diamond'
  | 'cross'
  | 'sprayer'
  | 'animal'
  | 'school'
  | 'clinic'
  | 'well'
  | 'latrine'
  | 'waste'
  | 'market'
  | 'bridge'
  | 'note';

interface Point {
  x: number;
  y: number;
}

interface SketchElement {
  id: string;
  type: SketchTool;
  points?: Point[];
  start?: Point;
  end?: Point;
  text?: string;
  color: string;
  fillColor?: string;
  strokeWidth: number;
  size: number;
  fillPattern: FillPattern;
  lineStyle: LineStyle;
  markerId?: string;
  markerShape?: MarkerShape;
  legendLabel?: string;
  filled: boolean;
  opacity: number;
}

interface MarkerDefinition {
  id: string;
  label: string;
  shape: MarkerShape;
  defaultColor: string;
  defaultFillPattern: FillPattern;
  filled: boolean;
  legendLabel: string;
}

interface LegendItem {
  key: string;
  label: string;
  element: SketchElement;
}

interface ElementRenderOptions {
  selectedId: string | null;
  selectionEnabled: boolean;
  onSelect: (event: PointerEvent<SVGGElement>, id: string) => void;
}

const canvasWidth = 1200;
const canvasHeight = 800;

const tools: Array<{ id: SketchTool; label: string; hint: string }> = [
  { id: 'select', label: 'Select', hint: 'Move and edit objects' },
  { id: 'marker', label: 'Marker', hint: 'Place a map symbol' },
  { id: 'label', label: 'Label', hint: 'Add text' },
  { id: 'line', label: 'Line', hint: 'Straight paths and boundaries' },
  { id: 'curve', label: 'Curve', hint: 'Curved roads and footpaths' },
  { id: 'wavy', label: 'Wavy', hint: 'Drainage and runoff lines' },
  { id: 'area', label: 'Area', hint: 'Rectangular fields and zones' },
  { id: 'irregularArea', label: 'Free area', hint: 'Mud, ditches, play areas' },
  { id: 'pen', label: 'Pen', hint: 'Freehand sketching' },
];

const markerLibrary: MarkerDefinition[] = [
  {
    id: 'case-residence',
    label: 'Case residence',
    shape: 'house',
    defaultColor: '#111827',
    defaultFillPattern: 'solid',
    filled: true,
    legendLabel: 'Case residence',
  },
  {
    id: 'noncase-residence',
    label: 'Non-case residence',
    shape: 'house',
    defaultColor: '#111827',
    defaultFillPattern: 'solid',
    filled: false,
    legendLabel: 'Non-case residence',
  },
  {
    id: 'household',
    label: 'Household',
    shape: 'house',
    defaultColor: '#374151',
    defaultFillPattern: 'solid',
    filled: false,
    legendLabel: 'Household or residence',
  },
  {
    id: 'case-person',
    label: 'Case person',
    shape: 'circle',
    defaultColor: '#111827',
    defaultFillPattern: 'solid',
    filled: true,
    legendLabel: 'Case person',
  },
  {
    id: 'noncase-person',
    label: 'Non-case person',
    shape: 'circle',
    defaultColor: '#111827',
    defaultFillPattern: 'solid',
    filled: false,
    legendLabel: 'Non-case person',
  },
  {
    id: 'school',
    label: 'School or childcare',
    shape: 'school',
    defaultColor: '#1F2937',
    defaultFillPattern: 'dots',
    filled: false,
    legendLabel: 'School or childcare',
  },
  {
    id: 'clinic',
    label: 'Clinic or health post',
    shape: 'clinic',
    defaultColor: '#1F2937',
    defaultFillPattern: 'solid',
    filled: false,
    legendLabel: 'Clinic or health post',
  },
  {
    id: 'market',
    label: 'Market or shop',
    shape: 'market',
    defaultColor: '#1F2937',
    defaultFillPattern: 'hatch',
    filled: false,
    legendLabel: 'Market or shop',
  },
  {
    id: 'water-source',
    label: 'Water source',
    shape: 'water',
    defaultColor: '#2563EB',
    defaultFillPattern: 'waves',
    filled: false,
    legendLabel: 'Water source',
  },
  {
    id: 'pond',
    label: 'Pond or standing water',
    shape: 'water',
    defaultColor: '#2563EB',
    defaultFillPattern: 'waves',
    filled: true,
    legendLabel: 'Pond or standing water',
  },
  {
    id: 'runoff',
    label: 'Runoff or drainage',
    shape: 'water',
    defaultColor: '#2563EB',
    defaultFillPattern: 'waves',
    filled: false,
    legendLabel: 'Runoff or drainage',
  },
  {
    id: 'ditch-mud-play',
    label: 'Ditch, mud, or play area',
    shape: 'field',
    defaultColor: '#6B7280',
    defaultFillPattern: 'waves',
    filled: true,
    legendLabel: 'Ditch, mud, or play area',
  },
  {
    id: 'latrine',
    label: 'Latrine or sanitation',
    shape: 'latrine',
    defaultColor: '#1F2937',
    defaultFillPattern: 'solid',
    filled: false,
    legendLabel: 'Latrine or sanitation',
  },
  {
    id: 'waste',
    label: 'Waste or disposal site',
    shape: 'waste',
    defaultColor: '#1F2937',
    defaultFillPattern: 'crosshatch',
    filled: false,
    legendLabel: 'Waste or disposal site',
  },
  {
    id: 'animal-illness',
    label: 'Animal illness report',
    shape: 'paw',
    defaultColor: '#7C2D12',
    defaultFillPattern: 'dots',
    filled: false,
    legendLabel: 'Reported animal illness; relationship unknown',
  },
  {
    id: 'animal-pen',
    label: 'Animal pen or pasture',
    shape: 'animal',
    defaultColor: '#374151',
    defaultFillPattern: 'hatch',
    filled: false,
    legendLabel: 'Animal pen or pasture',
  },
  {
    id: 'dead-animal',
    label: 'Animal death report',
    shape: 'animal',
    defaultColor: '#7C2D12',
    defaultFillPattern: 'crosshatch',
    filled: true,
    legendLabel: 'Animal death report',
  },
  {
    id: 'pesticide-use',
    label: 'Reported pesticide use',
    shape: 'sprayer',
    defaultColor: '#92400E',
    defaultFillPattern: 'hatch',
    filled: false,
    legendLabel: 'Reported pesticide use/application area',
  },
  {
    id: 'rice-paddy',
    label: 'Rice paddy',
    shape: 'field',
    defaultColor: '#166534',
    defaultFillPattern: 'hatch',
    filled: false,
    legendLabel: 'Rice paddy',
  },
  {
    id: 'vegetable-garden',
    label: 'Vegetable garden',
    shape: 'garden',
    defaultColor: '#166534',
    defaultFillPattern: 'grid',
    filled: false,
    legendLabel: 'Home vegetable garden',
  },
  {
    id: 'fruit-tree',
    label: 'Fruit tree',
    shape: 'tree',
    defaultColor: '#166534',
    defaultFillPattern: 'dots',
    filled: false,
    legendLabel: 'Fruit tree',
  },
  {
    id: 'mango-tree',
    label: 'Mango tree',
    shape: 'tree',
    defaultColor: '#166534',
    defaultFillPattern: 'dots',
    filled: true,
    legendLabel: 'Mango tree',
  },
  {
    id: 'road-crossing',
    label: 'Bridge or crossing',
    shape: 'bridge',
    defaultColor: '#374151',
    defaultFillPattern: 'solid',
    filled: false,
    legendLabel: 'Bridge or crossing',
  },
  {
    id: 'note',
    label: 'Investigation note',
    shape: 'note',
    defaultColor: '#1F2937',
    defaultFillPattern: 'solid',
    filled: false,
    legendLabel: 'Investigation note',
  },
  {
    id: 'custom',
    label: 'Custom marker',
    shape: 'star',
    defaultColor: '#1F2937',
    defaultFillPattern: 'solid',
    filled: false,
    legendLabel: 'Custom marker',
  },
];

const markerShapeOptions: Array<{ id: MarkerShape; label: string }> = [
  { id: 'circle', label: 'Circle' },
  { id: 'house', label: 'House' },
  { id: 'tree', label: 'Tree' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'paw', label: 'Paw' },
  { id: 'water', label: 'Water' },
  { id: 'field', label: 'Field' },
  { id: 'garden', label: 'Garden' },
  { id: 'star', label: 'Star' },
  { id: 'square', label: 'Square' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'cross', label: 'Cross' },
  { id: 'sprayer', label: 'Sprayer' },
  { id: 'animal', label: 'Animal' },
  { id: 'school', label: 'School' },
  { id: 'clinic', label: 'Clinic' },
  { id: 'well', label: 'Well' },
  { id: 'latrine', label: 'Latrine' },
  { id: 'waste', label: 'Waste' },
  { id: 'market', label: 'Market' },
  { id: 'bridge', label: 'Bridge' },
  { id: 'note', label: 'Note' },
];

const patternOptions: Array<{ id: FillPattern; label: string }> = [
  { id: 'solid', label: 'Solid/open' },
  { id: 'hatch', label: 'Hatch' },
  { id: 'crosshatch', label: 'Crosshatch' },
  { id: 'dots', label: 'Dots' },
  { id: 'waves', label: 'Waves' },
  { id: 'grid', label: 'Grid' },
];

const lineStyleOptions: Array<{ id: LineStyle; label: string }> = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];

const markerById = new Map(markerLibrary.map(marker => [marker.id, marker]));

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sketch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const toCanvasPoint = (x: number, y: number): Point => ({ x: (x / 100) * canvasWidth, y: (y / 100) * canvasHeight });

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.tagName === 'SELECT'
    || target.isContentEditable;
}

const createElement = (partial: Partial<SketchElement>): SketchElement => ({
  id: createId(),
  type: 'marker',
  color: '#1F2937',
  strokeWidth: 4,
  size: 40,
  fillPattern: 'solid',
  lineStyle: 'solid',
  filled: false,
  opacity: 1,
  ...partial,
});

const makeMarkerElement = (
  markerId: string,
  point: Point,
  overrides: Partial<SketchElement> = {},
): SketchElement => {
  const marker = markerById.get(markerId) ?? markerById.get('custom')!;
  return createElement({
    type: 'marker',
    start: point,
    markerId,
    markerShape: marker.shape,
    color: marker.defaultColor,
    fillColor: marker.defaultColor,
    fillPattern: marker.defaultFillPattern,
    filled: marker.filled,
    legendLabel: marker.legendLabel,
    text: markerId === 'custom' ? 'Custom marker' : undefined,
    ...overrides,
  });
};

const makeLineElement = (
  type: 'line' | 'curve' | 'wavy',
  start: Point,
  end: Point,
  overrides: Partial<SketchElement> = {},
): SketchElement => createElement({
  type,
  start,
  end,
  filled: false,
  fillPattern: 'solid',
  ...overrides,
});

const makeAreaElement = (
  type: 'area' | 'irregularArea',
  start: Point,
  end: Point,
  overrides: Partial<SketchElement> = {},
): SketchElement => createElement({
  type,
  start,
  end,
  filled: true,
  fillPattern: 'hatch',
  opacity: 0.95,
  ...overrides,
});

export function SketchMap() {
  const svgRef = useRef<SVGSVGElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [elements, setElements] = useState<SketchElement[]>([]);
  const [draft, setDraft] = useState<SketchElement | null>(null);
  const [tool, setTool] = useState<SketchTool>('select');
  const [color, setColor] = useState('#1F2937');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [size, setSize] = useState(40);
  const [fillPattern, setFillPattern] = useState<FillPattern>('solid');
  const [lineStyle, setLineStyle] = useState<LineStyle>('solid');
  const [background, setBackground] = useState<SketchBackground>('grid');
  const [labelText, setLabelText] = useState('Label');
  const [markerId, setMarkerId] = useState('case-residence');
  const [customMarkerLabel, setCustomMarkerLabel] = useState('Custom marker');
  const [customMarkerShape, setCustomMarkerShape] = useState<MarkerShape>('star');
  const [customMarkerFilled, setCustomMarkerFilled] = useState(false);
  const [showTitle, setShowTitle] = useState(true);
  const [title, setTitle] = useState('Sketch map');
  const [subtitle, setSubtitle] = useState('Not to scale; adapted for teaching.');
  const [showLegend, setShowLegend] = useState(true);
  const [legendPosition, setLegendPosition] = useState<LegendPosition>('side');
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ id: string; lastPoint: Point } | null>(null);
  const [exportStatus, setExportStatus] = useState('');

  const selectedElement = selectedId ? elements.find(element => element.id === selectedId) ?? null : null;

  const legendItems = useMemo(() => buildLegendItems(elements), [elements]);

  const getPointFromRect = (rect: DOMRect | undefined, clientX: number, clientY: number): Point => {
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * canvasWidth,
      y: ((clientY - rect.top) / rect.height) * canvasHeight,
    };
  };

  const getPoint = (event: PointerEvent<SVGSVGElement>): Point => (
    getPointFromRect(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY)
  );

  const clampToCanvas = (point: Point): Point => ({
    x: clamp(point.x, 0, canvasWidth),
    y: clamp(point.y, 0, canvasHeight),
  });

  const getElementPoint = (event: PointerEvent<SVGGElement>): Point => (
    getPointFromRect(event.currentTarget.ownerSVGElement?.getBoundingClientRect(), event.clientX, event.clientY)
  );

  const currentMarkerDefinition = markerById.get(markerId) ?? markerById.get('custom')!;

  const buildInstantElement = (point: Point): SketchElement => {
    if (tool === 'label') {
      return createElement({
        type: 'label',
        start: point,
        text: labelText || 'Label',
        color,
        strokeWidth,
        size,
        fillPattern,
        lineStyle,
        filled: false,
      });
    }

    const isCustom = markerId === 'custom';
    return makeMarkerElement(markerId, point, {
      color,
      fillColor: color,
      strokeWidth,
      size,
      fillPattern: isCustom ? fillPattern : currentMarkerDefinition.defaultFillPattern,
      lineStyle,
      filled: isCustom ? customMarkerFilled : currentMarkerDefinition.filled,
      markerShape: isCustom ? customMarkerShape : currentMarkerDefinition.shape,
      legendLabel: isCustom ? customMarkerLabel : currentMarkerDefinition.legendLabel,
      text: isCustom ? customMarkerLabel : undefined,
    });
  };

  const startDrawing = (event: PointerEvent<SVGSVGElement>) => {
    const point = clampToCanvas(getPoint(event));

    if (tool === 'select') {
      setSelectedId(null);
      return;
    }

    const base = {
      id: createId(),
      type: tool,
      color,
      fillColor: color,
      strokeWidth,
      size,
      fillPattern,
      lineStyle,
      filled: tool === 'area' || tool === 'irregularArea',
      opacity: 1,
    };

    if (tool === 'marker' || tool === 'label') {
      const element = buildInstantElement(point);
      setElements(previous => [...previous, element]);
      setSelectedId(element.id);
      return;
    }

    setIsDrawing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({
      ...base,
      start: point,
      end: point,
      points: tool === 'pen' || tool === 'irregularArea' ? [point] : undefined,
    });
  };

  const continueDrawing = (event: PointerEvent<SVGSVGElement>) => {
    const point = clampToCanvas(getPoint(event));

    if (dragState) {
      const dx = point.x - dragState.lastPoint.x;
      const dy = point.y - dragState.lastPoint.y;
      setElements(previous => previous.map(element => (
        element.id === dragState.id ? moveElement(element, dx, dy) : element
      )));
      setDragState({ id: dragState.id, lastPoint: point });
      return;
    }

    if (!isDrawing || !draft) return;

    setDraft(previous => {
      if (!previous) return previous;
      if (previous.type === 'pen' || previous.type === 'irregularArea') {
        return { ...previous, points: [...(previous.points ?? []), point], end: point };
      }
      return { ...previous, end: point };
    });
  };

  const finishDrawing = (event?: PointerEvent<SVGSVGElement>) => {
    if (dragState) {
      setDragState(null);
      return;
    }

    if (draft) {
      const committed = normalizeDraft(draft);
      if (committed) {
        setElements(previous => [...previous, committed]);
        setSelectedId(committed.id);
      }
    }

    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDraft(null);
    setIsDrawing(false);
  };

  const handleElementPointerDown = (event: PointerEvent<SVGGElement>, id: string) => {
    if (tool !== 'select') return;
    event.stopPropagation();
    const point = getElementPoint(event);
    setSelectedId(id);
    setDragState({ id, lastPoint: point });
  };

  const undo = () => {
    setElements(previous => previous.slice(0, -1));
    setSelectedId(null);
  };

  const clearSketch = () => {
    setElements([]);
    setSelectedId(null);
  };

  const updateSelected = (updates: Partial<SketchElement>) => {
    if (!selectedId) return;
    setElements(previous => previous.map(element => (
      element.id === selectedId ? { ...element, ...updates } : element
    )));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setElements(previous => previous.filter(element => element.id !== selectedId));
    setSelectedId(null);
  };

  useEffect(() => {
    if (!selectedId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (isTextEntryTarget(event.target)) return;

      event.preventDefault();
      setElements(previous => previous.filter(element => element.id !== selectedId));
      setSelectedId(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  const duplicateSelected = () => {
    if (!selectedElement) return;
    const duplicate = moveElement({ ...selectedElement, id: createId() }, 26, 26);
    setElements(previous => [...previous, duplicate]);
    setSelectedId(duplicate.id);
  };

  const scaleSelected = (factor: number) => {
    if (!selectedId) return;
    setElements(previous => previous.map(element => (
      element.id === selectedId ? scaleElement(element, factor) : element
    )));
  };

  const reorderSelected = (mode: 'forward' | 'backward' | 'front' | 'back') => {
    if (!selectedId) return;
    setElements(previous => reorderElement(previous, selectedId, mode));
  };

  const exportPNG = async () => {
    if (!exportRef.current) return;
    const canvas = await html2canvas(exportRef.current, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
    });
    const link = document.createElement('a');
    link.download = `sketch-map-${new Date().toISOString().split('T')[0]}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportStatus('PNG downloaded.');
    window.setTimeout(() => setExportStatus(''), 3000);
  };

  const exportSVG = () => {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const svg = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `sketch-map-${new Date().toISOString().split('T')[0]}.svg`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExportStatus('SVG downloaded.');
    window.setTimeout(() => setExportStatus(''), 3000);
  };

  const loadTemplate = (templateId: string) => {
    if (templateId === 'blank') {
      clearSketch();
      setTitle('Sketch map');
      setSubtitle('Not to scale; adapted for teaching.');
      return;
    }

    const templateFn = templateId === 'village'
      ? makeVillageSketchTemplate
      : templateId === 'school'
        ? makeBoardingSchoolTemplate
        : templateId === 'hospital'
          ? makeHospitalTemplate
          : null;

    if (templateFn) {
      const template = templateFn();
      setTitle(template.title);
      setSubtitle(template.subtitle);
      setShowTitle(true);
      setShowLegend(true);
      setLegendPosition('side');
      setBackground('grid');
      setElements(template.elements);
      setSelectedId(null);
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row bg-white">
      <div className="w-full lg:w-96 flex-shrink-0 bg-gray-50 border-b lg:border-b-0 border-gray-200 p-4 overflow-y-auto max-h-[52vh] lg:max-h-none">
        <TabHeader
          title="Sketch Map"
          description="Build schematic field maps with symbols, labels, legends, and report-ready exports."
        />

        <div className="space-y-5">
          <section className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Tool</label>
            <div className="grid grid-cols-3 gap-2">
              {tools.map(item => (
                <button
                  key={item.id}
                  onClick={() => setTool(item.id)}
                  data-tooltip={item.hint}
                  className={`px-2 py-2 text-sm font-medium rounded-md border ${
                    tool === item.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3 border-t border-gray-200 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="w-full h-10 p-1 border border-gray-300 rounded-md bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Line ({strokeWidth})</label>
                <input
                  type="range"
                  min="1"
                  max="12"
                  value={strokeWidth}
                  onChange={(event) => setStrokeWidth(Number(event.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {tool === 'label' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New item size ({size})</label>
                <input
                  type="range"
                  min="20"
                  max="90"
                  value={size}
                  onChange={(event) => setSize(Number(event.target.value))}
                  className="w-full"
                />
              </div>
            )}

            {tool !== 'marker' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Line style</label>
                  <select
                    value={lineStyle}
                    onChange={(event) => setLineStyle(event.target.value as LineStyle)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  >
                    {lineStyleOptions.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pattern</label>
                  <select
                    value={fillPattern}
                    onChange={(event) => setFillPattern(event.target.value as FillPattern)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  >
                    {patternOptions.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </section>

          {tool === 'marker' && (
            <section className="space-y-3 border-t border-gray-200 pt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Marker</label>
                <select
                  value={markerId}
                  onChange={(event) => setMarkerId(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                >
                  {markerLibrary.map(marker => (
                    <option key={marker.id} value={marker.id}>{marker.label}</option>
                  ))}
                </select>
              </div>

              {markerId === 'custom' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Custom label</label>
                    <input
                      type="text"
                      value={customMarkerLabel}
                      onChange={(event) => setCustomMarkerLabel(event.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Shape</label>
                      <select
                        value={customMarkerShape}
                        onChange={(event) => setCustomMarkerShape(event.target.value as MarkerShape)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                      >
                        {markerShapeOptions.map(option => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 mt-6 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={customMarkerFilled}
                        onChange={(event) => setCustomMarkerFilled(event.target.checked)}
                      />
                      Filled
                    </label>
                  </div>
                </div>
              )}
            </section>
          )}

          {(tool === 'label' || tool === 'area' || tool === 'irregularArea' || tool === 'line' || tool === 'curve' || tool === 'wavy') && (
            <section className="space-y-2 border-t border-gray-200 pt-4">
              <label className="block text-sm font-medium text-gray-700">
                {tool === 'label' ? 'Label text' : 'Legend label'}
              </label>
              <input
                type="text"
                value={labelText}
                onChange={(event) => setLabelText(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              />
            </section>
          )}

          <section className="space-y-3 border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-gray-700">Title and caption</label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={showTitle}
                  onChange={(event) => setShowTitle(event.target.checked)}
                />
                Show
              </label>
            </div>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              placeholder="Map title"
            />
            <textarea
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              placeholder="Subtitle or caption"
            />
          </section>

          <section className="space-y-3 border-t border-gray-200 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Background</label>
                <select
                  value={background}
                  onChange={(event) => setBackground(event.target.value as SketchBackground)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                >
                  <option value="grid">Light grid</option>
                  <option value="dots">Dot grid</option>
                  <option value="blank">Blank</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Legend location</label>
                <select
                  value={legendPosition}
                  onChange={(event) => setLegendPosition(event.target.value as LegendPosition)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  disabled={!showLegend}
                >
                  <option value="side">Side panel</option>
                  <option value="below">Below sketch</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showLegend}
                onChange={(event) => setShowLegend(event.target.checked)}
              />
              Auto-build legend from placed symbols
            </label>
          </section>

          {selectedElement && (
            <section className="space-y-3 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-gray-900">Selected object</h4>
                <span className="text-xs text-gray-500">
                  {selectedElement.type === 'marker' && selectedElement.markerId
                    ? markerById.get(selectedElement.markerId)?.label ?? 'Marker'
                    : selectedElement.type === 'irregularArea' ? 'Free area' : selectedElement.type}
                </span>
              </div>

              {(selectedElement.type === 'label' || selectedElement.type === 'marker') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Text or marker note</label>
                  <input
                    type="text"
                    value={selectedElement.text ?? ''}
                    onChange={(event) => updateSelected({ text: event.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  />
                </div>
              )}

              {(selectedElement.type === 'label' || selectedElement.type === 'marker') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Size ({selectedElement.size})</label>
                  <input
                    type="range"
                    min="20"
                    max="120"
                    value={selectedElement.size}
                    onChange={(event) => updateSelected({ size: Number(event.target.value) })}
                    className="w-full"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Legend label</label>
                <input
                  type="text"
                  value={selectedElement.legendLabel ?? ''}
                  onChange={(event) => updateSelected({ legendLabel: event.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                <input
                  type="color"
                  value={selectedElement.color}
                  onChange={(event) => updateSelected({ color: event.target.value, fillColor: event.target.value })}
                  className="w-full h-10 p-1 border border-gray-300 rounded-md bg-white"
                />
              </div>

              {selectedElement.type !== 'marker' && selectedElement.type !== 'label' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pattern</label>
                  <select
                    value={selectedElement.fillPattern}
                    onChange={(event) => updateSelected({ fillPattern: event.target.value as FillPattern })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  >
                    {patternOptions.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedElement.type === 'marker' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shape</label>
                    <select
                      value={selectedElement.markerShape ?? 'circle'}
                      onChange={(event) => updateSelected({ markerShape: event.target.value as MarkerShape })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                    >
                      {markerShapeOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 mt-6 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={selectedElement.filled}
                      onChange={(event) => updateSelected({ filled: event.target.checked })}
                    />
                    Filled
                  </label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => scaleSelected(0.9)}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Shrink
                </button>
                <button
                  onClick={() => scaleSelected(1.1)}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Grow
                </button>
                <button
                  onClick={duplicateSelected}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Duplicate
                </button>
                <button
                  onClick={deleteSelected}
                  className="px-3 py-2 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50"
                >
                  Delete
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <LayerButton label="Back" onClick={() => reorderSelected('back')} />
                <LayerButton label="Down" onClick={() => reorderSelected('backward')} />
                <LayerButton label="Up" onClick={() => reorderSelected('forward')} />
                <LayerButton label="Front" onClick={() => reorderSelected('front')} />
              </div>
            </section>
          )}

          <section className="space-y-3 border-t border-gray-200 pt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Templates</label>
              <select
                defaultValue=""
                onChange={(event) => {
                  loadTemplate(event.target.value);
                  event.target.value = '';
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              >
                <option value="" disabled>Choose a template</option>
                <option value="blank">Blank teaching map frame</option>
                <option value="village">Simple village sketch</option>
                <option value="school">Boarding school outbreak</option>
                <option value="hospital">Hospital ward sketch</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={undo}
                disabled={elements.length === 0}
                className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Undo
              </button>
              <button
                onClick={clearSketch}
                disabled={elements.length === 0}
                className="flex-1 px-3 py-2 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </section>

          <ResultsActions
            actions={[
              {
                label: 'Export PNG',
                onClick: exportPNG,
                icon: ExportIcons.image,
                variant: 'primary',
              },
              {
                label: 'Export SVG',
                onClick: exportSVG,
                icon: ExportIcons.download,
                variant: 'secondary',
              },
            ]}
          />

          {exportStatus && (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md px-3 py-2 text-xs">
              {exportStatus}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-gray-100 p-4 overflow-auto">
        <div className="flex flex-col xl:flex-row gap-4 mx-auto" style={{ maxWidth: legendPosition === 'side' && showLegend && legendItems.length > 0 ? 1560 : 1200 }}>
          <div ref={exportRef} className="flex-1 bg-white shadow-sm min-w-0">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              className="w-full touch-none select-none"
              style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
              onPointerDown={startDrawing}
              onPointerMove={continueDrawing}
              onPointerUp={finishDrawing}
              onPointerLeave={finishDrawing}
            >
              <SketchDefs />
              <rect width={canvasWidth} height={canvasHeight} fill="#FFFFFF" />
              <rect width={canvasWidth} height={canvasHeight} fill={getBackgroundFill(background)} />
              {showTitle && renderTitle(title, subtitle)}
              {[...elements, ...(draft ? [draft] : [])].map(element => renderElement(element, {
                selectedId,
                selectionEnabled: tool === 'select',
                onSelect: handleElementPointerDown,
              }))}
            </svg>
            {legendPosition === 'below' && showLegend && legendItems.length > 0 && (
              <HtmlLegend items={legendItems} />
            )}
          </div>
          {legendPosition === 'side' && showLegend && legendItems.length > 0 && (
            <div className="xl:w-80 flex-shrink-0">
              <HtmlLegend items={legendItems} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LayerButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
    >
      {label}
    </button>
  );
}

function HtmlLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <h4 className="text-sm font-bold text-gray-900 mb-3">Legend</h4>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.key} className="flex items-center gap-3">
            <svg width="28" height="24" viewBox="0 0 28 24" className="flex-shrink-0">
              <SketchDefs />
              {renderLegendSymbol(item.element, 14, 12)}
            </svg>
            <span className="text-sm text-gray-800">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SketchDefs() {
  return (
    <defs>
      <pattern id="sketch-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E5E7EB" strokeWidth="1" />
      </pattern>
      <pattern id="sketch-dots-bg" width="28" height="28" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.3" fill="#D1D5DB" />
      </pattern>
      <pattern id="sketch-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#FFFFFF" />
        <line x1="0" y1="0" x2="0" y2="8" stroke="#6B7280" strokeWidth="2" />
      </pattern>
      <pattern id="sketch-crosshatch" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="#FFFFFF" />
        <path d="M0 0 L10 10 M10 0 L0 10" stroke="#6B7280" strokeWidth="1.5" />
      </pattern>
      <pattern id="sketch-dots" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill="#FFFFFF" />
        <circle cx="3" cy="3" r="1.6" fill="#6B7280" />
        <circle cx="9" cy="9" r="1.6" fill="#6B7280" />
      </pattern>
      <pattern id="sketch-waves" width="24" height="12" patternUnits="userSpaceOnUse">
        <rect width="24" height="12" fill="#FFFFFF" />
        <path d="M0 7 Q6 1 12 7 T24 7" fill="none" stroke="#6B7280" strokeWidth="1.6" />
      </pattern>
      <pattern id="sketch-field-grid" width="14" height="14" patternUnits="userSpaceOnUse">
        <rect width="14" height="14" fill="#FFFFFF" />
        <path d="M14 0 L0 0 0 14" fill="none" stroke="#6B7280" strokeWidth="1.4" />
      </pattern>
    </defs>
  );
}

function getBackgroundFill(background: SketchBackground) {
  if (background === 'grid') return 'url(#sketch-grid)';
  if (background === 'dots') return 'url(#sketch-dots-bg)';
  return '#FFFFFF';
}

function renderTitle(title: string, subtitle: string) {
  return (
    <g pointerEvents="none">
      <text x="600" y="38" textAnchor="middle" fill="#111827" fontSize="30" fontWeight="700">
        {title}
      </text>
      {subtitle && (
        <text x="600" y="64" textAnchor="middle" fill="#4B5563" fontSize="18">
          {subtitle}
        </text>
      )}
    </g>
  );
}

function renderElement(element: SketchElement, options: ElementRenderOptions) {
  const selected = options.selectedId === element.id;
  const start = element.start ?? { x: 0, y: 0 };
  const end = element.end ?? start;
  const dashArray = getDashArray(element.lineStyle, element.strokeWidth);
  const commonProps = {
    onPointerDown: (event: PointerEvent<SVGGElement>) => options.onSelect(event, element.id),
    pointerEvents: options.selectionEnabled ? 'visiblePainted' : 'none',
    style: { cursor: options.selectionEnabled ? 'move' : 'default' },
  } as const;

  let content: ReactNode;

  if (element.type === 'pen') {
    const d = makePolylinePath(element.points ?? []);
    content = (
      <path
        d={d}
        fill="none"
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashArray}
        opacity={element.opacity}
      />
    );
  } else if (element.type === 'line') {
    content = (
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        strokeLinecap="round"
        strokeDasharray={dashArray}
        opacity={element.opacity}
      />
    );
  } else if (element.type === 'curve') {
    content = (
      <path
        d={makeCurvePath(start, end)}
        fill="none"
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashArray}
        opacity={element.opacity}
      />
    );
  } else if (element.type === 'wavy') {
    content = (
      <path
        d={makeWavyPath(start, end, Math.max(5, element.strokeWidth * 2))}
        fill="none"
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashArray}
        opacity={element.opacity}
      />
    );
  } else if (element.type === 'area') {
    const bounds = getRectBounds(start, end);
    content = (
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        fill={getElementFill(element)}
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        strokeDasharray={dashArray}
        rx="8"
        opacity={element.opacity}
      />
    );
  } else if (element.type === 'irregularArea') {
    const path = makeClosedPath(element.points?.length ? element.points : makeIrregularBandPoints(start, end));
    content = (
      <path
        d={path}
        fill={getElementFill(element)}
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        strokeDasharray={dashArray}
        strokeLinejoin="round"
        opacity={element.opacity}
      />
    );
  } else if (element.type === 'marker') {
    content = renderMarkerIcon(element, start.x, start.y, element.size);
  } else {
    content = renderLabel(element, start);
  }

  return (
    <g key={element.id} {...commonProps}>
      {content}
      {selected && renderSelectionBox(element)}
    </g>
  );
}

function renderLabel(element: SketchElement, start: Point) {
  const lines = (element.text || 'Label').split('\n');
  const fontSize = element.size || 30;
  return (
    <text
      x={start.x}
      y={start.y}
      fill={element.color}
      fontSize={fontSize}
      fontWeight="600"
      paintOrder="stroke"
      stroke="#FFFFFF"
      strokeWidth="6"
      strokeLinejoin="round"
      opacity={element.opacity}
    >
      {lines.map((line, index) => (
        <tspan key={`${element.id}-${index}`} x={start.x} dy={index === 0 ? 0 : fontSize * 1.15}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function renderMarkerIcon(element: SketchElement, x: number, y: number, size: number) {
  const marker = element.markerId ? markerById.get(element.markerId) : undefined;
  const shape = element.markerShape ?? marker?.shape ?? 'circle';
  const color = element.color;
  const fill = element.filled ? getElementFill(element) : '#FFFFFF';
  const strokeWidth = element.strokeWidth;
  const half = size / 2;
  const q = size / 4;
  const eighth = size / 8;

  if (shape === 'circle') {
    return <circle cx={x} cy={y} r={half} fill={fill} stroke={color} strokeWidth={strokeWidth} opacity={element.opacity} />;
  }

  if (shape === 'square') {
    return <rect x={x - half} y={y - half} width={size} height={size} fill={fill} stroke={color} strokeWidth={strokeWidth} opacity={element.opacity} />;
  }

  if (shape === 'diamond') {
    return <path d={`M ${x} ${y - half} L ${x + half} ${y} L ${x} ${y + half} L ${x - half} ${y} Z`} fill={fill} stroke={color} strokeWidth={strokeWidth} opacity={element.opacity} />;
  }

  if (shape === 'triangle') {
    return <path d={`M ${x} ${y - half} L ${x + half} ${y + half} L ${x - half} ${y + half} Z`} fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" opacity={element.opacity} />;
  }

  if (shape === 'star') {
    return <path d={makeStarPath(x, y, half, q)} fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" opacity={element.opacity} />;
  }

  if (shape === 'cross') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity={element.opacity}>
        <line x1={x - half} y1={y} x2={x + half} y2={y} />
        <line x1={x} y1={y - half} x2={x} y2={y + half} />
      </g>
    );
  }

  if (shape === 'house') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinejoin="round" opacity={element.opacity}>
        <path d={`M ${x - half} ${y - eighth} L ${x} ${y - half} L ${x + half} ${y - eighth} Z`} />
        <rect x={x - half * 0.72} y={y - eighth} width={size * 0.72} height={size * 0.58} />
        <rect x={x - eighth} y={y + q * 0.25} width={q} height={q * 1.15} fill="#FFFFFF" />
      </g>
    );
  }

  if (shape === 'tree') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinecap="round" strokeLinejoin="round" opacity={element.opacity}>
        <line x1={x} y1={y + q * 0.35} x2={x} y2={y + half} />
        <path d={`M ${x - q} ${y + half} L ${x + q} ${y + half}`} />
        <circle cx={x} cy={y - q * 0.4} r={q * 1.05} />
        <circle cx={x - q * 0.9} cy={y} r={q * 0.9} />
        <circle cx={x + q * 0.9} cy={y} r={q * 0.9} />
      </g>
    );
  }

  if (shape === 'paw') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} opacity={element.opacity}>
        <circle cx={x} cy={y + q * 0.45} r={q * 0.9} />
        <circle cx={x - q * 1.1} cy={y - q * 0.55} r={q * 0.45} />
        <circle cx={x - q * 0.35} cy={y - q * 1.05} r={q * 0.45} />
        <circle cx={x + q * 0.35} cy={y - q * 1.05} r={q * 0.45} />
        <circle cx={x + q * 1.1} cy={y - q * 0.55} r={q * 0.45} />
      </g>
    );
  }

  if (shape === 'water') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinejoin="round" opacity={element.opacity}>
        <path d={`M ${x} ${y - half} C ${x + half} ${y - q * 0.2} ${x + q} ${y + half} ${x} ${y + half} C ${x - q} ${y + half} ${x - half} ${y - q * 0.2} ${x} ${y - half} Z`} />
        <path d={`M ${x - q} ${y + q * 0.25} Q ${x} ${y - q * 0.25} ${x + q} ${y + q * 0.25}`} fill="none" />
      </g>
    );
  }

  if (shape === 'field') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinecap="round" opacity={element.opacity}>
        <rect x={x - half} y={y - q} width={size} height={size / 2} />
        <line x1={x - q} y1={y - q} x2={x - q} y2={y + q} />
        <line x1={x} y1={y - q} x2={x} y2={y + q} />
        <line x1={x + q} y1={y - q} x2={x + q} y2={y + q} />
      </g>
    );
  }

  if (shape === 'garden') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinecap="round" opacity={element.opacity}>
        <rect x={x - half} y={y - half * 0.7} width={size} height={size * 0.7} />
        <line x1={x - q} y1={y - half * 0.7} x2={x - q} y2={y} />
        <line x1={x} y1={y - half * 0.7} x2={x} y2={y} />
        <line x1={x + q} y1={y - half * 0.7} x2={x + q} y2={y} />
        <line x1={x - half} y1={y - q} x2={x + half} y2={y - q} />
      </g>
    );
  }

  if (shape === 'sprayer') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinecap="round" strokeLinejoin="round" opacity={element.opacity}>
        <rect x={x - q * 1.25} y={y - q} width={q * 1.5} height={q * 1.8} />
        <line x1={x + q * 0.25} y1={y - q * 0.2} x2={x + half} y2={y - half} />
        <line x1={x + half} y1={y - half} x2={x + half * 1.25} y2={y - half} />
        <circle cx={x + half * 1.4} cy={y - half * 0.9} r="1.5" fill={color} />
        <circle cx={x + half * 1.25} cy={y - half * 0.55} r="1.5" fill={color} />
        <circle cx={x + half * 1.55} cy={y - half * 0.55} r="1.5" fill={color} />
      </g>
    );
  }

  if (shape === 'animal') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinecap="round" strokeLinejoin="round" opacity={element.opacity}>
        <ellipse cx={x} cy={y} rx={half} ry={q} />
        <circle cx={x + half * 0.75} cy={y - q * 0.35} r={q * 0.55} />
        <line x1={x - q} y1={y + q} x2={x - q} y2={y + half} />
        <line x1={x + q} y1={y + q} x2={x + q} y2={y + half} />
        <line x1={x - half} y1={y - q * 0.25} x2={x - half * 1.25} y2={y - q * 0.7} />
      </g>
    );
  }

  if (shape === 'school') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinejoin="round" opacity={element.opacity}>
        <rect x={x - half} y={y - q} width={size} height={half} />
        <path d={`M ${x - half} ${y - q} L ${x} ${y - half} L ${x + half} ${y - q}`} />
        <line x1={x} y1={y - half} x2={x} y2={y - half * 1.35} />
        <path d={`M ${x} ${y - half * 1.35} L ${x + q} ${y - half * 1.18} L ${x} ${y - half}`} />
      </g>
    );
  }

  if (shape === 'clinic') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinecap="round" opacity={element.opacity}>
        <rect x={x - half} y={y - half} width={size} height={size} />
        <line x1={x - q} y1={y} x2={x + q} y2={y} />
        <line x1={x} y1={y - q} x2={x} y2={y + q} />
      </g>
    );
  }

  if (shape === 'well') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinecap="round" opacity={element.opacity}>
        <ellipse cx={x} cy={y} rx={half} ry={q} />
        <path d={`M ${x - half} ${y} L ${x - q} ${y + half} L ${x + q} ${y + half} L ${x + half} ${y} Z`} />
        <line x1={x - q} y1={y - half} x2={x - q} y2={y - q} />
        <line x1={x + q} y1={y - half} x2={x + q} y2={y - q} />
        <line x1={x - q} y1={y - half} x2={x + q} y2={y - half} />
      </g>
    );
  }

  if (shape === 'latrine') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinejoin="round" opacity={element.opacity}>
        <path d={`M ${x - q} ${y + half} L ${x - q} ${y - q} L ${x} ${y - half} L ${x + q} ${y - q} L ${x + q} ${y + half} Z`} />
        <circle cx={x + eighth} cy={y + q * 0.35} r="1.8" fill={color} />
      </g>
    );
  }

  if (shape === 'waste') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinecap="round" strokeLinejoin="round" opacity={element.opacity}>
        <path d={`M ${x - q} ${y - q} L ${x + q} ${y - q} L ${x + q * 0.75} ${y + half} L ${x - q * 0.75} ${y + half} Z`} />
        <line x1={x - q * 1.2} y1={y - q} x2={x + q * 1.2} y2={y - q} />
        <line x1={x - eighth} y1={y - q * 0.5} x2={x - eighth} y2={y + q} />
        <line x1={x + eighth} y1={y - q * 0.5} x2={x + eighth} y2={y + q} />
      </g>
    );
  }

  if (shape === 'market') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinecap="round" strokeLinejoin="round" opacity={element.opacity}>
        <rect x={x - half} y={y - q * 0.2} width={size} height={q * 1.6} />
        <path d={`M ${x - half} ${y - q * 0.2} L ${x - q} ${y - half} L ${x + q} ${y - half} L ${x + half} ${y - q * 0.2}`} />
        <line x1={x - q} y1={y - q * 0.2} x2={x - q} y2={y + q * 1.4} />
        <line x1={x + q} y1={y - q * 0.2} x2={x + q} y2={y + q * 1.4} />
      </g>
    );
  }

  if (shape === 'bridge') {
    return (
      <g stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" opacity={element.opacity}>
        <path d={`M ${x - half} ${y + q} Q ${x} ${y - half} ${x + half} ${y + q}`} />
        <line x1={x - half} y1={y + q} x2={x + half} y2={y + q} />
        <line x1={x - q} y1={y} x2={x - q} y2={y + q} />
        <line x1={x} y1={y - q * 0.25} x2={x} y2={y + q} />
        <line x1={x + q} y1={y} x2={x + q} y2={y + q} />
      </g>
    );
  }

  return (
    <g stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinejoin="round" opacity={element.opacity}>
      <path d={`M ${x - half} ${y - half} L ${x + q} ${y - half} L ${x + half} ${y - q} L ${x + half} ${y + half} L ${x - half} ${y + half} Z`} />
      <line x1={x + q} y1={y - half} x2={x + half} y2={y - q} />
    </g>
  );
}

function renderSelectionBox(element: SketchElement) {
  const bounds = getElementBounds(element);
  return (
    <rect
      x={bounds.x - 8}
      y={bounds.y - 8}
      width={bounds.width + 16}
      height={bounds.height + 16}
      fill="none"
      stroke="#2563EB"
      strokeWidth="2"
      strokeDasharray="8 6"
      pointerEvents="none"
    />
  );
}

function renderLegendSymbol(element: SketchElement, cx: number, cy: number) {
  if (element.type === 'marker') {
    return renderMarkerIcon({ ...element, size: 22, strokeWidth: 2, opacity: 1 }, cx, cy, 22);
  }

  if (element.type === 'wavy') {
    return <path d={makeWavyPath({ x: cx - 12, y: cy }, { x: cx + 12, y: cy }, 3)} fill="none" stroke={element.color} strokeWidth="3" strokeLinecap="round" />;
  }

  if (element.type === 'line' || element.type === 'curve') {
    return <line x1={cx - 12} y1={cy} x2={cx + 12} y2={cy} stroke={element.color} strokeWidth="3" strokeDasharray={getDashArray(element.lineStyle, 3)} strokeLinecap="round" />;
  }

  return <rect x={cx - 12} y={cy - 9} width="24" height="18" fill={getElementFill(element)} stroke={element.color} strokeWidth="2" />;
}

function buildLegendItems(elements: SketchElement[]): LegendItem[] {
  const seen = new Set<string>();
  const items: LegendItem[] = [];

  for (const element of elements) {
    const label = element.legendLabel?.trim();
    if (!label) continue;
    const key = `${element.type}:${element.markerShape ?? element.markerId ?? ''}:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ key, label, element });
  }

  return items.slice(0, 12);
}

function getElementFill(element: SketchElement) {
  if (!element.filled && element.type === 'marker') return '#FFFFFF';
  if (element.fillPattern === 'hatch') return 'url(#sketch-hatch)';
  if (element.fillPattern === 'crosshatch') return 'url(#sketch-crosshatch)';
  if (element.fillPattern === 'dots') return 'url(#sketch-dots)';
  if (element.fillPattern === 'waves') return 'url(#sketch-waves)';
  if (element.fillPattern === 'grid') return 'url(#sketch-field-grid)';
  return element.filled ? `${element.fillColor ?? element.color}33` : '#FFFFFF';
}

function getDashArray(style: LineStyle, strokeWidth: number) {
  if (style === 'dashed') return `${strokeWidth * 3} ${strokeWidth * 2}`;
  if (style === 'dotted') return `1 ${strokeWidth * 2}`;
  return undefined;
}

function makePolylinePath(points: Point[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function makeClosedPath(points: Point[]) {
  if (points.length === 0) return '';
  return `${makePolylinePath(points)} Z`;
}

function makeCurvePath(start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const control = {
    x: start.x + dx / 2 - dy * 0.18,
    y: start.y + dy / 2 + dx * 0.18,
  };
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

function makeWavyPath(start: Point, end: Point, amplitude: number) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const steps = Math.max(12, Math.ceil(length / 18));
  const normal = { x: -dy / length, y: dx / length };
  const points: Point[] = [];

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const wave = Math.sin(t * Math.PI * Math.max(2, length / 42)) * amplitude;
    points.push({
      x: start.x + dx * t + normal.x * wave,
      y: start.y + dy * t + normal.y * wave,
    });
  }

  return makePolylinePath(points);
}

function makeStarPath(cx: number, cy: number, outer: number, inner: number) {
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    points.push(`${cx + Math.cos(angle) * radius} ${cy + Math.sin(angle) * radius}`);
  }
  return `M ${points.join(' L ')} Z`;
}

function getRectBounds(start: Point, end: Point) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

function getElementBounds(element: SketchElement) {
  const points = [
    ...(element.points ?? []),
    ...(element.start ? [element.start] : []),
    ...(element.end ? [element.end] : []),
  ];

  if (element.type === 'marker' && element.start) {
    const half = element.size / 2;
    return { x: element.start.x - half, y: element.start.y - half, width: element.size, height: element.size };
  }

  if (element.type === 'label' && element.start) {
    const fontSize = element.size || 30;
    const text = element.text || 'Label';
    const width = Math.max(...text.split('\n').map(line => line.length), 1) * fontSize * 0.6;
    const height = text.split('\n').length * fontSize * 1.2;
    return { x: element.start.x, y: element.start.y - fontSize, width, height };
  }

  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(1, Math.max(...xs) - x),
    height: Math.max(1, Math.max(...ys) - y),
  };
}

function movePoint(point: Point | undefined, dx: number, dy: number): Point | undefined {
  if (!point) return undefined;
  return { x: point.x + dx, y: point.y + dy };
}

function moveElement(element: SketchElement, dx: number, dy: number): SketchElement {
  return {
    ...element,
    start: movePoint(element.start, dx, dy),
    end: movePoint(element.end, dx, dy),
    points: element.points?.map(point => ({ x: point.x + dx, y: point.y + dy })),
  };
}

function scaleElement(element: SketchElement, factor: number): SketchElement {
  if (element.type === 'marker' || element.type === 'label') {
    return { ...element, size: clamp(element.size * factor, 12, 180) };
  }

  const bounds = getElementBounds(element);
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const scalePoint = (point: Point | undefined): Point | undefined => {
    if (!point) return undefined;
    return {
      x: center.x + (point.x - center.x) * factor,
      y: center.y + (point.y - center.y) * factor,
    };
  };

  return {
    ...element,
    start: scalePoint(element.start),
    end: scalePoint(element.end),
    points: element.points?.map(point => scalePoint(point)!),
  };
}

function reorderElement(elements: SketchElement[], id: string, mode: 'forward' | 'backward' | 'front' | 'back') {
  const index = elements.findIndex(element => element.id === id);
  if (index < 0) return elements;
  const next = [...elements];
  const [element] = next.splice(index, 1);
  if (!element) return elements;

  if (mode === 'front') {
    next.push(element);
  } else if (mode === 'back') {
    next.unshift(element);
  } else if (mode === 'forward') {
    next.splice(Math.min(index + 1, next.length), 0, element);
  } else {
    next.splice(Math.max(index - 1, 0), 0, element);
  }

  return next;
}

function normalizeDraft(draft: SketchElement): SketchElement | null {
  if (draft.type === 'line' || draft.type === 'curve' || draft.type === 'wavy' || draft.type === 'area') {
    if (!draft.start || !draft.end) return null;
    if (Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y) < 4) return null;
  }

  if ((draft.type === 'pen' || draft.type === 'irregularArea') && (draft.points?.length ?? 0) < 2) {
    return null;
  }

  return draft;
}

function makeIrregularBandPoints(start: Point, end: Point): Point[] {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const width = right - left;
  const height = bottom - top;

  return [
    { x: left, y: top + height * 0.45 },
    { x: left + width * 0.18, y: top + height * 0.1 },
    { x: left + width * 0.42, y: top + height * 0.22 },
    { x: left + width * 0.7, y: top },
    { x: right, y: top + height * 0.34 },
    { x: right - width * 0.08, y: bottom },
    { x: left + width * 0.52, y: bottom - height * 0.16 },
    { x: left + width * 0.24, y: bottom },
  ];
}

function makeVillageSketchTemplate() {
  const elements: SketchElement[] = [
    makeAreaElement('area', toCanvasPoint(8, 74), toCanvasPoint(38, 91), {
      color: '#4B5563',
      fillColor: '#4B5563',
      fillPattern: 'hatch',
      legendLabel: 'Agricultural field',
    }),
    makeAreaElement('area', toCanvasPoint(63, 28), toCanvasPoint(79, 41), {
      color: '#166534',
      fillColor: '#166534',
      fillPattern: 'grid',
      legendLabel: 'Home garden',
    }),
    makeLineElement('curve', toCanvasPoint(18, 48), toCanvasPoint(82, 49), {
      color: '#6B7280',
      strokeWidth: 5,
      lineStyle: 'dashed',
      legendLabel: 'Road or footpath',
    }),
    makeAreaElement('irregularArea', toCanvasPoint(36, 59), toCanvasPoint(70, 70), {
      points: makeIrregularBandPoints(toCanvasPoint(36, 59), toCanvasPoint(70, 70)),
      color: '#4B5563',
      fillColor: '#4B5563',
      fillPattern: 'waves',
      legendLabel: 'Ditch, mud, or play area',
    }),
    makeLineElement('wavy', toCanvasPoint(50, 67), toCanvasPoint(61, 74), {
      color: '#2563EB',
      strokeWidth: 4,
      legendLabel: 'Water source or runoff',
    }),
    makeMarkerElement('mango-tree', toCanvasPoint(41, 54), { size: 36 }),
    makeMarkerElement('mango-tree', toCanvasPoint(61, 56), { size: 36 }),
    makeMarkerElement('water-source', toCanvasPoint(54, 72), { size: 34, strokeWidth: 3 }),
    createElement({ type: 'label', start: toCanvasPoint(47, 17), text: 'Village sketch', color: '#111827', size: 32, strokeWidth: 4, fillPattern: 'solid', lineStyle: 'solid', filled: false }),
    createElement({ type: 'label', start: toCanvasPoint(42, 66), text: 'Ditch / mud / play area', color: '#111827', size: 19, strokeWidth: 4, fillPattern: 'solid', lineStyle: 'solid', filled: false }),
  ];

  const households = [
    [35, 40, 'case-residence'], [46, 46, 'case-residence'], [58, 43, 'noncase-residence'],
    [66, 48, 'noncase-residence'], [42, 31, 'noncase-residence'], [54, 34, 'noncase-residence'],
    [72, 57, 'noncase-residence'],
  ] as const;

  for (const [x, y, id] of households) {
    elements.push(makeMarkerElement(id, toCanvasPoint(x, y), { size: 34, strokeWidth: 3 }));
  }

  return {
    title: 'Simple village sketch',
    subtitle: 'Case and non-case residences with selected environmental features. Not to scale.',
    elements,
  };
}

function makeBoardingSchoolTemplate() {
  const elements: SketchElement[] = [
    // Ward A — left dormitory
    makeAreaElement('area', toCanvasPoint(5, 20), toCanvasPoint(42, 55), {
      color: '#4B5563',
      fillColor: '#4B5563',
      fillPattern: 'dots',
      legendLabel: 'Ward / dormitory',
    }),
    createElement({ type: 'label', start: toCanvasPoint(15, 24), text: 'Ward A', color: '#111827', size: 22, strokeWidth: 4, fillPattern: 'solid', lineStyle: 'solid', filled: false }),

    // Ward B — right dormitory
    makeAreaElement('area', toCanvasPoint(58, 20), toCanvasPoint(95, 55), {
      color: '#4B5563',
      fillColor: '#4B5563',
      fillPattern: 'dots',
      legendLabel: 'Ward / dormitory',
    }),
    createElement({ type: 'label', start: toCanvasPoint(69, 24), text: 'Ward B', color: '#111827', size: 22, strokeWidth: 4, fillPattern: 'solid', lineStyle: 'solid', filled: false }),

    // Dining hall
    makeAreaElement('area', toCanvasPoint(28, 68), toCanvasPoint(72, 88), {
      color: '#92400E',
      fillColor: '#92400E',
      fillPattern: 'grid',
      legendLabel: 'Dining hall / eating area',
    }),
    createElement({ type: 'label', start: toCanvasPoint(38, 77), text: 'Dining hall', color: '#111827', size: 22, strokeWidth: 4, fillPattern: 'solid', lineStyle: 'solid', filled: false }),

    // Latrine block
    makeAreaElement('area', toCanvasPoint(80, 68), toCanvasPoint(95, 82), {
      color: '#6B7280',
      fillColor: '#6B7280',
      fillPattern: 'crosshatch',
      legendLabel: 'Latrine block',
    }),
    createElement({ type: 'label', start: toCanvasPoint(82, 75), text: 'Latrines', color: '#111827', size: 16, strokeWidth: 4, fillPattern: 'solid', lineStyle: 'solid', filled: false }),

    // Paths between buildings
    makeLineElement('line', toCanvasPoint(42, 38), toCanvasPoint(58, 38), {
      color: '#6B7280',
      strokeWidth: 4,
      lineStyle: 'dashed',
      legendLabel: 'Walkway',
    }),
    makeLineElement('line', toCanvasPoint(24, 55), toCanvasPoint(40, 68), {
      color: '#6B7280',
      strokeWidth: 4,
      lineStyle: 'dashed',
    }),
    makeLineElement('line', toCanvasPoint(76, 55), toCanvasPoint(60, 68), {
      color: '#6B7280',
      strokeWidth: 4,
      lineStyle: 'dashed',
    }),

    // Water source
    makeMarkerElement('water-source', toCanvasPoint(5, 75), { size: 34, strokeWidth: 3 }),
  ];

  // Beds in Ward A — two rows of 5
  const bedMarker: Partial<SketchElement> = { size: 24, strokeWidth: 2 };
  for (let index = 0; index < 5; index += 1) {
    const x = 10 + index * 7;
    elements.push(makeMarkerElement('case-person', toCanvasPoint(x, 35), bedMarker));
    elements.push(makeMarkerElement('noncase-person', toCanvasPoint(x, 46), bedMarker));
  }

  // Beds in Ward B — two rows of 5
  for (let index = 0; index < 5; index += 1) {
    const x = 63 + index * 7;
    elements.push(makeMarkerElement('noncase-person', toCanvasPoint(x, 35), bedMarker));
    elements.push(makeMarkerElement('case-person', toCanvasPoint(x, 46), bedMarker));
  }

  return {
    title: 'Boarding school outbreak sketch',
    subtitle: 'Case and non-case beds by ward, shared dining hall, and sanitation facilities. Not to scale.',
    elements,
  };
}

function makeHospitalTemplate() {
  const elements: SketchElement[] = [
    // Reception / triage
    makeAreaElement('area', toCanvasPoint(35, 8), toCanvasPoint(65, 25), {
      color: '#1F2937',
      fillColor: '#1F2937',
      fillPattern: 'solid',
      legendLabel: 'Reception / triage',
      opacity: 0.15,
    }),
    createElement({ type: 'label', start: toCanvasPoint(38, 17), text: 'Reception / Triage', color: '#111827', size: 20, strokeWidth: 4, fillPattern: 'solid', lineStyle: 'solid', filled: false }),

    // Pediatric ward — left
    makeAreaElement('area', toCanvasPoint(3, 38), toCanvasPoint(32, 72), {
      color: '#2563EB',
      fillColor: '#2563EB',
      fillPattern: 'dots',
      legendLabel: 'Pediatric ward',
    }),
    createElement({ type: 'label', start: toCanvasPoint(6, 44), text: 'Pediatric ward', color: '#111827', size: 20, strokeWidth: 4, fillPattern: 'solid', lineStyle: 'solid', filled: false }),

    // Medical ward — center
    makeAreaElement('area', toCanvasPoint(36, 38), toCanvasPoint(64, 72), {
      color: '#166534',
      fillColor: '#166534',
      fillPattern: 'hatch',
      legendLabel: 'Medical ward',
    }),
    createElement({ type: 'label', start: toCanvasPoint(39, 44), text: 'Medical ward', color: '#111827', size: 20, strokeWidth: 4, fillPattern: 'solid', lineStyle: 'solid', filled: false }),

    // Maternity ward — right
    makeAreaElement('area', toCanvasPoint(68, 38), toCanvasPoint(97, 72), {
      color: '#92400E',
      fillColor: '#92400E',
      fillPattern: 'grid',
      legendLabel: 'Maternity ward',
    }),
    createElement({ type: 'label', start: toCanvasPoint(71, 44), text: 'Maternity ward', color: '#111827', size: 20, strokeWidth: 4, fillPattern: 'solid', lineStyle: 'solid', filled: false }),

    // Corridors connecting wards to reception
    makeLineElement('line', toCanvasPoint(50, 25), toCanvasPoint(18, 38), {
      color: '#6B7280',
      strokeWidth: 5,
      lineStyle: 'dashed',
      legendLabel: 'Corridor',
    }),
    makeLineElement('line', toCanvasPoint(50, 25), toCanvasPoint(50, 38), {
      color: '#6B7280',
      strokeWidth: 5,
      lineStyle: 'dashed',
    }),
    makeLineElement('line', toCanvasPoint(50, 25), toCanvasPoint(82, 38), {
      color: '#6B7280',
      strokeWidth: 5,
      lineStyle: 'dashed',
    }),

    // Water and sanitation
    makeMarkerElement('water-source', toCanvasPoint(15, 82), { size: 34, strokeWidth: 3 }),
    makeMarkerElement('latrine', toCanvasPoint(85, 82), { size: 34, strokeWidth: 3 }),
    makeMarkerElement('waste', toCanvasPoint(50, 85), { size: 34, strokeWidth: 3 }),
  ];

  // Cases and non-cases in pediatric ward
  const bedMarker: Partial<SketchElement> = { size: 22, strokeWidth: 2 };
  for (let index = 0; index < 4; index += 1) {
    elements.push(makeMarkerElement('case-person', toCanvasPoint(8 + index * 7, 55), bedMarker));
    elements.push(makeMarkerElement('noncase-person', toCanvasPoint(8 + index * 7, 65), bedMarker));
  }

  // Cases and non-cases in medical ward
  for (let index = 0; index < 3; index += 1) {
    elements.push(makeMarkerElement('case-person', toCanvasPoint(41 + index * 8, 55), bedMarker));
    elements.push(makeMarkerElement('noncase-person', toCanvasPoint(41 + index * 8, 65), bedMarker));
  }

  // Cases in maternity ward
  for (let index = 0; index < 4; index += 1) {
    elements.push(makeMarkerElement('noncase-person', toCanvasPoint(73 + index * 7, 55), bedMarker));
    elements.push(makeMarkerElement(index < 2 ? 'case-person' : 'noncase-person', toCanvasPoint(73 + index * 7, 65), bedMarker));
  }

  return {
    title: 'Hospital ward sketch',
    subtitle: 'Case and non-case locations across hospital wards with shared facilities. Not to scale.',
    elements,
  };
}
