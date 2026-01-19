import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FormField } from '../types/form';

interface SortableFieldProps {
  field: FormField;
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

export function SortableField({
  field,
  isSelected,
  onSelect,
  onDelete,
}: SortableFieldProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

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
          <span className="text-sm text-gray-500">
            {fieldTypeLabels[field.type]}
          </span>
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
          <span>📍</span>
          <span>Capture GPS coordinates</span>
        </div>
      );
    default:
      return null;
  }
}
