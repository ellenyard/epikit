import { useState, useEffect, useMemo, useCallback } from 'react';
import type { DataColumn, VariableConfig, CategoryRule, CaseRecord } from '../../types/analysis';
import { toVariableName, validateVariableConfig, generateVariableValues } from '../../utils/variableCreation';
import { useLocale } from '../../contexts/LocaleContext';

interface CreateVariableModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingColumns: DataColumn[];
  records: CaseRecord[];
  onCreateVariable: (config: VariableConfig, values: unknown[]) => void;
}

export function CreateVariableModal({
  isOpen,
  onClose,
  existingColumns,
  records,
  onCreateVariable,
}: CreateVariableModalProps) {
  const { config: localeConfig } = useLocale();
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<DataColumn['type']>('categorical');
  const [method, setMethod] = useState<VariableConfig['method']>('categorize');
  const [sourceColumn, setSourceColumn] = useState('');
  const [categories, setCategories] = useState<CategoryRule[]>([]);
  const [formula, setFormula] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [showTemplates, setShowTemplates] = useState(true);

  const getDefaultSourceColumn = useCallback((nextMethod: VariableConfig['method']) => {
    if (nextMethod !== 'categorize') return '';
    return existingColumns.find(col => col.type === 'number')?.key || '';
  }, [existingColumns]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      /* eslint-disable react-hooks/set-state-in-effect -- Opening the modal resets the transient form state. */
      setLabel('');
      setName('');
      setType('categorical');
      setMethod('categorize');
      setSourceColumn(getDefaultSourceColumn('categorize'));
      setCategories([]);
      setFormula('');
      setError(null);
      setNameManuallyEdited(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [isOpen, getDefaultSourceColumn]);

  // Get source column type
  const sourceColumnType = useMemo(() => {
    return existingColumns.find(col => col.key === sourceColumn)?.type;
  }, [existingColumns, sourceColumn]);

  // Generate preview values
  const previewValues = useMemo(() => {
    if (!sourceColumn && method !== 'blank' && method !== 'formula') {
      return [];
    }

    const config: VariableConfig = {
      name,
      label,
      type,
      method,
      sourceColumn,
      categories: categories.length > 0 ? categories : undefined,
      formula: formula || undefined,
    };

    try {
      const values = generateVariableValues(records, config, sourceColumnType, localeConfig);
      return values.slice(0, 3); // Show first 3
    } catch {
      return [];
    }
  }, [name, label, type, method, sourceColumn, categories, formula, records, sourceColumnType, localeConfig]);

  const handleAddCategory = () => {
    const newCategory: CategoryRule = {
      id: Date.now().toString(),
      label: '',
      min: undefined,
      max: undefined,
    };
    setCategories([...categories, newCategory]);
  };

  const handleRemoveCategory = (id: string) => {
    setCategories(categories.filter(c => c.id !== id));
  };

  const handleUpdateCategory = (id: string, updates: Partial<CategoryRule>) => {
    setCategories(categories.map(c =>
      c.id === id ? { ...c, ...updates } : c
    ));
  };

  const handleCreate = () => {
    const config: VariableConfig = {
      name,
      label,
      type,
      method,
      sourceColumn: sourceColumn || undefined,
      categories: categories.length > 0 ? categories : undefined,
      formula: formula || undefined,
    };

    // Validate configuration
    const validationError = validateVariableConfig(config, existingColumns);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Generate values
    try {
      const values = generateVariableValues(records, config, sourceColumnType, localeConfig);

      // Refuse to create a variable that is empty for every record — that
      // almost always means a broken formula or wrong source variable
      const hasAnyValue = values.some(v => v !== '' && v !== null && v !== undefined);
      if (records.length > 0 && config.method !== 'blank' && !hasAnyValue) {
        setError(
          config.method === 'formula'
            ? 'This formula produced no values for any record. Check that variable references match existing columns (e.g., {age}) and contain numeric data.'
            : 'This configuration produced no values for any record. Check the source variable and category ranges.'
        );
        return;
      }

      onCreateVariable(config, values);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create variable');
    }
  };

  const applyTemplate = (template: {
    label: string;
    name: string;
    type: DataColumn['type'];
    method: VariableConfig['method'];
    sourceColumn?: string;
    categories?: CategoryRule[];
    formula?: string;
    description: string;
  }) => {
    setLabel(template.label);
    setName(template.name);
    setType(template.type);
    setMethod(template.method);

    // Find appropriate source column if template specifies a type
    if (template.method === 'categorize') {
      const ageCol = existingColumns.find(col =>
        col.key.toLowerCase().includes('age') || col.label.toLowerCase().includes('age')
      );
      setSourceColumn(ageCol?.key || '');
    } else if (template.sourceColumn) {
      setSourceColumn(template.sourceColumn);
    }

    if (template.categories) {
      setCategories(template.categories);
    }
    if (template.formula) {
      setFormula(template.formula);
    }
    setShowTemplates(false);
    setNameManuallyEdited(true);
  };

  // Define common templates
  const templates = [
    {
      label: 'Age Group',
      name: 'age_group',
      type: 'categorical' as const,
      method: 'categorize' as const,
      description: 'Categorize ages into standard groups (0-4, 5-17, 18-49, 50+)',
      categories: [
        { id: '1', label: '0-4 years', min: 0, max: 4 },
        { id: '2', label: '5-17 years', min: 5, max: 17 },
        { id: '3', label: '18-49 years', min: 18, max: 49 },
        { id: '4', label: '50+ years', min: 50, max: 999 },
      ],
    },
    {
      label: 'Age Decade',
      name: 'age_decade',
      type: 'categorical' as const,
      method: 'categorize' as const,
      description: 'Group ages into decades (0-9, 10-19, 20-29, etc.)',
      categories: [
        { id: '1', label: '0-9 years', min: 0, max: 9 },
        { id: '2', label: '10-19 years', min: 10, max: 19 },
        { id: '3', label: '20-29 years', min: 20, max: 29 },
        { id: '4', label: '30-39 years', min: 30, max: 39 },
        { id: '5', label: '40-49 years', min: 40, max: 49 },
        { id: '6', label: '50-59 years', min: 50, max: 59 },
        { id: '7', label: '60-69 years', min: 60, max: 69 },
        { id: '8', label: '70-79 years', min: 70, max: 79 },
        { id: '9', label: '80-89 years', min: 80, max: 89 },
        { id: '10', label: '90+ years', min: 90, max: 999 },
      ],
    },
    {
      label: 'Is Adult',
      name: 'is_adult',
      type: 'categorical' as const,
      method: 'categorize' as const,
      description: 'Classify records as Adult (18+) or Child (0-17)',
      categories: [
        { id: '1', label: 'Child (0-17)', min: 0, max: 17 },
        { id: '2', label: 'Adult (18+)', min: 18, max: 999 },
      ],
    },
    {
      label: 'Fever Status',
      name: 'fever_status',
      type: 'categorical' as const,
      method: 'categorize' as const,
      description: 'Categorize temperature as Normal (<37.5°C) or Fever (≥37.5°C)',
      categories: [
        { id: '1', label: 'Normal', min: 0, max: 37.4 },
        { id: '2', label: 'Fever', min: 37.5, max: 50 },
      ],
    },
    {
      label: 'Case Classification',
      name: 'case_class',
      type: 'categorical' as const,
      method: 'copy' as const,
      description: 'Copy of case status field for analysis',
    },
  ];

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Create New Variable</h3>
              <p className="text-sm text-gray-500 mt-1">
                Create a derived variable from existing data
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Template Gallery */}
          {showTemplates && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-blue-900">Quick Start Templates</h4>
                  <p className="text-xs text-blue-700 mt-1">
                    Select a template to get started, or dismiss to create from scratch
                  </p>
                </div>
                <button
                  onClick={() => setShowTemplates(false)}
                  className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                >
                  Dismiss
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {templates.map((template, index) => (
                  <button
                    key={index}
                    onClick={() => applyTemplate(template)}
                    className="text-left p-3 bg-white border border-blue-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all"
                  >
                    <div className="font-semibold text-gray-900 text-sm mb-1">
                      {template.label}
                    </div>
                    <div className="text-xs text-gray-600">
                      {template.description}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                        {template.method}
                      </span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                        {template.type}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!showTemplates && (
            <button
              onClick={() => setShowTemplates(true)}
              className="w-full py-2 px-3 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-blue-200 border-dashed transition-colors"
            >
              Show template gallery
            </button>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="label" className="block text-sm font-medium text-gray-700 mb-1">
                Display Label *
              </label>
              <input
                id="label"
                type="text"
                value={label}
                onChange={(e) => {
                  const nextLabel = e.target.value;
                  setLabel(nextLabel);
                  if (!nameManuallyEdited) {
                    setName(toVariableName(nextLabel));
                  }
                }}
                placeholder="e.g., Age Group"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Variable Name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameManuallyEdited(true);
                }}
                placeholder="e.g., age_group"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Lowercase letters, numbers, and underscores only
              </p>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Variable Type *
            </label>
            <div className="flex gap-2 flex-wrap">
              {(['categorical', 'number', 'text', 'date', 'boolean'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    type === t
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                      : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Creation Method */}
          <div>
            <label htmlFor="method" className="block text-sm font-medium text-gray-700 mb-1">
              Creation Method *
            </label>
            <select
              id="method"
              value={method}
              onChange={(e) => {
                const nextMethod = e.target.value as VariableConfig['method'];
                setMethod(nextMethod);
                if (!sourceColumn || nextMethod === 'blank') {
                  setSourceColumn(getDefaultSourceColumn(nextMethod));
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="categorize">Categorize (create groups/ranges)</option>
              <option value="formula">Formula (calculate from other variables)</option>
              <option value="copy">Copy (duplicate existing variable)</option>
              <option value="blank">Blank (empty variable for manual entry)</option>
            </select>
          </div>

          {/* Source Column (for categorize, copy, formula) */}
          {(method === 'categorize' || method === 'copy') && (
            <div>
              <label htmlFor="sourceColumn" className="block text-sm font-medium text-gray-700 mb-1">
                Source Variable *
              </label>
              <select
                id="sourceColumn"
                value={sourceColumn}
                onChange={(e) => setSourceColumn(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a variable...</option>
                {existingColumns
                  .filter(col => method === 'categorize' ? (col.type === 'number' || col.type === 'text' || col.type === 'categorical') : true)
                  .map((col) => (
                    <option key={col.key} value={col.key}>
                      {col.label} ({col.type})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Categories (for categorize) */}
          {method === 'categorize' && sourceColumn && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Categories *
              </label>
              <div className="space-y-2">
                {categories.map((category) => (
                  <div key={category.id} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={category.label}
                        onChange={(e) => handleUpdateCategory(category.id, { label: e.target.value })}
                        placeholder="Category label"
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                      />
                      {sourceColumnType === 'number' && (
                        <div className="flex gap-2 items-center">
                          <span className="text-xs text-gray-500">Range:</span>
                          <input
                            type="number"
                            value={category.min ?? ''}
                            onChange={(e) => handleUpdateCategory(category.id, {
                              min: e.target.value ? parseFloat(e.target.value) : undefined
                            })}
                            placeholder="Min"
                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                          />
                          <span className="text-gray-400">to</span>
                          <input
                            type="number"
                            value={category.max ?? ''}
                            onChange={(e) => handleUpdateCategory(category.id, {
                              max: e.target.value ? parseFloat(e.target.value) : undefined
                            })}
                            placeholder="Max"
                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveCategory(category.id)}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Remove category"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  onClick={handleAddCategory}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Category
                </button>
              </div>
            </div>
          )}

          {/* Formula (for formula method) */}
          {method === 'formula' && (
            <div>
              <label htmlFor="formula" className="block text-sm font-medium text-gray-700 mb-1">
                Formula *
              </label>
              <input
                id="formula"
                type="text"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="e.g., {weight} / ({height} * {height})"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use curly braces around variable names. Supports +, -, *, /, and parentheses.
              </p>
            </div>
          )}

          {/* Preview */}
          {records.length > 0 && previewValues.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preview (first 3 records)
              </label>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm font-mono">
                {previewValues.map((value, index) => {
                  const sourceValue = sourceColumn ? records[index][sourceColumn] : null;
                  return (
                    <div key={index} className="text-gray-700">
                      {sourceColumn && (
                        <>
                          <span className="text-gray-500">{sourceColumn}: {String(sourceValue)}</span>
                          <span className="text-gray-400 mx-2">→</span>
                        </>
                      )}
                      <span className="text-blue-600 font-medium">
                        {value === '' ? '(empty)' : String(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!label || !name}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Create Variable
          </button>
        </div>
      </div>
    </div>
  );
}
