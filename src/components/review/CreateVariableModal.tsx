import { useState, useEffect, useMemo, useCallback } from 'react';
import type { DataColumn, VariableConfig, CategoryRule, CaseRecord } from '../../types/analysis';
import { toVariableName, validateVariableConfig, generateVariableValues } from '../../utils/variableCreation';
import { classifyNumber } from '../../utils/localeNumbers';
import { useLocale } from '../../contexts/LocaleContext';
import { useDialog } from '../../hooks/useDialog';

/** The words in a column's key and label, lower-cased and without accents. */
function columnWords(column: DataColumn): string[] {
  return `${column.key} ${column.label}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * The column a template is about, or undefined when the dataset has none.
 *
 * Matched on whole words. Looking for "age" anywhere in the name picked
 * "village", "stage" and "dosage", and every template used that same search,
 * so Fever Status binned ages (or villages) into Normal and Fever.
 */
function findTemplateSource(
  columns: DataColumn[],
  words: RegExp,
  preferred: DataColumn['type'][]
): DataColumn | undefined {
  const matches = columns.filter(col => columnWords(col).some(word => words.test(word)));
  return matches.find(col => preferred.includes(col.type)) ?? matches[0];
}

// More distinct values than this and a recode is done by typing, not clicking.
const MAX_VALUE_CHIPS = 60;

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
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

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
      setTemplateNotice(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [isOpen, getDefaultSourceColumn]);

  // Get source column type
  const sourceColumnType = useMemo(() => {
    return existingColumns.find(col => col.key === sourceColumn)?.type;
  }, [existingColumns, sourceColumn]);

  // What the source column holds, which decides how it can be categorised:
  // numbers by range, anything else by listing the values each group takes.
  // A text column that is nearly all numbers (an age column imported as text
  // because of one "<1") gets both, so the numbers can still be ranged and
  // the odd values placed by hand.
  const sourceProfile = useMemo(() => {
    const counts = new Map<string, number>();
    let filled = 0, numeric = 0;
    for (const record of records) {
      const value = sourceColumn ? record[sourceColumn] : null;
      if (value === null || value === undefined || String(value).trim() === '') continue;
      filled++;
      const text = String(value).trim();
      const isNumber = typeof value === 'number' || classifyNumber(text) !== null;
      if (isNumber) numeric++;
      else counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    const mostlyNumeric = sourceColumnType === 'number' || (filled > 0 && numeric / filled >= 0.8);
    if (!mostlyNumeric) {
      // Not a numeric column: every value is a category to assign, numbers too.
      counts.clear();
      for (const record of records) {
        const value = sourceColumn ? record[sourceColumn] : null;
        if (value === null || value === undefined || String(value).trim() === '') continue;
        const text = String(value).trim();
        counts.set(text, (counts.get(text) ?? 0) + 1);
      }
    }
    const values = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { useRanges: mostlyNumeric, values };
  }, [records, sourceColumn, sourceColumnType]);

  // Generate preview values
  const allValues = useMemo(() => {
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
      return generateVariableValues(records, config, sourceColumnType, localeConfig);
    } catch {
      return [];
    }
  }, [name, label, type, method, sourceColumn, categories, formula, records, sourceColumnType, localeConfig]);
  const previewValues = allValues.slice(0, 3); // Show first 3
  // How many records no category takes. Three preview rows cannot show this,
  // and a variable that is mostly "Other" is the sign of a wrong source or range.
  const otherCount = method === 'categorize' ? allValues.filter(v => v === 'Other').length : 0;
  const emptyCount = method === 'formula' ? allValues.filter(v => v === '').length : 0;

  const handleAddCategory = () => {
    const newCategory: CategoryRule = {
      id: Date.now().toString(),
      label: '',
      min: undefined,
      max: undefined,
      values: [],
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

  /** Put a source value in a category, or take it out; a value sits in one category at most. */
  const toggleCategoryValue = (id: string, value: string) => {
    setCategories(categories.map(c => {
      const current = c.values ?? [];
      if (c.id === id) {
        return { ...c, values: current.includes(value) ? current.filter(v => v !== value) : [...current, value] };
      }
      return current.includes(value) ? { ...c, values: current.filter(v => v !== value) } : c;
    }));
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
    source: { words: RegExp; preferred: DataColumn['type'][]; describe: string };
    categories?: CategoryRule[];
    formula?: string;
    description: string;
  }) => {
    setLabel(template.label);
    setName(template.name);
    setType(template.type);
    setMethod(template.method);

    // Each template names the kind of column it is about. When the dataset
    // has none, the source is left for the user to choose: a wrong column
    // chosen silently produces a plausible-looking variable.
    const source = findTemplateSource(existingColumns, template.source.words, template.source.preferred);
    setSourceColumn(source?.key || '');
    setTemplateNotice(source
      ? null
      : `No ${template.source.describe} variable was found in this dataset. Choose the source variable below.`);

    setCategories(template.categories ?? []);
    if (template.formula) {
      setFormula(template.formula);
    }
    setShowTemplates(false);
    setNameManuallyEdited(true);
  };

  // Define common templates
  const AGE_SOURCE = { words: /^age$/, preferred: ['number'] as DataColumn['type'][], describe: 'age' };
  const templates = [
    {
      label: 'Age Group',
      name: 'age_group',
      type: 'categorical' as const,
      method: 'categorize' as const,
      description: 'Categorize ages into standard groups (0-4, 5-17, 18-49, 50+)',
      source: AGE_SOURCE,
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
      source: AGE_SOURCE,
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
      source: AGE_SOURCE,
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
      source: { words: /^temp/, preferred: ['number'] as DataColumn['type'][], describe: 'temperature' },
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
      source: { words: /^(status|classif|class)/, preferred: ['categorical', 'text'] as DataColumn['type'][], describe: 'case status' },
    },
  ];

  const { panelRef, dialogProps } = useDialog({ onClose, labelledBy: 'create-variable-title', isOpen });

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div ref={panelRef} {...dialogProps} className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 id="create-variable-title" className="text-lg font-semibold text-gray-900">Create New Variable</h3>
              <p className="text-sm text-gray-500 mt-1">
                Create a derived variable from existing data
              </p>
            </div>
            <button
              aria-label="Close create variable"
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

          {templateNotice && !sourceColumn && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              {templateNotice}
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
                // A formula gives a number; left as "categorical" it was
                // treated as a label by every numeric analysis.
                if (nextMethod === 'formula' && type === 'categorical') setType('number');
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
                      {sourceProfile.useRanges && (
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
                      {sourceProfile.values.length > 0 && sourceProfile.values.length <= MAX_VALUE_CHIPS && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">
                            {sourceProfile.useRanges
                              ? 'Values that are not numbers; click any that belong in this category:'
                              : 'Click the values that belong in this category:'}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {sourceProfile.values.map(([value, count]) => {
                              const mine = (category.values ?? []).includes(value);
                              const taken = !mine && categories.some(c => (c.values ?? []).includes(value));
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  aria-pressed={mine}
                                  onClick={() => toggleCategoryValue(category.id, value)}
                                  title={taken ? 'In another category; click to move it here' : undefined}
                                  className={`px-2 py-0.5 text-xs rounded-full border ${
                                    mine
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : taken
                                      ? 'bg-gray-100 text-gray-400 border-gray-200'
                                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                                  }`}
                                >
                                  {value} <span className="opacity-70">({count})</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {sourceProfile.values.length > MAX_VALUE_CHIPS && !sourceProfile.useRanges && (
                        <input
                          type="text"
                          aria-label="Values in this category, separated by semicolons"
                          value={(category.values ?? []).join('; ')}
                          onChange={(e) => handleUpdateCategory(category.id, {
                            values: e.target.value.split(';').map(v => v.trim()).filter(Boolean),
                          })}
                          placeholder="Values in this category, separated by semicolons"
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        />
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
                <p className="text-xs text-gray-500">
                  {sourceProfile.useRanges
                    ? 'Ranges include both ends. A value between two adjacent ranges, such as 4.5 between 0–4 and 5–17, goes to the lower one. '
                    : ''}
                  Blank values stay blank; a value no category takes becomes "Other".
                </p>
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
                Subtracting one date from another gives the number of days between them,
                e.g. {'{report_date} - {onset_date}'}.
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {existingColumns
                  .filter(col => col.type === 'number' || col.type === 'date')
                  .map(col => (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => setFormula(`${formula}{${col.key}}`)}
                      title={`Insert ${col.label}`}
                      className="px-2 py-0.5 text-xs font-mono rounded border border-gray-300 text-gray-700 hover:border-blue-400"
                    >
                      {`{${col.key}}`}
                    </button>
                  ))}
              </div>
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
                  // A formula has no single source; showing the column left
                  // selected from another method beside its result misleads.
                  const showSource = sourceColumn && (method === 'categorize' || method === 'copy');
                  const sourceValue = showSource ? records[index][sourceColumn] : null;
                  return (
                    <div key={index} className="text-gray-700">
                      {showSource && (
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
              {otherCount > 0 && (
                <p className="text-sm text-amber-700 mt-2">
                  {otherCount.toLocaleString()} of {records.length.toLocaleString()} records fall in no category and would be "Other".
                </p>
              )}
              {emptyCount > 0 && (
                <p className="text-sm text-gray-600 mt-2">
                  {emptyCount.toLocaleString()} of {records.length.toLocaleString()} records would be empty, because an input is missing or is not a number or date.
                </p>
              )}
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
