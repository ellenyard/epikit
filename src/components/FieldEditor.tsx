import type { FormItem, FormField, LayoutElement, FieldOption, SkipLogic, FieldWidth } from '../types/form';
import { isFormField, isLayoutElement } from '../types/form';

/**
 * Convert a label to a valid form field variable name.
 * Removes special characters entirely (rather than converting to underscores)
 * to produce cleaner field names for form data collection.
 * e.g., "Patient's Name" -> "patients_name"
 */
function toVariableName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'field';
}

interface FieldEditorProps {
  item: FormItem;
  allItems: FormItem[];
  onUpdate: (updates: Partial<FormItem>) => void;
}

const widthOptions: { value: FieldWidth; label: string }[] = [
  { value: 'full', label: 'Full width (100%)' },
  { value: '3/4', label: '3/4 width (75%)' },
  { value: '2/3', label: '2/3 width (67%)' },
  { value: '1/2', label: 'Half width (50%)' },
  { value: '1/3', label: '1/3 width (33%)' },
  { value: '1/4', label: '1/4 width (25%)' },
];

export function FieldEditor({ item, allItems, onUpdate }: FieldEditorProps) {
  if (isLayoutElement(item)) {
    return <LayoutElementEditor element={item} onUpdate={onUpdate} />;
  }

  return (
    <FormFieldEditor
      field={item as FormField}
      allItems={allItems}
      onUpdate={onUpdate as (updates: Partial<FormField>) => void}
    />
  );
}

