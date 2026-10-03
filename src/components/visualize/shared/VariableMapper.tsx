import type { DataColumn } from '../../../types/analysis';

interface VariableMapperProps {
  label: string;
  description?: string;
  /** The columns that fit this slot, in the order they should be offered. */
  columns: DataColumn[];
  value: string;
  onChange: (columnKey: string) => void;
  filterTypes?: DataColumn['type'][];  // Only show columns of these types
  required?: boolean;
  placeholder?: string;
}

/**
 * How a column is named in the list. The column's type used to be appended
 * to every entry ("Sex (categorical)"), which was noise on a list that is
 * already limited to the columns that fit. It is kept only where two columns
 * share a label and would otherwise be indistinguishable.
 */
function columnOptionLabel(column: DataColumn, listed: DataColumn[]): string {
  const sameLabel = listed.filter(c => c.label === column.label).length > 1;
  return sameLabel ? `${column.label} (${column.type})` : column.label;
}

export function VariableMapper({
  label,
  description,
  columns,
  value,
  onChange,
  filterTypes,
  required = false,
  placeholder = 'Select a variable...',
}: VariableMapperProps) {
  const filteredColumns = filterTypes
    ? columns.filter(c => filterTypes.includes(c.type))
    : columns;

  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {description && (
        <p className="text-xs text-gray-500 mb-1">{description}</p>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">{placeholder}</option>
        {filteredColumns.map(col => (
          <option key={col.key} value={col.key}>
            {columnOptionLabel(col, filteredColumns)}
          </option>
        ))}
      </select>
    </div>
  );
}
