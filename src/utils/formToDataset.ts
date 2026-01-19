import type { FormItem, FormField } from '../types/form';
import type { DataColumn, CaseRecord } from '../types/analysis';
import { isFormField } from '../types/form';

/**
 * Convert form fields to dataset columns
 */
export function formToColumns(items: FormItem[]): DataColumn[] {
  const columns: DataColumn[] = [];

  for (const item of items) {
    if (!isFormField(item)) continue;

    const field = item as FormField;
    const key = field.variableName || field.id;
    const label = field.label;

    // Map field types to column types
    let type: DataColumn['type'];
    switch (field.type) {
      case 'number':
        type = 'number';
        break;
      case 'date':
        type = 'date';
        break;
      case 'checkbox':
        type = 'boolean';
        break;
      case 'gps':
        // GPS fields create two columns: latitude and longitude
        columns.push({ key: `${key}_lat`, label: `${label} (Lat)`, type: 'number' });
        columns.push({ key: `${key}_lng`, label: `${label} (Lng)`, type: 'number' });
        continue;
      default:
        type = 'text';
    }

    columns.push({ key, label, type });
  }

  return columns;
}

/**
 * Convert form submission data to a CaseRecord
 */
export function formDataToRecord(
  data: Record<string, unknown>,
  items: FormItem[]
): Omit<CaseRecord, 'id'> {
  const record: Record<string, unknown> = {};

  for (const item of items) {
    if (!isFormField(item)) continue;

    const field = item as FormField;
    const key = field.variableName || field.id;
    const value = data[field.id];

    if (field.type === 'gps' && value) {
      // Flatten GPS coordinates
      const gps = value as { latitude: number; longitude: number };
      record[`${key}_lat`] = gps.latitude;
      record[`${key}_lng`] = gps.longitude;
    } else if (field.type === 'multiselect' && Array.isArray(value)) {
      // Join multiselect values
      record[key] = value.join(', ');
    } else if (field.type === 'checkbox') {
      // Convert boolean to Yes/No for readability
      record[key] = value ? 'Yes' : 'No';
    } else {
      record[key] = value ?? '';
    }
  }

  return record;
}

/**
 * Generate a dataset name from a form name
 */
export function generateDatasetName(formName: string): string {
  return `${formName} - Submissions`;
}
