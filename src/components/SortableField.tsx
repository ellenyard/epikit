import { useSortable } from '@dnd-kit/sortable';
import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { FormItem, FormField, LayoutElement } from '../types/form';
import { isLayoutElement } from '../types/form';

interface SortableItemProps {
  item: FormItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const fieldTypeLabels: Record<string, string> = {
  text: 'Text Input',
  number: 'Number',
  date: 'Date',
  dropdown: 'Dropdown',
  checkbox: 'Checkbox',
  multiselect: 'Multi-Select',
  gps: 'GPS Location',
};

const widthLabels: Record<string, string> = {
  '1/4': '25%',
  '1/3': '33%',
  '1/2': '50%',
  '2/3': '67%',
  '3/4': '75%',
  'full': '100%',
};

export function SortableItem({
  item,
  isSelected,
  onSelect,
  onDelete,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Render layout elements differently
  if (isLayoutElement(item)) {
    return (
      <LayoutElementCard
        element={item}
        isSelected={isSelected}
        isDragging={isDragging}
        style={style}
        setNodeRef={setNodeRef}
        attributes={attributes}
        listeners={listeners}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );
  }

  // Render form fields
  return (
    <FormFieldCard
      field={item as FormField}
      isSelected={isSelected}
      isDragging={isDragging}
      style={style}
      setNodeRef={setNodeRef}
      attributes={attributes}
      listeners={listeners}
      onSelect={onSelect}
      onDelete={onDelete}
    />
  );
}

// Layout Element Card
function LayoutElementCard({
  element,
  isSelected,
  isDragging,
  style,
  setNodeRef,
  attributes,
  listeners,
  onSelect,
  onDelete,
}: {
  element: LayoutElement;
  isSelected: boolean;
  isDragging: boolean;
  style: React.CSSProperties;
  setNodeRef: (node: HTMLElement | null) => void;
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: DraggableSyntheticListeners;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const renderContent = () => {
    switch (element.type) {
      case 'section':
        return (
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-gray-800">{element.content || 'Section Title'}</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Section</span>
          </div>
        );
      case 'instruction':
        return (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Instructions</span>
            </div>
            <p className="text-sm text-gray-600 italic">{element.content || 'Instructions text'}</p>
          </div>
        );
      case 'divider':
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 border-t-2 border-gray-300" />
            <span className="text-xs text-gray-400">Divider</span>
            <div className="flex-1 border-t-2 border-gray-300" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative p-3 mb-3 rounded-lg border-2 transition-all cursor-pointer ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      } ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-gray-50 hover:border-gray-300'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab text-gray-400 hover:text-gray-600"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8h16M4 16h16"
            />
          </svg>
        </div>

        <div className="flex-1">
          {renderContent()}
        </div>

        <div className="flex items-center gap-2">
          {element.width && element.width !== 'full' && (
            <span className="text-xs text-gray-400">{widthLabels[element.width]}</span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Form Field Card
function FormFieldCard({
  field,
  isSelected,
  isDragging,
  style,
  setNodeRef,
  attributes,
  listeners,
  onSelect,
  onDelete,
}: {
  field: FormField;
  isSelected: boolean;
  isDragging: boolean;
  style: React.CSSProperties;
  setNodeRef: (node: HTMLElement | null) => void;
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: DraggableSyntheticListeners;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative p-4 mb-3 rounded-lg border-2 transition-all cursor-pointer ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      } ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab text-gray-400 hover:text-gray-600"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8h16M4 16h16"
            />
          </svg>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900">{field.label}</span>
            {field.required && (
              <span className="text-red-500 text-sm">*</span>
            )}
            {field.skipLogic && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                Has skip logic
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {fieldTypeLabels[field.type]}
            </span>
            {field.width && field.width !== 'full' && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {widthLabels[field.width]}
              </span>
            )}
          </div>
          {field.helpText && (
            <p className="text-xs text-gray-400 mt-1">{field.helpText}</p>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* Preview of the field */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <FieldPreview field={field} />
      </div>
    </div>
  );
}

function FieldPreview({ field }: { field: FormField }) {
  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          placeholder={field.placeholder || 'Enter text...'}
          className="w-full px-3 py-2 border border-gray-200 rounded text-sm bg-gray-50"
          disabled
        />
      );
    case 'number':
      return (
        <input
          type="number"
          placeholder={field.placeholder || 'Enter number...'}
          className="w-full px-3 py-2 border border-gray-200 rounded text-sm bg-gray-50"
          disabled
        />
      );
    case 'date':
      return (
        <input
          type="date"
          className="w-full px-3 py-2 border border-gray-200 rounded text-sm bg-gray-50"
          disabled
        />
      );
    case 'dropdown':
      return (
        <select
          className="w-full px-3 py-2 border border-gray-200 rounded text-sm bg-gray-50"
          disabled
        >
          <option>Select an option...</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <input type="checkbox" disabled className="rounded" />
          <span className="text-sm text-gray-500">Yes/No</span>
        </div>
      );
    case 'multiselect':
      return (
        <div className="space-y-1">
          {(field.options || [{ label: 'Option 1', value: '1' }]).slice(0, 3).map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <input type="checkbox" disabled className="rounded" />
              <span className="text-sm text-gray-500">{opt.label}</span>
            </div>
          ))}
        </div>
      );
    case 'gps':
      return (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>GPS coordinates will be captured</span>
        </div>
      );
    default:
      return null;
  }
}

// Re-export for backwards compatibility
export { SortableItem as SortableField };
