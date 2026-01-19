export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'dropdown'
  | 'checkbox'
  | 'multiselect'
  | 'gps';

// Layout elements (non-input elements for organizing forms)
export type LayoutElementType = 'section' | 'instruction' | 'divider';

// Combined type for all form items
export type FormItemType = FieldType | LayoutElementType;

// Width options for form layout (12-column grid system)
export type FieldWidth = '1/4' | '1/3' | '1/2' | '2/3' | '3/4' | 'full';

export interface SkipLogicCondition {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'is_empty' | 'is_not_empty';
  value: string | number | boolean;
}

export interface SkipLogic {
  action: 'show' | 'hide';
  conditions: SkipLogicCondition[];
  logic: 'and' | 'or';
}

export interface FieldOption {
  label: string;
  value: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: FieldOption[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  skipLogic?: SkipLogic;
  width?: FieldWidth;
}

// Layout element for non-input form items
export interface LayoutElement {
  id: string;
  type: LayoutElementType;
  content: string; // Title for section, text content for instruction, empty for divider
  width?: FieldWidth;
}

// Union type for any item in a form (field or layout element)
export type FormItem = FormField | LayoutElement;

// Type guard to check if item is a field
export function isFormField(item: FormItem): item is FormField {
  return !['section', 'instruction', 'divider'].includes(item.type);
}

// Type guard to check if item is a layout element
export function isLayoutElement(item: FormItem): item is LayoutElement {
  return ['section', 'instruction', 'divider'].includes(item.type);
}

export interface FormDefinition {
  id: string;
  name: string;
  description?: string;
  fields: FormItem[];
  createdAt: string;
  updatedAt: string;
}

export interface FormResponse {
  id: string;
  formId: string;
  data: Record<string, unknown>;
  submittedAt: string;
  gpsCoordinates?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}
