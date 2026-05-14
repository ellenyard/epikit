import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import html2canvas from 'html2canvas';
import { ExportIcons, ResultsActions, TabHeader } from '../shared';

type SketchTool = 'pen' | 'line' | 'area' | 'room' | 'house' | 'bed' | 'exposure' | 'label';
type SketchBackground = 'grid' | 'blank';

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
  strokeWidth: number;
}

const canvasWidth = 1200;
const canvasHeight = 800;

const tools: Array<{ id: SketchTool; label: string }> = [
  { id: 'pen', label: 'Pen' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
  { id: 'room', label: 'Room' },
  { id: 'house', label: 'House' },
  { id: 'bed', label: 'Bed' },
  { id: 'exposure', label: 'Exposure' },
  { id: 'label', label: 'Label' },
];

export function SketchMap() {
  const svgRef = useRef<SVGSVGElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [elements, setElements] = useState<SketchElement[]>([]);
  const [draft, setDraft] = useState<SketchElement | null>(null);
  const [tool, setTool] = useState<SketchTool>('pen');
  const [color, setColor] = useState('#1F2937');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [background, setBackground] = useState<SketchBackground>('grid');
  const [labelText, setLabelText] = useState('Label');
  const [isDrawing, setIsDrawing] = useState(false);
  const [exportStatus, setExportStatus] = useState('');

  const getPoint = (event: PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvasWidth,
      y: ((event.clientY - rect.top) / rect.height) * canvasHeight,
    };
  };

  const startDrawing = (event: PointerEvent<SVGSVGElement>) => {
    const point = getPoint(event);
    const base = {
      id: crypto.randomUUID(),
      type: tool,
      color,
      strokeWidth,
    };

    if (tool === 'house' || tool === 'bed' || tool === 'exposure' || tool === 'label') {
      setElements(previous => [...previous, {
        ...base,
        start: point,
        text: tool === 'label' ? labelText || 'Label' : undefined,
      }]);
      return;
    }

    setIsDrawing(true);
    setDraft({
      ...base,
      start: point,
      end: point,
      points: tool === 'pen' ? [point] : undefined,
    });
  };

  const continueDrawing = (event: PointerEvent<SVGSVGElement>) => {
    if (!isDrawing || !draft) return;
    const point = getPoint(event);

    setDraft(previous => {
      if (!previous) return previous;
      if (previous.type === 'pen') {
        return { ...previous, points: [...(previous.points ?? []), point] };
      }
      return { ...previous, end: point };
    });
  };

  const finishDrawing = () => {
    if (draft) {
      setElements(previous => [...previous, draft]);
    }
    setDraft(null);
    setIsDrawing(false);
  };

  const undo = () => {
    setElements(previous => previous.slice(0, -1));
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
  };

  return (
    <div className="h-full flex flex-col lg:flex-row bg-white">
      <div className="w-full lg:w-72 flex-shrink-0 bg-gray-50 border-b lg:border-b-0 border-gray-200 p-4 overflow-y-auto max-h-[45vh] lg:max-h-none">
        <TabHeader
          title="Sketch Map"
          description="Draw field sketches for houses, rooms, beds, exposures, and local layouts."
        />

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tool</label>
            <div className="grid grid-cols-2 gap-2">
              {tools.map(item => (
                <button
                  key={item.id}
                  onClick={() => setTool(item.id)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border ${
                    tool === item.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="w-full h-10 p-1 border border-gray-300 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Line ({strokeWidth})</label>
              <input
                type="range"
                min="2"
                max="12"
                value={strokeWidth}
                onChange={(event) => setStrokeWidth(Number(event.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {tool === 'label' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Label Text</label>
              <input
                type="text"
                value={labelText}
                onChange={(event) => setLabelText(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Background</label>
            <select
              value={background}
              onChange={(event) => setBackground(event.target.value as SketchBackground)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="grid">Light grid</option>
              <option value="blank">Blank</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={undo}
              disabled={elements.length === 0}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Undo
            </button>
            <button
              onClick={() => setElements([])}
              disabled={elements.length === 0}
              className="flex-1 px-3 py-2 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              Clear
            </button>
          </div>

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
            <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2 text-xs">
              {exportStatus}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-gray-100 p-4 overflow-auto">
        <div ref={exportRef} className="mx-auto bg-white shadow-sm" style={{ maxWidth: 1200 }}>
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
            <defs>
              <pattern id="sketch-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E5E7EB" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={canvasWidth} height={canvasHeight} fill={background === 'grid' ? 'url(#sketch-grid)' : '#FFFFFF'} />
            {[...elements, ...(draft ? [draft] : [])].map(renderElement)}
          </svg>
        </div>
      </div>
    </div>
  );
}

function renderElement(element: SketchElement) {
  const key = element.id;
  const start = element.start ?? { x: 0, y: 0 };
  const end = element.end ?? start;

  if (element.type === 'pen') {
    const d = (element.points ?? [])
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
    return (
      <path
        key={key}
        d={d}
        fill="none"
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (element.type === 'line') {
    return (
      <line
        key={key}
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        strokeLinecap="round"
      />
    );
  }

  if (element.type === 'area' || element.type === 'room') {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    return (
      <rect
        key={key}
        x={x}
        y={y}
        width={width}
        height={height}
        fill={element.type === 'area' ? `${element.color}22` : 'none'}
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        strokeDasharray={element.type === 'room' ? '12 8' : undefined}
        rx={element.type === 'area' ? 10 : 0}
      />
    );
  }

  if (element.type === 'house') {
    return (
      <g key={key} stroke={element.color} strokeWidth={element.strokeWidth} fill="#FFFFFF" strokeLinejoin="round">
        <path d={`M ${start.x - 32} ${start.y} L ${start.x} ${start.y - 30} L ${start.x + 32} ${start.y} Z`} />
        <rect x={start.x - 24} y={start.y} width="48" height="38" />
        <rect x={start.x - 7} y={start.y + 14} width="14" height="24" fill={`${element.color}22`} />
      </g>
    );
  }

  if (element.type === 'bed') {
    return (
      <g key={key} stroke={element.color} strokeWidth={element.strokeWidth} fill="#FFFFFF" strokeLinejoin="round">
        <rect x={start.x - 36} y={start.y - 18} width="72" height="38" rx="4" />
        <rect x={start.x - 30} y={start.y - 12} width="22" height="20" rx="3" fill={`${element.color}22`} />
        <line x1={start.x - 36} y1={start.y + 24} x2={start.x - 36} y2={start.y + 34} />
        <line x1={start.x + 36} y1={start.y + 24} x2={start.x + 36} y2={start.y + 34} />
      </g>
    );
  }

  if (element.type === 'exposure') {
    return (
      <g key={key} stroke={element.color} strokeWidth={element.strokeWidth} fill={`${element.color}22`} strokeLinecap="round">
        <circle cx={start.x} cy={start.y} r="24" />
        <line x1={start.x - 34} y1={start.y} x2={start.x + 34} y2={start.y} />
        <line x1={start.x} y1={start.y - 34} x2={start.x} y2={start.y + 34} />
      </g>
    );
  }

  return (
    <text
      key={key}
      x={start.x}
      y={start.y}
      fill={element.color}
      fontSize="30"
      fontWeight="600"
      paintOrder="stroke"
      stroke="#FFFFFF"
      strokeWidth="6"
      strokeLinejoin="round"
    >
      {element.text}
    </text>
  );
}
