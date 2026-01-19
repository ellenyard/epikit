import { useState, useMemo } from 'react';
import type { FormDefinition, FormField, LayoutElement, FieldWidth } from '../../types/form';
import { isLayoutElement } from '../../types/form';

interface DataEntryFormProps {
  form: FormDefinition;
  onSubmit: (data: Record<string, unknown>) => void;
  onViewInAnalysis: () => void;
  submissionCount: number;
}

// Convert width to CSS grid column span classes
const widthToGridClass: Record<FieldWidth, string> = {
  '1/4': 'col-span-12 sm:col-span-3',
  '1/3': 'col-span-12 sm:col-span-4',
  '1/2': 'col-span-12 sm:col-span-6',
  '2/3': 'col-span-12 sm:col-span-8',
  '3/4': 'col-span-12 sm:col-span-9',
  'full': 'col-span-12',
};

export function DataEntryForm({ form, onSubmit, onViewInAnalysis, submissionCount }: DataEntryFormProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);

  // Evaluate skip logic to determine which items are visible
  const visibleItems = useMemo(() => {
    return form.fields.filter((item) => {
      if (isLayoutElement(item)) return true;

      const field = item as FormField;
      if (!field.skipLogic) return true;

      const { action, conditions, logic } = field.skipLogic;

      const results = conditions.map((condition) => {
        const fieldValue = formData[condition.fieldId];

        switch (condition.operator) {
          case 'equals':
            return String(fieldValue) === String(condition.value);
          case 'not_equals':
            return String(fieldValue) !== String(condition.value);
          case 'greater_than':
            return Number(fieldValue) > Number(condition.value);
          case 'less_than':
            return Number(fieldValue) < Number(condition.value);
          case 'contains':
            return String(fieldValue || '').includes(String(condition.value));
          case 'is_empty':
            return !fieldValue || fieldValue === '';
          case 'is_not_empty':
            return fieldValue && fieldValue !== '';
          default:
            return true;
        }
      });

      const conditionMet =
        logic === 'and' ? results.every(Boolean) : results.some(Boolean);

      return action === 'show' ? conditionMet : !conditionMet;
    });
  }, [form.fields, formData]);

  const updateField = (fieldId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setSubmitted(true);
  };

  const handleSubmitAnother = () => {
    setFormData({});
    setSubmitted(false);
  };

  const captureGPS = async (fieldId: string) => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateField(fieldId, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => {
          console.error('GPS error:', error);
          alert('Unable to capture GPS location');
        }
      );
    } else {
      alert('Geolocation is not supported by this browser');
    }
  };

  if (submitted) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Submission Saved
          </h2>
          <p className="text-gray-600 mb-2">
            Your response has been recorded successfully.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Total submissions: {submissionCount + 1}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleSubmitAnother}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Submit Another
            </button>
            <button
              onClick={onViewInAnalysis}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              View in Analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Form Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">{form.name}</h1>
          {form.description && (
            <p className="text-sm text-gray-500 mt-1">{form.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            {submissionCount} previous submission{submissionCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Form Content */}
      <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6">
          {visibleItems.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No fields to display
            </p>
          ) : (
            <div className="grid grid-cols-12 gap-4">
              {visibleItems.map((item) => (
                <div
                  key={item.id}
                  className={widthToGridClass[item.width || 'full']}
                >
                  {isLayoutElement(item) ? (
                    <LayoutElementPreview element={item as LayoutElement} />
                  ) : (
                    <FormFieldInput
                      field={item as FormField}
                      value={formData[(item as FormField).id]}
                      onChange={(value) => updateField((item as FormField).id, value)}
                      onCaptureGPS={() => captureGPS((item as FormField).id)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-200">
            <button
              type="submit"
              className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Submit Response
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Layout Element Preview
function LayoutElementPreview({ element }: { element: LayoutElement }) {
  switch (element.type) {
    case 'section':
      return (
        <div className="pt-4 pb-2">
          <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
            {element.content || 'Section Title'}
          </h2>
        </div>
      );
    case 'instruction':
      return (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r">
          <p className="text-sm text-blue-800">
            {element.content || 'Instructions text'}
          </p>
        </div>
      );
    case 'divider':
      return <hr className="border-gray-300 my-4" />;
    default:
      return null;
  }
}

// Form Field Input
interface FormFieldInputProps {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  onCaptureGPS: () => void;
}

function FormFieldInput({ field, value, onChange, onCaptureGPS }: FormFieldInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900 mb-1">
        {field.label}
        {field.required && (
          <span className="text-red-500 ml-1">*</span>
        )}
      </label>
      {field.helpText && (
        <p className="text-sm text-gray-500 mb-2">
          {field.helpText}
        </p>
      )}
      <FieldInput
        field={field}
        value={value}
        onChange={onChange}
        onCaptureGPS={onCaptureGPS}
      />
    </div>
  );
}

interface FieldInputProps {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  onCaptureGPS: () => void;
}

function FieldInput({ field, value, onChange, onCaptureGPS }: FieldInputProps) {
  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          value={String(value || '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={value !== undefined ? String(value) : ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
          placeholder={field.placeholder}
          required={field.required}
          min={field.validation?.min}
          max={field.validation?.max}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={String(value || '')}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      );

    case 'dropdown':
      return (
        <select
          value={String(value || '')}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select an option...</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case 'checkbox':
      return (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-gray-700">Yes</span>
        </div>
      );

    case 'multiselect':
      const selectedValues = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-2">
          {field.options?.map((opt) => (
            <div key={opt.value} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedValues.includes(opt.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...selectedValues, opt.value]);
                  } else {
                    onChange(selectedValues.filter((v) => v !== opt.value));
                  }
                }}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700">{opt.label}</span>
            </div>
          ))}
        </div>
      );

    case 'gps':
      const gpsValue = value as { latitude: number; longitude: number; accuracy: number } | undefined;
      return (
        <div>
          {gpsValue ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">
                <strong>Latitude:</strong> {gpsValue.latitude.toFixed(6)}
              </p>
              <p className="text-sm text-green-800">
                <strong>Longitude:</strong> {gpsValue.longitude.toFixed(6)}
              </p>
              <p className="text-sm text-green-800">
                <strong>Accuracy:</strong> {gpsValue.accuracy.toFixed(1)}m
              </p>
              <button
                type="button"
                onClick={onCaptureGPS}
                className="mt-2 text-sm text-green-600 hover:text-green-700"
              >
                Recapture
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onCaptureGPS}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Capture GPS Location</span>
            </button>
          )}
        </div>
      );

    default:
      return null;
  }
}
