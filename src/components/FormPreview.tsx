import { useState, useMemo } from 'react';
import type { FormField } from '../types/form';

interface FormPreviewProps {
  fields: FormField[];
  onBack: () => void;
}

export function FormPreview({ fields, onBack }: FormPreviewProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);

  // Evaluate skip logic to determine which fields are visible
  const visibleFields = useMemo(() => {
    return fields.filter((field) => {
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
  }, [fields, formData]);

  const updateField = (fieldId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
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
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <div className="text-green-500 text-5xl mb-4">&#10003;</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Form Submitted
          </h2>
          <p className="text-gray-600 mb-6">
            Your response has been recorded successfully.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              Response Data:
            </h3>
            <pre className="text-xs text-gray-700 overflow-auto">
              {JSON.stringify(formData, null, 2)}
            </pre>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setFormData({});
                setSubmitted(false);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Submit Another
            </button>
            <button
              onClick={onBack}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Back to Editor
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-blue-600">EpiKit</h1>
            <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
              Preview Mode
            </span>
          </div>
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Back to Editor
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto py-8 px-4">
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6">
          {visibleFields.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No fields to display
            </p>
          ) : (
            <div className="space-y-6">
              {visibleFields.map((field) => (
                <div key={field.id}>
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
                    value={formData[field.id]}
                    onChange={(value) => updateField(field.id, value)}
                    onCaptureGPS={() => captureGPS(field.id)}
                  />
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
      </main>
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
              <span>Capture GPS Location</span>
            </button>
          )}
        </div>
      );

    default:
      return null;
  }
}
