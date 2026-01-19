import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { v4 as uuidv4 } from 'uuid';
import type { FormField, FormItem, FieldType, LayoutElementType, LayoutElement } from '../types/form';
import { FieldPalette } from './FieldPalette';
import { FormCanvas } from './FormCanvas';
import { FieldEditor } from './FieldEditor';

const defaultFieldLabels: Record<FieldType, string> = {
  text: 'Text Question',
  number: 'Number Question',
  date: 'Date Question',
  dropdown: 'Select Question',
  checkbox: 'Yes/No Question',
  multiselect: 'Multiple Choice',
  gps: 'GPS Coordinates',
};

const defaultLayoutLabels: Record<LayoutElementType, string> = {
  section: 'Section Title',
  instruction: 'Add instructions or explanatory text here.',
  divider: '',
};

interface FormBuilderProps {
  onPreview: (items: FormItem[]) => void;
  onExport: (items: FormItem[]) => void;
  initialItems?: FormItem[];
}

export function FormBuilder({ onPreview, onExport, initialItems }: FormBuilderProps) {
  const [items, setItems] = useState<FormItem[]>(initialItems || []);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [formName, setFormName] = useState(initialItems ? 'Foodborne Outbreak Investigation' : 'Untitled Form');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const selectedItem = items.find((f) => f.id === selectedItemId);

  const createField = (type: FieldType): FormField => ({
    id: uuidv4(),
    type,
    label: defaultFieldLabels[type],
    required: false,
    width: 'full',
    options:
      type === 'dropdown' || type === 'multiselect'
        ? [
            { label: 'Option 1', value: 'option_1' },
            { label: 'Option 2', value: 'option_2' },
          ]
        : undefined,
  });

  const createLayoutElement = (type: LayoutElementType): LayoutElement => ({
    id: uuidv4(),
    type,
    content: defaultLayoutLabels[type],
    width: 'full',
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeData = active.data.current;

    // Dropping from palette to canvas
    if (activeData?.fromPalette && over.id === 'form-canvas') {
      let newItem: FormItem;
      if (activeData.isLayout) {
        newItem = createLayoutElement(activeData.type as LayoutElementType);
      } else {
        newItem = createField(activeData.type as FieldType);
      }
      setItems([...items, newItem]);
      setSelectedItemId(newItem.id);
      return;
    }

    // Reordering within canvas
    if (!activeData?.fromPalette) {
      const oldIndex = items.findIndex((f) => f.id === active.id);
      const newIndex = items.findIndex((f) => f.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        setItems(arrayMove(items, oldIndex, newIndex));
      }
    }
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter((f) => f.id !== id));
    if (selectedItemId === id) {
      setSelectedItemId(null);
    }
  };

  const handleUpdateItem = (updates: Partial<FormItem>) => {
    if (!selectedItemId) return;
    setItems(
      items.map((f) => (f.id === selectedItemId ? { ...f, ...updates } as FormItem : f))
    );
  };

  // Get the drag overlay label
  const getDragOverlayLabel = (id: string): string => {
    const type = id.replace('palette-', '');
    if (type in defaultFieldLabels) {
      return defaultFieldLabels[type as FieldType];
    }
    if (type in defaultLayoutLabels) {
      return type === 'divider' ? 'Divider' : defaultLayoutLabels[type as LayoutElementType];
    }
    return type;
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col bg-gray-100">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="text-lg font-medium text-gray-900 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
              />
              <span className="text-sm text-gray-500">
                {items.length} item{items.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onPreview(items)}
                disabled={items.length === 0}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Preview
              </button>
              <button
                onClick={() => onExport(items)}
                disabled={items.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Export
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          <FieldPalette />
          <FormCanvas
            items={items}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            onDeleteItem={handleDeleteItem}
          />
          {selectedItem && (
            <FieldEditor
              item={selectedItem}
              allItems={items}
              onUpdate={handleUpdateItem}
            />
          )}
        </div>
      </div>

      <DragOverlay>
        {activeId && activeId.startsWith('palette-') && (
          <div className="p-3 bg-white border-2 border-blue-400 rounded-lg shadow-lg">
            <span className="text-sm font-medium">
              {getDragOverlayLabel(activeId)}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
