import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { FormField } from '../types/form';
import { SortableField } from './SortableField';

interface FormCanvasProps {
  fields: FormField[];
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onDeleteField: (id: string) => void;
}

export function FormCanvas({
  fields,
  selectedFieldId,
  onSelectField,
  onDeleteField,
}: FormCanvasProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'form-canvas',
  });

  return (
    <div className="flex-1 bg-gray-100 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <div
          ref={setNodeRef}
          className={`min-h-[400px] bg-white rounded-lg shadow-sm border-2 border-dashed transition-colors ${
            isOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
          }`}
        >
          {fields.length === 0 ? (
            <div className="flex items-center justify-center h-[400px] text-gray-400">
              <div className="text-center">
                <p className="text-lg">Drop fields here to build your form</p>
                <p className="text-sm mt-2">
                  Drag field types from the left panel
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <SortableContext
                items={fields.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                {fields.map((field) => (
                  <SortableField
                    key={field.id}
                    field={field}
                    isSelected={selectedFieldId === field.id}
                    onSelect={() => onSelectField(field.id)}
                    onDelete={() => onDeleteField(field.id)}
                  />
                ))}
              </SortableContext>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
