import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { FormItem, FieldWidth } from '../types/form';
import { SortableItem } from './SortableField';

interface FormCanvasProps {
  items: FormItem[];
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  onDeleteItem: (id: string) => void;
}

// Convert width to CSS grid column span
const widthToGridClass: Record<FieldWidth, string> = {
  '1/4': 'col-span-3',
  '1/3': 'col-span-4',
  '1/2': 'col-span-6',
  '2/3': 'col-span-8',
  '3/4': 'col-span-9',
  'full': 'col-span-12',
};

export function FormCanvas({
  items,
  selectedItemId,
  onSelectItem,
  onDeleteItem,
}: FormCanvasProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'form-canvas',
  });

  return (
    <div className="flex-1 bg-gray-100 p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div
          ref={setNodeRef}
          className={`min-h-[400px] bg-white rounded-lg shadow-sm border-2 border-dashed transition-colors ${
            isOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
          }`}
        >
          {items.length === 0 ? (
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
                items={items.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="grid grid-cols-12 gap-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={widthToGridClass[item.width || 'full']}
                    >
                      <SortableItem
                        item={item}
                        isSelected={selectedItemId === item.id}
                        onSelect={() => onSelectItem(item.id)}
                        onDelete={() => onDeleteItem(item.id)}
                      />
                    </div>
                  ))}
                </div>
              </SortableContext>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
