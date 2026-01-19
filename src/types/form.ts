export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'dropdown'
  | 'checkbox'
  | 'multiselect'
  | 'gps';

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
}

export interface FormDefinition {
  id: string;
  name: string;
  description?: string;
  fields: FormField[];
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
