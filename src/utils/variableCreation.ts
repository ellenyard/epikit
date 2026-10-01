import type { Dataset, DataColumn, CaseRecord, VariableConfig, CategoryRule } from '../types/analysis';
import type { LocaleConfig } from '../contexts/LocaleContext';
import { classifyNumber, numberFromShape, parseFlexibleNumber } from './localeNumbers';
import { parseStoredDate, dayNumber } from './dateValue';

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

/** A cell as a number, or NaN. The whole text must be a number: "6 months" is not 6. */
function toNumber(value: unknown, localeConfig?: LocaleConfig): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  if (localeConfig) return parseFlexibleNumber(value, localeConfig);
  const shape = classifyNumber(value);
  return shape ? numberFromShape(shape) : NaN;
}

/**
 * The category a number falls in, or null when no range takes it.
 *
 * Ranges include both ends. Groups are normally written in whole units,
 * "0-4" then "5-17", which leaves the values between 4 and 5 belonging to
 * neither: an age of 4.5 years or a temperature of 37.45 fell through to
 * "Other". By the usual reading of such labels a child of four and a half is
 * in the 0-4 group, so a value in the gap between two adjacent ranges goes to
 * the lower one. Only a gap of one unit or less is closed this way; a wider
 * gap is a range the user chose to leave out.
 */
function rangeCategory(numValue: number, categories: CategoryRule[]): string | null {
  for (const category of categories) {
    const hasRange = (category.min !== undefined && category.min !== null) ||
      (category.max !== undefined && category.max !== null);
    if (!hasRange) continue;
    const min = category.min ?? -Infinity;
    const max = category.max ?? Infinity;

    if (numValue >= min && numValue <= max) {
      return category.label;
    }
  }

  let below: CategoryRule | null = null;
  let nextMin = Infinity;
  for (const category of categories) {
    const { min, max } = category;
    if (max !== undefined && max !== null && max < numValue && (!below || max > below.max!)) below = category;
    if (min !== undefined && min !== null && min > numValue && min < nextMin) nextMin = min;
  }
  if (below && nextMin - below.max! <= 1) return below.label;

  return null;
}

/**
 * The category one value belongs to.
 *
 * A category can list the values it takes, give a numeric range, or both.
 * Listed values are matched first, so "<1" can be put in the youngest age
 * group alongside the range that takes the numbers. Missing stays missing;
 * anything no category takes is "Other", so it shows up in a table instead of
 * vanishing.
 */
