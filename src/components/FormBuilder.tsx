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

  // Mobile panel state
  const [showPalette, setShowPalette] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  // Close editor when item is deselected
  const handleSelectItem = (id: string | null) => {
    setSelectedItemId(id);
    if (id) setShowEditor(true);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col bg-gray-100">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="text-base sm:text-lg font-medium text-gray-900 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 min-w-0 w-full sm:w-auto"
              />
              <span className="text-sm text-gray-500 hidden sm:inline">
                {items.length} item{items.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={() => onPreview(items)}
                disabled={items.length === 0}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Preview
              </button>
              <button
                onClick={() => onExport(items)}
                disabled={items.length === 0}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed hidden sm:block"
              >
                Export
              </button>
            </div>
          </div>
        </header>

        {/* Mobile toolbar */}
        <div className="lg:hidden flex items-center gap-2 p-2 bg-white border-b border-gray-200">
          <button
            onClick={() => setShowPalette(true)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Field
          </button>
          {selectedItem && (
            <button
              onClick={() => setShowEditor(true)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Field
            </button>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Desktop Palette */}
          <div className="hidden lg:block">
            <FieldPalette />
          </div>

          {/* Mobile Palette Overlay */}
          {showPalette && (
            <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setShowPalette(false)}>
              <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                  <h2 className="font-semibold text-gray-900">Add Fields</h2>
                  <button onClick={() => setShowPalette(false)} className="p-1 text-gray-400 hover:text-gray-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <FieldPalette />
              </div>
            </div>
          )}

          <FormCanvas
            items={items}
            selectedItemId={selectedItemId}
            onSelectItem={handleSelectItem}
            onDeleteItem={handleDeleteItem}
          />

          {/* Desktop Editor */}
          {selectedItem && (
            <div className="hidden lg:block">
              <FieldEditor
                item={selectedItem}
                allItems={items}
                onUpdate={handleUpdateItem}
              />
            </div>
          )}

          {/* Mobile Editor Overlay */}
          {showEditor && selectedItem && (
            <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setShowEditor(false)}>
              <div className="absolute right-0 top-0 bottom-0 w-80 max-w-full bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                  <h2 className="font-semibold text-gray-900">Edit Field</h2>
                  <button onClick={() => setShowEditor(false)} className="p-1 text-gray-400 hover:text-gray-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <FieldEditor
                  item={selectedItem}
                  allItems={items}
                  onUpdate={handleUpdateItem}
                />
              </div>
            </div>
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
