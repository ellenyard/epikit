import { useState, useEffect, useMemo } from 'react';
import type { DataColumn, VariableConfig, CategoryRule, CaseRecord } from '../../types/analysis';
import { toVariableName, validateVariableConfig, generateVariableValues } from '../../utils/variableCreation';

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
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<DataColumn['type']>('categorical');
  const [method, setMethod] = useState<VariableConfig['method']>('categorize');
  const [sourceColumn, setSourceColumn] = useState('');
  const [categories, setCategories] = useState<CategoryRule[]>([]);
  const [formula, setFormula] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);

  // Auto-generate variable name from label
  useEffect(() => {
    if (!nameManuallyEdited && label) {
      setName(toVariableName(label));
    }
  }, [label, nameManuallyEdited]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setLabel('');
      setName('');
      setType('categorical');
      setMethod('categorize');
      setSourceColumn('');
      setCategories([]);
      setFormula('');
      setError(null);
      setNameManuallyEdited(false);
    }
  }, [isOpen]);

  // Auto-select first numeric column when method is categorize
  useEffect(() => {
    if (method === 'categorize' && !sourceColumn) {
      const numericCol = existingColumns.find(col => col.type === 'number');
      if (numericCol) {
        setSourceColumn(numericCol.key);
      }
    }
  }, [method, sourceColumn, existingColumns]);

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
      const values = generateVariableValues(records, config, sourceColumnType);
      return values.slice(0, 3); // Show first 3
    } catch {
      return [];
    }
  }, [name, label, type, method, sourceColumn, categories, formula, records, sourceColumnType]);

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
      const values = generateVariableValues(records, config, sourceColumnType);
      onCreateVariable(config, values);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create variable');
    }
  };

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
                onChange={(e) => setLabel(e.target.value)}
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
              onChange={(e) => setMethod(e.target.value as VariableConfig['method'])}
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
                  .filter(col => method === 'categorize' ? (col.type === 'number' || col.type === 'text') : true)
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
