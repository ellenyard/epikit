import { useState } from 'react';
import type { FormItem, FormField, FormDefinition } from '../types/form';
import { isFormField, isLayoutElement } from '../types/form';

interface ExportModalProps {
  items: FormItem[];
  formName: string;
  onClose: () => void;
}

type ExportFormat = 'json' | 'csv' | 'kobo' | 'redcap';

export function ExportModal({ items, formName, onClose }: ExportModalProps) {
  const [exportFormat, setExportFormat] = useState<ExportFormat>('json');

  // Get only form fields (not layout elements) for CSV export
  const fields = items.filter(isFormField) as FormField[];

  const formDefinition: FormDefinition = {
    id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
    name: formName,
    fields: items,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const getExportContent = () => {
    if (exportFormat === 'json') {
      return JSON.stringify(formDefinition, null, 2);
    } else if (exportFormat === 'csv') {
      // CSV export - create a template for data collection (only fields, not layout elements)
      const headers = fields.map((f) => f.label).join(',');
      const fieldIds = fields.map((f) => f.id).join(',');
      return `# Form: ${formName}\n# Field IDs: ${fieldIds}\n${headers}\n`;
    } else if (exportFormat === 'kobo') {
      return generateKoboXLSForm();
    } else if (exportFormat === 'redcap') {
      return generateREDCapDataDictionary();
    }
    return '';
  };

  // Map form field types to Kobo XLSForm types
  const mapToKoboType = (fieldType: FormField['type']): string => {
    const typeMap: Record<FormField['type'], string> = {
      text: 'text',
      number: 'integer',
      date: 'date',
      dropdown: 'select_one',
      checkbox: 'select_multiple',
      multiselect: 'select_multiple',
      gps: 'geopoint',
    };
    return typeMap[fieldType] || 'text';
  };

  // Map form field types to REDCap field types
  const mapToREDCapType = (fieldType: FormField['type']): string => {
    const typeMap: Record<FormField['type'], string> = {
      text: 'text',
      number: 'text',
      date: 'text',
      dropdown: 'dropdown',
      checkbox: 'checkbox',
      multiselect: 'checkbox',
      gps: 'text',
    };
    return typeMap[fieldType] || 'text';
  };

  // Get REDCap validation type for field
  const getREDCapValidationType = (field: FormField): string => {
    if (field.type === 'number') return 'number';
    if (field.type === 'date') return 'date_ymd';
    if (field.type === 'gps') return 'number'; // GPS will need lat/lng split
    return '';
  };

  // Generate Kobo XLSForm format (CSV representation of survey and choices sheets)
  const generateKoboXLSForm = (): string => {
    const surveyRows: string[] = [];
    const choicesRows: string[] = [];

    // Add survey header
    surveyRows.push('type,name,label,required,hint,constraint,relevant,appearance');

    // Track which choice lists we've created
    const createdChoiceLists = new Set<string>();

    fields.forEach((field) => {
      const type = mapToKoboType(field.type);
      const name = field.variableName || field.id.replace(/[^a-zA-Z0-9_]/g, '_');
      const label = `"${field.label.replace(/"/g, '""')}"`;
      const required = field.required ? 'yes' : 'no';
      const hint = field.helpText ? `"${field.helpText.replace(/"/g, '""')}"` : '';

      let constraint = '';
      if (field.validation) {
        if (field.validation.min !== undefined || field.validation.max !== undefined) {
          const min = field.validation.min ?? '';
          const max = field.validation.max ?? '';
          if (min && max) {
            constraint = `". >= ${min} and . <= ${max}"`;
          } else if (min) {
            constraint = `". >= ${min}"`;
          } else if (max) {
            constraint = `". <= ${max}"`;
          }
        }
      }

      // Handle skip logic (relevant column)
      let relevant = '';
      if (field.skipLogic?.conditions && field.skipLogic.conditions.length > 0) {
        const logic = field.skipLogic.logic || 'and';
        const conditionStrings = field.skipLogic.conditions.map(c => {
          const targetName = fields.find(f => f.id === c.fieldId)?.variableName || c.fieldId;
          return `\${${targetName}} ${c.operator} '${c.value}'`;
        });
        relevant = `"${conditionStrings.join(` ${logic} `)}"`;
      }

      let appearance = '';

      // Handle choice-based fields
      if (type === 'select_one' || type === 'select_multiple') {
        const listName = `${name}_choices`;
        const fullType = `${type} ${listName}`;

        // Add choices to choices sheet (only once per list)
        if (field.options && !createdChoiceLists.has(listName)) {
          field.options.forEach((option) => {
            const optionName = option.value.replace(/[^a-zA-Z0-9_]/g, '_');
            const optionLabel = `"${option.label.replace(/"/g, '""')}"`;
            choicesRows.push(`${listName},${optionName},${optionLabel}`);
          });
          createdChoiceLists.add(listName);
        }

        surveyRows.push(`${fullType},${name},${label},${required},${hint},${constraint},${relevant},${appearance}`);
      } else {
        surveyRows.push(`${type},${name},${label},${required},${hint},${constraint},${relevant},${appearance}`);
      }
    });

    // Combine survey and choices sheets
    let output = '### SURVEY SHEET ###\n' + surveyRows.join('\n');

    if (choicesRows.length > 0) {
      output += '\n\n### CHOICES SHEET ###\nlist_name,name,label\n' + choicesRows.join('\n');
    }

    output += '\n\n# Note: Import both sheets into an Excel file (.xlsx) for use with KoboToolbox';
    output += '\n# Sheet 1 should be named "survey" and Sheet 2 should be named "choices"';

    return output;
  };

  // Generate REDCap Data Dictionary format
  const generateREDCapDataDictionary = (): string => {
    const rows: string[] = [];

    // Add header row (17 columns as per REDCap spec)
    const header = [
      'Variable / Field Name',
      'Form Name',
      'Section Header',
      'Field Type',
      'Field Label',
      'Choices, Calculations, OR Slider Labels',
      'Field Note',
      'Text Validation Type OR Show Slider Number',
      'Text Validation Min',
      'Text Validation Max',
      'Identifier?',
      'Branching Logic (Show field only if...)',
      'Required Field?',
      'Custom Alignment',
      'Question Number (surveys only)',
      'Matrix Group Name',
      'Matrix Ranking?'
    ];
    rows.push(header.map(h => `"${h}"`).join(','));

    const formNameSlug = formName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    let currentSection = '';

    // Track sections from layout elements
    items.forEach((item) => {
      if (item.type === 'section') {
        currentSection = item.content;
      }
    });

    fields.forEach((field, index) => {
      const variableName = field.variableName || field.id.replace(/[^a-zA-Z0-9_]/g, '_');
      const fieldType = mapToREDCapType(field.type);
      const fieldLabel = `"${field.label.replace(/"/g, '""')}"`;

      // Format choices for dropdown/checkbox/radio
      let choices = '';
      if (field.options && field.options.length > 0) {
        choices = `"${field.options.map((opt, i) => `${i + 1}, ${opt.label}`).join(' | ')}"`;
      }

      const fieldNote = field.helpText ? `"${field.helpText.replace(/"/g, '""')}"` : '';
      const validationType = getREDCapValidationType(field);

      let validationMin = '';
      let validationMax = '';
      if (field.validation) {
        validationMin = field.validation.min?.toString() || '';
        validationMax = field.validation.max?.toString() || '';
      }

      // Branching logic
      let branchingLogic = '';
      if (field.skipLogic?.conditions && field.skipLogic.conditions.length > 0) {
        const logic = field.skipLogic.logic === 'or' ? 'or' : 'and';
        const conditions = field.skipLogic.conditions.map(c => {
          const targetVar = fields.find(f => f.id === c.fieldId)?.variableName || c.fieldId;
          return `[${targetVar}] ${c.operator} '${c.value}'`;
        });
        branchingLogic = `"${conditions.join(` ${logic} `)}"`;
      }

      const required = field.required ? 'y' : '';

      // Find section header for this field
      let sectionHeader = '';
      for (let i = items.findIndex(item => item.id === field.id) - 1; i >= 0; i--) {
        const item = items[i];
        if (item.type === 'section' && isLayoutElement(item)) {
          sectionHeader = `"${item.content.replace(/"/g, '""')}"`;
          break;
        }
      }

      const row = [
        variableName,
        formNameSlug,
        sectionHeader,
        fieldType,
        fieldLabel,
        choices,
        fieldNote,
        validationType,
        validationMin,
        validationMax,
        '', // Identifier
        branchingLogic,
        required,
        '', // Custom Alignment
        '', // Question Number
        '', // Matrix Group Name
        ''  // Matrix Ranking
      ];

      rows.push(row.join(','));
    });

    return rows.join('\n');
  };

  const downloadFile = () => {
    const content = getExportContent();

    const mimeTypes: Record<ExportFormat, string> = {
      json: 'application/json',
      csv: 'text/csv',
      kobo: 'text/csv',
      redcap: 'text/csv',
    };

    const extensions: Record<ExportFormat, string> = {
      json: 'json',
      csv: 'csv',
      kobo: 'csv',
      redcap: 'csv',
    };

    const blob = new Blob([content], {
      type: mimeTypes[exportFormat],
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const baseFileName = formName.toLowerCase().replace(/\s+/g, '_');

    // Add format suffix for clarity
    const suffixes: Record<ExportFormat, string> = {
      json: '',
      csv: '_template',
      kobo: '_kobo_xlsform',
      redcap: '_redcap_dictionary',
    };

    a.href = url;
    a.download = `${baseFileName}${suffixes[exportFormat]}.${extensions[exportFormat]}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async () => {
    const content = getExportContent();
    await navigator.clipboard.writeText(content);
    alert('Copied to clipboard!');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Export Form</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 border-b border-gray-200">
          <div className="mb-2 text-sm text-gray-600 font-medium">Select Export Format:</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setExportFormat('json')}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${
                exportFormat === 'json'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              JSON
              <div className="text-xs opacity-75">Form Definition</div>
            </button>
            <button
              onClick={() => setExportFormat('csv')}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${
                exportFormat === 'csv'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              CSV
              <div className="text-xs opacity-75">Data Template</div>
            </button>
            <button
              onClick={() => setExportFormat('kobo')}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${
                exportFormat === 'kobo'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              KoboToolbox
              <div className="text-xs opacity-75">XLSForm Format</div>
            </button>
            <button
              onClick={() => setExportFormat('redcap')}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${
                exportFormat === 'redcap'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              REDCap
              <div className="text-xs opacity-75">Data Dictionary</div>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-auto">
            {getExportContent()}
          </pre>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500 max-w-md">
            {exportFormat === 'json' && 'This JSON file can be imported later to recreate the form.'}
            {exportFormat === 'csv' && 'Use this CSV template for data collection.'}
            {exportFormat === 'kobo' && 'Import the survey and choices sheets into an Excel file for KoboToolbox. Create two sheets named "survey" and "choices".'}
            {exportFormat === 'redcap' && 'Import this CSV data dictionary into REDCap to create your data collection instrument.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={copyToClipboard}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Copy
            </button>
            <button
              onClick={downloadFile}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