// Editor for layout elements (section, instruction, divider)
function LayoutElementEditor({
  element,
  onUpdate,
}: {
  element: LayoutElement;
  onUpdate: (updates: Partial<LayoutElement>) => void;
}) {
  return (
    <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        {element.type === 'section' && 'Section Header'}
        {element.type === 'instruction' && 'Instructions'}
        {element.type === 'divider' && 'Divider'}
      </h2>

      <div className="space-y-4">
        {/* Content (not for divider) */}
        {element.type !== 'divider' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {element.type === 'section' ? 'Section Title' : 'Instructions Text'}
            </label>
            {element.type === 'section' ? (
              <input
                type="text"
                value={element.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter section title..."
              />
            ) : (
              <textarea
                value={element.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter instructions or explanatory text..."
              />
            )}
          </div>
        )}

        {/* Width */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Width
          </label>
          <select
            value={element.width || 'full'}
            onChange={(e) => onUpdate({ width: e.target.value as FieldWidth })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            {widthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Use smaller widths to place items side-by-side
          </p>
        </div>
      </div>
    </div>
  );
}

// Editor for form fields
function FormFieldEditor({
  field,
  allItems,
  onUpdate,
}: {
  field: FormField;
  allItems: FormItem[];
  onUpdate: (updates: Partial<FormField>) => void;
}) {
  // Get other form fields (not layout elements) for skip logic
  const otherFields = allItems.filter(
    (item) => item.id !== field.id && isFormField(item)
  ) as FormField[];

  const addOption = () => {
    const newOption: FieldOption = {
      label: `Option ${(field.options?.length || 0) + 1}`,
      value: `option_${(field.options?.length || 0) + 1}`,
    };
    onUpdate({ options: [...(field.options || []), newOption] });
  };

  const updateOption = (index: number, updates: Partial<FieldOption>) => {
    const newOptions = [...(field.options || [])];
    newOptions[index] = { ...newOptions[index], ...updates };
    onUpdate({ options: newOptions });
  };

  const removeOption = (index: number) => {
    const newOptions = (field.options || []).filter((_, i) => i !== index);
    onUpdate({ options: newOptions });
  };

  const toggleSkipLogic = () => {
    if (field.skipLogic) {
      onUpdate({ skipLogic: undefined });
    } else {
      const defaultSkipLogic: SkipLogic = {
        action: 'show',
        logic: 'and',
        conditions: [
          {
            fieldId: otherFields[0]?.id || '',
            operator: 'equals',
            value: '',
          },
        ],
      };
      onUpdate({ skipLogic: defaultSkipLogic });
    }
  };

  const updateSkipLogic = (updates: Partial<SkipLogic>) => {
    if (field.skipLogic) {
      onUpdate({ skipLogic: { ...field.skipLogic, ...updates } });
    }
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Field Properties
      </h2>

      <div className="space-y-4">
        {/* Label */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Label
          </label>
          <input
            type="text"
            value={field.label}
            onChange={(e) => {
              const updates: Partial<FormField> = { label: e.target.value };
              // Auto-generate variable name if it hasn't been manually edited
              if (!field.variableName || field.variableName === toVariableName(field.label)) {
                updates.variableName = toVariableName(e.target.value);
              }
              onUpdate(updates);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Variable Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Variable Name
          </label>
          <input
            type="text"
            value={field.variableName || ''}
            onChange={(e) => onUpdate({ variableName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            placeholder="e.g., case_id"
          />
          <p className="text-xs text-gray-500 mt-1">
            Used as column name in data export
          </p>
        </div>

        {/* Width */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Width
          </label>
          <select
            value={field.width || 'full'}
            onChange={(e) => onUpdate({ width: e.target.value as FieldWidth })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            {widthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Use smaller widths to place fields side-by-side
          </p>
        </div>

        {/* Required */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="required"
            checked={field.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="required" className="text-sm text-gray-700">
            Required field
          </label>
        </div>

        {/* Placeholder (for text/number) */}
        {['text', 'number'].includes(field.type) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Placeholder
            </label>
            <input
              type="text"
              value={field.placeholder || ''}
              onChange={(e) => onUpdate({ placeholder: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* Help Text */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Help Text
          </label>
          <textarea
            value={field.helpText || ''}
            onChange={(e) => onUpdate({ helpText: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            placeholder="Optional instructions for respondents"
          />
        </div>

        {/* Number Validation */}
        {field.type === 'number' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Validation
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Min</label>
                <input
                  type="number"
                  value={field.validation?.min ?? ''}
                  onChange={(e) =>
                    onUpdate({
                      validation: {
                        ...field.validation,
                        min: e.target.value ? Number(e.target.value) : undefined,
                      },
                    })
                  }
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Max</label>
                <input
                  type="number"
                  value={field.validation?.max ?? ''}
                  onChange={(e) =>
                    onUpdate({
                      validation: {
                        ...field.validation,
                        max: e.target.value ? Number(e.target.value) : undefined,
                      },
                    })
                  }
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Options (for dropdown/multiselect) */}
        {['dropdown', 'multiselect'].includes(field.type) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Options
            </label>
            <div className="space-y-2">
              {(field.options || []).map((option, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={option.label}
                    onChange={(e) =>
                      updateOption(index, {
                        label: e.target.value,
                        value: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                      })
                    }
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    placeholder="Option label"
                  />
                  <button
                    onClick={() => removeOption(index)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                onClick={addOption}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + Add option
              </button>
            </div>
          </div>
        )}

        {/* Skip Logic */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              Skip Logic
            </label>
            <button
              onClick={toggleSkipLogic}
              className={`text-sm ${
                field.skipLogic ? 'text-red-600' : 'text-blue-600'
              }`}
            >
              {field.skipLogic ? 'Remove' : '+ Add'}
            </button>
          </div>

          {field.skipLogic && otherFields.length > 0 && (
            <div className="bg-purple-50 p-3 rounded-lg space-y-3">
              <div className="flex gap-2 items-center text-sm">
                <select
                  value={field.skipLogic.action}
                  onChange={(e) =>
                    updateSkipLogic({ action: e.target.value as 'show' | 'hide' })
                  }
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="show">Show</option>
                  <option value="hide">Hide</option>
                </select>
                <span className="text-gray-600">this field when</span>
              </div>

              {field.skipLogic.conditions.map((condition, index) => (
                <div key={index} className="space-y-2">
                  {index > 0 && (
                    <select
                      value={field.skipLogic!.logic}
                      onChange={(e) =>
                        updateSkipLogic({ logic: e.target.value as 'and' | 'or' })
                      }
                      className="px-2 py-1 border border-gray-300 rounded text-xs"
                    >
                      <option value="and">AND</option>
                      <option value="or">OR</option>
                    </select>
                  )}
                  <select
                    value={condition.fieldId}
                    onChange={(e) => {
                      const newConditions = [...field.skipLogic!.conditions];
                      newConditions[index] = {
                        ...newConditions[index],
                        fieldId: e.target.value,
                      };
                      updateSkipLogic({ conditions: newConditions });
                    }}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="">Select field...</option>
                    {otherFields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={condition.operator}
                    onChange={(e) => {
                      const newConditions = [...field.skipLogic!.conditions];
                      newConditions[index] = {
                        ...newConditions[index],
                        operator: e.target.value as typeof condition.operator,
                      };
                      updateSkipLogic({ conditions: newConditions });
                    }}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="equals">equals</option>
                    <option value="not_equals">does not equal</option>
                    <option value="greater_than">is greater than</option>
                    <option value="less_than">is less than</option>
                    <option value="contains">contains</option>
                    <option value="is_empty">is empty</option>
                    <option value="is_not_empty">is not empty</option>
                  </select>
                  {!['is_empty', 'is_not_empty'].includes(condition.operator) && (
                    <input
                      type="text"
                      value={String(condition.value)}
                      onChange={(e) => {
                        const newConditions = [...field.skipLogic!.conditions];
                        newConditions[index] = {
                          ...newConditions[index],
                          value: e.target.value,
                        };
                        updateSkipLogic({ conditions: newConditions });
                      }}
                      placeholder="Value"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  )}
                </div>
              ))}

              <button
                onClick={() => {
                  const newCondition = {
                    fieldId: otherFields[0]?.id || '',
                    operator: 'equals' as const,
                    value: '',
                  };
                  updateSkipLogic({
                    conditions: [...field.skipLogic!.conditions, newCondition],
                  });
                }}
                className="text-xs text-purple-600 hover:text-purple-700"
              >
                + Add condition
              </button>
            </div>
          )}

          {field.skipLogic && otherFields.length === 0 && (
            <p className="text-xs text-gray-500">
              Add more fields to create skip logic conditions
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
