import type { Dataset, DataColumn, CaseRecord, VariableConfig, CategoryRule } from '../types/analysis';

/**
 * Converts a label to a valid variable name
 * e.g., "Age Group" -> "age_group"
 */
export function toVariableName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Categorizes a numeric value based on category rules
 */
function categorizeNumericValue(value: unknown, categories: CategoryRule[]): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const numValue = typeof value === 'number' ? value : parseFloat(String(value));

  if (isNaN(numValue)) {
    return '';
  }

  for (const category of categories) {
    const min = category.min ?? -Infinity;
    const max = category.max ?? Infinity;

    if (numValue >= min && numValue <= max) {
      return category.label;
    }
  }

  return 'Other';
}

/**
 * Categorizes a text value based on category rules
 */
function categorizeTextValue(value: unknown, categories: CategoryRule[]): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const strValue = String(value).toLowerCase().trim();

  for (const category of categories) {
    if (category.values) {
      const matchValues = category.values.map(v => v.toLowerCase().trim());
      if (matchValues.includes(strValue)) {
        return category.label;
      }
    }
  }

  return 'Other';
}

/**
 * Applies categorization rules to create new column values
 */
export function categorizeVariable(
  records: CaseRecord[],
  sourceColumn: string,
  categories: CategoryRule[],
  sourceColumnType: DataColumn['type']
): unknown[] {
  return records.map(record => {
    const value = record[sourceColumn];

    if (sourceColumnType === 'number') {
      return categorizeNumericValue(value, categories);
    } else {
      return categorizeTextValue(value, categories);
    }
  });
}

/**
 * Creates a copy of an existing column
 */
export function copyVariable(
  records: CaseRecord[],
  sourceColumn: string
): unknown[] {
  return records.map(record => record[sourceColumn]);
}

/**
 * Creates a blank column with empty values
 */
export function createBlankVariable(records: CaseRecord[]): unknown[] {
  return records.map(() => '');
}

/**
 * Evaluates a simple formula for a record
 * Currently supports basic arithmetic operations
 */
export function evaluateFormula(
  record: Record<string, unknown>,
  formula: string
): unknown {
  try {
    // Replace variable references with their values
    // e.g., "{weight} / ({height} * {height})"
    let expression = formula;
    const variablePattern = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

    expression = expression.replace(variablePattern, (_, varName) => {
      const value = record[varName];
      if (value === null || value === undefined || value === '') {
        return 'null';
      }
      return String(value);
    });

    // Basic validation: only allow numbers, operators, parentheses, and decimal points
    if (!/^[\d+\-*/(). ]+$/.test(expression.replace(/null/g, ''))) {
      return '';
    }

    // Evaluate the expression
    // eslint-disable-next-line no-eval
    const result = eval(expression);

    if (result === null || result === undefined || isNaN(result) || !isFinite(result)) {
      return '';
    }

    return Number(result.toFixed(2));
  } catch {
    return '';
  }
}

/**
 * Generates values for a new variable based on the configuration
 */
export function generateVariableValues(
  records: CaseRecord[],
  config: VariableConfig,
  sourceColumnType?: DataColumn['type']
): unknown[] {
  switch (config.method) {
    case 'categorize':
      if (!config.sourceColumn || !config.categories) {
        return createBlankVariable(records);
      }
      return categorizeVariable(
        records,
        config.sourceColumn,
        config.categories,
        sourceColumnType || 'text'
      );

    case 'copy':
      if (!config.sourceColumn) {
        return createBlankVariable(records);
      }
      return copyVariable(records, config.sourceColumn);

    case 'formula':
      if (!config.formula) {
        return createBlankVariable(records);
      }
      return records.map(record => evaluateFormula(record, config.formula!));

    case 'blank':
    default:
      return createBlankVariable(records);
  }
}

/**
 * Adds a new variable to the dataset
 */
export function addVariableToDataset(
  dataset: Dataset,
  config: VariableConfig,
  values: unknown[]
): Dataset {
  // Create new column definition
  const newColumn: DataColumn = {
    key: config.name,
    label: config.label,
    type: config.type,
  };

  // Add column values to each record
  const updatedRecords = dataset.records.map((record, index) => ({
    ...record,
    [config.name]: values[index],
  }));

  return {
    ...dataset,
    columns: [...dataset.columns, newColumn],
    records: updatedRecords,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Validates a variable configuration
 */
export function validateVariableConfig(
  config: VariableConfig,
  existingColumns: DataColumn[]
): string | null {
  // Check if name is empty
  if (!config.name.trim()) {
    return 'Variable name is required';
  }

  // Check if name already exists
  if (existingColumns.some(col => col.key === config.name)) {
    return `Variable "${config.name}" already exists`;
  }

  // Check if name is valid (alphanumeric and underscores only)
  if (!/^[a-z][a-z0-9_]*$/.test(config.name)) {
    return 'Variable name must start with a letter and contain only lowercase letters, numbers, and underscores';
  }

  // Check if label is empty
  if (!config.label.trim()) {
    return 'Variable label is required';
  }

  // Method-specific validation
  if (config.method === 'categorize' || config.method === 'copy') {
    if (!config.sourceColumn) {
      return 'Source variable is required';
    }
  }

  if (config.method === 'categorize') {
    if (!config.categories || config.categories.length === 0) {
      return 'At least one category is required';
    }

    // Validate each category
    for (const category of config.categories) {
      if (!category.label.trim()) {
        return 'All categories must have a label';
      }
    }
  }

  if (config.method === 'formula') {
    if (!config.formula || !config.formula.trim()) {
      return 'Formula is required';
    }
  }

  return null;
}
