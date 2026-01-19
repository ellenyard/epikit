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
import type { FormField, FieldType } from '../types/form';
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

interface FormBuilderProps {
  onPreview: (fields: FormField[]) => void;
  onExport: (fields: FormField[]) => void;
}

export function FormBuilder({ onPreview, onExport }: FormBuilderProps) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [formName, setFormName] = useState('Untitled Form');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const selectedField = fields.find((f) => f.id === selectedFieldId);

  const createField = (type: FieldType): FormField => ({
    id: uuidv4(),
    type,
    label: defaultFieldLabels[type],
    required: false,
    options:
      type === 'dropdown' || type === 'multiselect'
        ? [
            { label: 'Option 1', value: 'option_1' },
            { label: 'Option 2', value: 'option_2' },
          ]
        : undefined,
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
      const newField = createField(activeData.type as FieldType);
      setFields([...fields, newField]);
      setSelectedFieldId(newField.id);
      return;
    }

    // Reordering within canvas
    if (!activeData?.fromPalette) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        setFields(arrayMove(fields, oldIndex, newIndex));
      }
    }
  };

  const handleDeleteField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id));
    if (selectedFieldId === id) {
      setSelectedFieldId(null);
    }
  };

  const handleUpdateField = (updates: Partial<FormField>) => {
    if (!selectedFieldId) return;
    setFields(
      fields.map((f) => (f.id === selectedFieldId ? { ...f, ...updates } : f))
    );
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
                {fields.length} field{fields.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onPreview(fields)}
                disabled={fields.length === 0}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Preview
              </button>
              <button
                onClick={() => onExport(fields)}
                disabled={fields.length === 0}
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
            fields={fields}
            selectedFieldId={selectedFieldId}
            onSelectField={setSelectedFieldId}
            onDeleteField={handleDeleteField}
          />
          {selectedField && (
            <FieldEditor
              field={selectedField}
              allFields={fields}
              onUpdate={handleUpdateField}
            />
          )}
        </div>
      </div>

      <DragOverlay>
        {activeId && activeId.startsWith('palette-') && (
          <div className="p-3 bg-white border-2 border-blue-400 rounded-lg shadow-lg">
            <span className="text-sm font-medium">
              {defaultFieldLabels[activeId.replace('palette-', '') as FieldType]}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
