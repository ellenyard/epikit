import { useDraggable } from '@dnd-kit/core';
import type { FieldType, LayoutElementType, FormItemType } from '../types/form';

interface FieldPaletteItemProps {
  type: FormItemType;
  label: string;
  icon: string;
  isLayout?: boolean;
}

function FieldPaletteItem({ type, label, icon, isLayout }: FieldPaletteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { type, fromPalette: true, isLayout },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg cursor-grab hover:border-blue-400 hover:shadow-sm transition-all ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </div>
  );
}

const fieldTypes: { type: FieldType; label: string; icon: string }[] = [
  { type: 'text', label: 'Text Input', icon: 'Aa' },
  { type: 'number', label: 'Number', icon: '#' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'dropdown', label: 'Dropdown', icon: '▼' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑' },
  { type: 'multiselect', label: 'Multi-Select', icon: '☰' },
  { type: 'gps', label: 'GPS Location', icon: '📍' },
];

const layoutElements: { type: LayoutElementType; label: string; icon: string }[] = [
  { type: 'section', label: 'Section Header', icon: '§' },
  { type: 'instruction', label: 'Instructions', icon: '¶' },
  { type: 'divider', label: 'Divider', icon: '—' },
];

export function FieldPalette() {
  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Field Types
      </h2>
      <div className="space-y-2">
        {fieldTypes.map((field) => (
          <FieldPaletteItem key={field.type} {...field} />
        ))}
      </div>

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 mt-6 pt-4 border-t border-gray-200">
        Layout Elements
      </h2>
      <div className="space-y-2">
        {layoutElements.map((element) => (
          <FieldPaletteItem key={element.type} {...element} isLayout />
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Drag items to the canvas to build your form
        </p>
      </div>
    </div>
  );
}
