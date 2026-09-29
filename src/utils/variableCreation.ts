import type { Dataset, DataColumn, CaseRecord, VariableConfig, CategoryRule } from '../types/analysis';
import type { LocaleConfig } from '../contexts/LocaleContext';
import { parseFlexibleNumber } from './localeNumbers';

/**
 * Converts a label to a valid variable name for analysis variables.
 * Converts all non-alphanumeric characters to underscores to preserve word boundaries.
 * e.g., "Age Group" -> "age_group", "Patient's Age" -> "patient_s_age"
 *
 * Note: FormBuilder.tsx and FieldEditor.tsx have a separate implementation
 * that removes special characters instead of converting them. This is intentional
 * as form field names have different requirements than analysis variable names.
 */
export function toVariableName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'variable';
}

/**
 * Categorizes a numeric value based on category rules
 */
function categorizeNumericValue(
  value: unknown,
  categories: CategoryRule[],
  localeConfig?: LocaleConfig
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  let numValue: number;
  if (typeof value === 'number') {
    numValue = value;
  } else if (localeConfig) {
    numValue = parseFlexibleNumber(value as string | number | undefined | null, localeConfig);
  } else {
    numValue = parseFloat(String(value));
  }

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
  sourceColumnType: DataColumn['type'],
  localeConfig?: LocaleConfig
): unknown[] {
  return records.map(record => {
    const value = record[sourceColumn];

    if (sourceColumnType === 'number') {
      return categorizeNumericValue(value, categories, localeConfig);
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

function evaluateArithmeticExpression(expression: string): number | null {
  let index = 0;

  const skipSpaces = () => {
    while (expression[index] === ' ') index++;
  };

  const parseExpression = (): number | null => {
    let value = parseTerm();
    if (value === null) return null;

    while (true) {
      skipSpaces();
      const operator = expression[index];
      if (operator !== '+' && operator !== '-') break;
      index++;
      const right = parseTerm();
      if (right === null) return null;
      value = operator === '+' ? value + right : value - right;
    }

    return value;
  };

  const parseTerm = (): number | null => {
    let value = parseFactor();
    if (value === null) return null;

    while (true) {
      skipSpaces();
      const operator = expression[index];
      if (operator !== '*' && operator !== '/') break;
      index++;
      const right = parseFactor();
      if (right === null) return null;
      value = operator === '*' ? value * right : value / right;
    }

    return value;
  };

  const parseFactor = (): number | null => {
    skipSpaces();
    const char = expression[index];

    if (char === '+') {
      index++;
      return parseFactor();
    }

    if (char === '-') {
      index++;
      const value = parseFactor();
      return value === null ? null : -value;
    }

    if (char === '(') {
      index++;
      const value = parseExpression();
      skipSpaces();
      if (expression[index] !== ')') return null;
      index++;
      return value;
    }

    // A null token means a missing operand, which cannot yield a number.
    // Returning 0 here silently substituted zero for missing data.
    if (expression.slice(index, index + 4) === 'null') {
      return null;
    }

    const match = /(?:\d+\.?\d*|\.\d+)/.exec(expression.slice(index));
    if (!match || match.index !== 0) return null;
    index += match[0].length;
    return Number(match[0]);
  };

  if (expression.trim() === 'null') return null;

  const value = parseExpression();
  skipSpaces();
  return index === expression.length ? value : null;
}

/**
 * Evaluates a simple formula for a record
 * Currently supports basic arithmetic operations
 * Supports locale-aware decimal separators in formulas
 */
export function evaluateFormula(
  record: Record<string, unknown>,
  formula: string,
  localeConfig?: LocaleConfig
): unknown {
  try {
    // Replace variable references with their values
    // e.g., "{weight} / ({height} * {height})"
    let expression = formula;
    const variablePattern = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

    // Arithmetic over a missing operand is missing, not zero. A blank weight is
    // not a weight of nought: treating it as one produced a BMI of 0 that then
    // entered every mean, median and distribution as a real observation.
    let hasMissingOperand = false;
    expression = expression.replace(variablePattern, (_, varName) => {
      const value = record[varName];
      if (value === null || value === undefined || value === '') {
        hasMissingOperand = true;
        return 'null';
      }
      return String(value);
    });
    if (hasMissingOperand) return '';

    // Normalize locale decimal separators to periods for JavaScript evaluation
    if (localeConfig && localeConfig.decimalSeparator !== '.') {
      // Replace locale decimal separator with period, but be careful not to replace
      // operators or thousands separators
      const decimalRegex = new RegExp(
        `\\d${localeConfig.decimalSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d`,
        'g'
      );
      expression = expression.replace(decimalRegex, (match) =>
        match.replace(localeConfig.decimalSeparator, '.')
      );
    }

    // Basic validation: only allow numbers, operators, parentheses, decimal points, and spaces
    if (!/^[\d+\-*/(). ]+$/.test(expression.replace(/null/g, ''))) {
      return '';
    }

    const result = evaluateArithmeticExpression(expression);

    if (result === null || result === undefined || isNaN(result) || !isFinite(result)) {
      return '';
    }

    // Significant digits rather than two decimal places. toFixed(2) flattened
    // anything small: a rate of 3/12000 became 0.00, so a derived rate column
    // read as zero for every sparse area. Ten significant digits still removes
    // binary floating-point noise such as 0.1 + 0.2.
    return Number(result.toPrecision(10));
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
  sourceColumnType?: DataColumn['type'],
  localeConfig?: LocaleConfig
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
        sourceColumnType || 'text',
        localeConfig
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
      return records.map(record => evaluateFormula(record, config.formula!, localeConfig));

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

  // If categories are defined, store the value order for frequency table display
  if (config.categories && config.categories.length > 0) {
    newColumn.valueOrder = config.categories.map(c => c.label);
  }

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

  // 'id' is reserved: every record has an internal id field, and creating a
  // variable with that key would overwrite record ids
  if (config.name.trim().toLowerCase() === 'id') {
    return '"id" is a reserved name and cannot be used for a variable';
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
      if (
        category.min !== undefined && category.min !== null &&
        category.max !== undefined && category.max !== null &&
        category.min > category.max
      ) {
        return `Category "${category.label}" has a minimum above its maximum, so it will never match`;
      }
    }

    // Ranges are inclusive at both ends and the first match wins, so an overlap
    // is resolved silently: with "0-18" and "18-65", every 18-year-old lands in
    // the first group and the distribution looks plausible either way.
    const numeric = config.categories.filter(
      c => (c.min !== undefined && c.min !== null) || (c.max !== undefined && c.max !== null)
    );
    for (let i = 0; i < numeric.length; i++) {
      for (let j = i + 1; j < numeric.length; j++) {
        const a = numeric[i];
        const b = numeric[j];
        const aMin = a.min ?? -Infinity, aMax = a.max ?? Infinity;
        const bMin = b.min ?? -Infinity, bMax = b.max ?? Infinity;
        if (aMin <= bMax && bMin <= aMax) {
          return `Categories "${a.label}" and "${b.label}" overlap. Ranges include both endpoints, so a value in the overlap is assigned to "${a.label}".`;
        }
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