function categorizeValue(
  value: unknown,
  categories: CategoryRule[],
  localeConfig?: LocaleConfig
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const strValue = String(value).toLowerCase().trim();
  if (strValue === '') return '';

  for (const category of categories) {
    if (category.values && category.values.some(v => v.toLowerCase().trim() === strValue)) {
      return category.label;
    }
  }

  const numValue = toNumber(value, localeConfig);
  if (!isNaN(numValue)) {
    return rangeCategory(numValue, categories) ?? 'Other';
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
  // A numeric column holds numbers or blanks; text that is not a number there
  // is unusable and stays missing, as it always has.
  const numericSource = sourceColumnType === 'number';
  return records.map(record => {
    const value = record[sourceColumn];
    if (numericSource && typeof value === 'string' && value.trim() !== '' &&
        isNaN(toNumber(value, localeConfig)) &&
        !categories.some(c => c.values?.some(v => v.toLowerCase().trim() === value.toLowerCase().trim()))) {
      return '';
    }
    return categorizeValue(value, categories, localeConfig);
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
 * A value inside a formula. `dates` counts how many dates it is made of: 1 for
 * a date, 0 for a plain number, and 0 again for the difference of two dates,
 * which is a number of days.
 */
interface Operand {
  value: number;
  dates: number;
}

/** Thrown to stop evaluation when an operand is missing. */
const MISSING = Symbol('missing operand');

/**
 * Turn a cell into a formula operand.
 *
 * A date becomes a day count, so that subtracting two dates gives the days
 * between them. Dates used to be pasted into the expression as text, where
 * "2025-03-10 - 2025-03-01" is the arithmetic 2025 - 3 - 10 - 2025 - 3 - 1,
 * and a reporting delay of nine days came out as -17.
 */
function toOperand(value: unknown): Operand | null | typeof MISSING {
  if (value === null || value === undefined || value === '') return MISSING;
  if (typeof value === 'number') return isFinite(value) ? { value, dates: 0 } : null;
  if (typeof value !== 'string') return null;
  if (value.trim() === '') return MISSING;

  const date = parseStoredDate(value);
  if (date) {
    const fraction = (date.hour * 3600 + date.minute * 60 + date.second) / 86400;
    return { value: dayNumber(date) + fraction, dates: 1 };
  }
  const shape = classifyNumber(value);
  return shape ? { value: numberFromShape(shape), dates: 0 } : null;
}

function evaluateArithmeticExpression(
  expression: string,
  record: Record<string, unknown>
): number | null | typeof MISSING {
  let index = 0;
  let missing = false;

  const skipSpaces = () => {
    while (expression[index] === ' ') index++;
  };

  const parseExpression = (): Operand | null => {
    let left = parseTerm();
    if (left === null) return null;

    while (true) {
      skipSpaces();
      const operator = expression[index];
      if (operator !== '+' && operator !== '-') break;
      index++;
      const right = parseTerm();
      if (right === null) return null;
      left = operator === '+'
        ? { value: left.value + right.value, dates: left.dates + right.dates }
        : { value: left.value - right.value, dates: left.dates - right.dates };
    }

    return left;
  };

  const parseTerm = (): Operand | null => {
    let left = parseFactor();
    if (left === null) return null;

    while (true) {
      skipSpaces();
      const operator = expression[index];
      if (operator !== '*' && operator !== '/') break;
      index++;
      const right = parseFactor();
      if (right === null) return null;
      // A date can be subtracted from a date; it cannot be multiplied.
      if (left.dates !== 0 || right.dates !== 0) return null;
      left = { value: operator === '*' ? left.value * right.value : left.value / right.value, dates: 0 };
    }

    return left;
  };

  const parseFactor = (): Operand | null => {
    skipSpaces();
    const char = expression[index];

    if (char === '+') {
      index++;
      return parseFactor();
    }

    if (char === '-') {
      index++;
      const operand = parseFactor();
      return operand === null ? null : { value: -operand.value, dates: -operand.dates };
    }

    if (char === '(') {
      index++;
      const operand = parseExpression();
      skipSpaces();
      if (expression[index] !== ')') return null;
      index++;
      return operand;
    }

    if (char === '{') {
      const end = expression.indexOf('}', index);
      if (end === -1) return null;
      const name = expression.slice(index + 1, end);
      if (!/^[a-zA-Z0-9_]+$/.test(name)) return null;
      index = end + 1;
      const operand = toOperand(record[name]);
      if (operand === MISSING) {
        // Arithmetic over a missing operand is missing, not zero. A blank
        // weight is not a weight of nought: treating it as one produced a BMI
        // of 0 that then entered every mean, median and distribution as a
        // real observation. Parsing continues so the formula is still checked.
        missing = true;
        return { value: 0, dates: 0 };
      }
      return operand;
    }

    const match = /(?:\d+\.?\d*|\.\d+)/.exec(expression.slice(index));
    if (!match || match.index !== 0) return null;
    index += match[0].length;
    return { value: Number(match[0]), dates: 0 };
  };

  const result = parseExpression();
  skipSpaces();
  if (result === null || index !== expression.length) return null;
  if (missing) return MISSING;
  // What is left must be a number. A lone date, or a date plus a number, is
  // still a date, and this function does not produce those.
  return result.dates === 0 ? result.value : null;
}

/**
 * Evaluates a simple formula for a record
 * Currently supports basic arithmetic operations
 * Supports locale-aware decimal separators in formulas
 *
 * Variables are written {name}. A date variable can be subtracted from
 * another to give the number of days between them, e.g.
 * {report_date} - {onset_date}.
 */
export function evaluateFormula(
  record: Record<string, unknown>,
  formula: string,
  localeConfig?: LocaleConfig
): unknown {
  try {
    let expression = formula;

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

    // Basic validation: outside variable references, only numbers, operators,
    // parentheses, decimal points, and spaces
    if (!/^[\d+\-*/(). ]*$/.test(expression.replace(/\{[a-zA-Z0-9_]+\}/g, ''))) {
      return '';
    }

    const result = evaluateArithmeticExpression(expression, record);

    if (result === MISSING || result === null || isNaN(result) || !isFinite(result)) {
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
      const hasRange = (category.min !== undefined && category.min !== null) ||
        (category.max !== undefined && category.max !== null);
      if (!hasRange && !(category.values && category.values.length > 0)) {
        return `Category "${category.label}" has no range and no values, so nothing can fall into it`;
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
