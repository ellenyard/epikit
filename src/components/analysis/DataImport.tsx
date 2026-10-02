import { useState, useRef } from 'react';
import { extractCSVTable } from '../../utils/csvParser';
import { extractExcelTable, getSheetNames } from '../../utils/excelParser';
import { buildDataset, emptyResult } from '../../utils/tableImport';
import type { ParseResult, RawTable, ImportWarning } from '../../utils/tableImport';
import { decodeText, FALLBACK_ENCODINGS } from '../../utils/textDecoding';
import type { DateChoice, DateOrder } from '../../utils/dateDetection';
import type { NumberReading } from '../../utils/localeNumbers';
import type { DataColumn, CaseRecord } from '../../types/analysis';
import { useLocale } from '../../contexts/LocaleContext';
import { useDialog } from '../../hooks/useDialog';

interface DataImportProps {
  onImport: (name: string, columns: DataColumn[], records: CaseRecord[]) => void;
  onCancel: () => void;
}

type ImportStep = 'upload' | 'paste' | 'sheet-select' | 'confirm' | 'preview';

const WARNING_GROUPS: { level: ImportWarning['level']; title: string }[] = [
  { level: 'changed', title: 'Stored differently from the file' },
  { level: 'check', title: 'Worth checking' },
  { level: 'info', title: 'How the file was read' },
];

export function DataImport({ onImport, onCancel }: DataImportProps) {
  const { config: localeConfig } = useLocale();
  const [sourceName, setSourceName] = useState('');
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [table, setTable] = useState<RawTable | null>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<ImportStep>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guards against races when a new file is selected while a previous one
  // is still being read/parsed
  const selectionRef = useRef(0);

  // Excel sheet selection
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');

  // A text file that was not Unicode: the bytes are kept so it can be re-read
  // under another encoding if the first assumption garbles the names.
  const [textBytes, setTextBytes] = useState<ArrayBuffer | null>(null);
  const [encoding, setEncoding] = useState<string | null>(null);

  // Answers to the questions the file could not settle
  const [dateChoices, setDateChoices] = useState<Record<string, DateChoice>>({});
  const [numberChoices, setNumberChoices] = useState<Record<string, NumberReading>>({});

  // What to suggest for an ambiguous date when the file itself gives no clue:
  // the user's own date setting, and under the ISO setting the browser's region.
  const preferredDateOrder: DateOrder =
    localeConfig.dateFormat === 'MM/DD/YYYY' ? 'MDY' :
    localeConfig.dateFormat === 'DD/MM/YYYY' ? 'DMY' :
    navigator.language.startsWith('en-US') ? 'MDY' : 'DMY';

  const isExcelFile = (filename: string): boolean => {
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'xlsx' || ext === 'xls';
  };

  /** Type the columns of a grid and either ask what is in doubt or show the result. */
  const analyze = (grid: RawTable | string | null) => {
    if (grid === null || typeof grid === 'string') {
      setTable(null);
      setPreview(emptyResult(grid ?? 'No data found'));
      setStep('preview');
      return;
    }
    const result = buildDataset(grid, { preferredDateOrder });
    setTable(grid);
    if (result.dateQuestions.length > 0 || result.numberQuestions.length > 0) {
      setDateChoices(Object.fromEntries(result.dateQuestions.map(q => [q.columnKey, q.suggested])));
      setNumberChoices(Object.fromEntries(result.numberQuestions.map(q => [q.columnKey, q.suggested])));
      setPreview(result);
      setStep('confirm');
      return;
    }
    setPreview(result);
    setStep('preview');
  };

  const readTextFile = (buffer: ArrayBuffer, fallback?: string) => {
    const decoded = decodeText(buffer, fallback);
    setTextBytes(decoded.assumed ? buffer : null);
    setEncoding(decoded.assumed ? decoded.encoding : null);
    const grid = extractCSVTable(decoded.text);
    if (grid && decoded.assumed) {
      const label = FALLBACK_ENCODINGS.find(e => e.value === decoded.encoding)?.label ?? decoded.encoding;
      grid.warnings.push({
        level: 'check',
        message: `This file is not saved as Unicode (UTF-8). It was read as ${label}. Check that names and accented letters look right; if not, choose another encoding below, or save the file from Excel as "CSV UTF-8".`,
      });
    }
    analyze(grid ?? 'File is empty');
  };

  const handleFile = async (selectedFile: File) => {
    const selectionId = ++selectionRef.current;
    const isStale = () => selectionRef.current !== selectionId;

    setSourceName(selectedFile.name);
    setDatasetName(selectedFile.name.replace(/\.[^/.]+$/, ''));
    setIsLoading(true);
    setTextBytes(null);
    setEncoding(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      if (isStale()) return;

      if (isExcelFile(selectedFile.name)) {
        setFileBuffer(buffer);

        // Check for multiple sheets
        const sheets = await getSheetNames(buffer);
        if (isStale()) return;
        if (sheets.length > 1) {
          setSheetNames(sheets);
          setSelectedSheet(sheets[0]);
          setStep('sheet-select');
          return;
        }

        // Single sheet - parse directly
        const grid = await extractExcelTable(buffer);
        if (isStale()) return;
        analyze(grid);
      } else {
        readTextFile(buffer);
      }
    } catch (e) {
      if (isStale()) return;
      setPreview(emptyResult(`Failed to read file${e instanceof Error && e.message ? `: ${e.message}` : ''}`));
      setStep('preview');
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) void handleFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    // Always claim the drop: left to the browser, a dropped file replaces the
    // page with the file's contents.
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) void handleFile(dropped);
  };

  const handleSheetSelect = async () => {
    if (!fileBuffer) return;
    const selectionId = selectionRef.current;
    setIsLoading(true);

    try {
      const grid = await extractExcelTable(fileBuffer, { sheetName: selectedSheet });
      if (selectionRef.current !== selectionId) return;
      analyze(grid);
    } catch {
      if (selectionRef.current !== selectionId) return;
      setPreview(emptyResult('Failed to parse sheet'));
      setStep('preview');
    } finally {
      if (selectionRef.current === selectionId) setIsLoading(false);
    }
  };

  // Ctrl+V on the first screen: cells copied from a spreadsheet arrive as
  // tab-separated text, which goes to the paste box to be checked first.
  const handlePasteShortcut = (e: React.ClipboardEvent) => {
    if (step !== 'upload') return;
    const text = e.clipboardData.getData('text/plain');
    if (!text.trim()) return;
    e.preventDefault();
    setPastedText(text);
    setStep('paste');
  };

  const handlePasteContinue = () => {
    selectionRef.current++;
    setSourceName('Pasted data');
    setDatasetName('Pasted data');
    setTextBytes(null);
    setEncoding(null);
    analyze(extractCSVTable(pastedText) ?? 'Nothing was pasted');
  };

  const handleEncodingChange = (value: string) => {
    if (textBytes) readTextFile(textBytes, value);
  };

  const handleConfirm = () => {
    if (!table) return;
    setPreview(buildDataset(table, { preferredDateOrder, dateChoices, numberChoices }));
    setStep('preview');
  };

  const handleImport = () => {
    if (!preview || preview.records.length === 0) return;
    onImport(datasetName || 'Untitled Dataset', preview.columns, preview.records);
  };

  const resetToUpload = () => {
    selectionRef.current++; // Invalidate any in-flight parse
    setSourceName('');
    setFileBuffer(null);
    setTable(null);
    setPreview(null);
    setStep('upload');
    setSheetNames([]);
    setSelectedSheet('');
    setTextBytes(null);
    setEncoding(null);
    setDateChoices({});
    setNumberChoices({});
    setIsLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const { panelRef, dialogProps } = useDialog({ onClose: onCancel, labelledBy: 'import-data-title' });

  const hasQuestions = !!preview && (preview.dateQuestions.length > 0 || preview.numberQuestions.length > 0);
  const radioClass = (selected: boolean) =>
    `flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
      selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
    }`;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onPaste={handlePasteShortcut}
    >
      <div ref={panelRef} {...dialogProps} className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 id="import-data-title" className="text-lg font-semibold text-gray-900">Import Data</h2>
          <button onClick={onCancel} aria-label="Close import" className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {/* Step: Upload */}
          {step === 'upload' && !isLoading && (
            <div className="space-y-3">
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); }
                }}
                onDragEnter={() => setIsDragging(true)}
                onDragLeave={() => setIsDragging(false)}
                className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                  isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                }`}
              >
                <svg className="mx-auto h-12 w-12 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mt-4 text-lg font-medium text-gray-900 pointer-events-none">
                  {isDragging ? 'Drop the file to import it' : 'Choose a file from this computer'}
                </p>
                <p className="mt-2 text-sm text-gray-500 pointer-events-none">
                  Supports CSV and Excel (.xlsx, .xls) files
                </p>
                <p className="mt-1 text-xs text-gray-400 pointer-events-none">
                  Or drag and drop your file here
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
              <div className="text-center">
                <button
                  onClick={() => setStep('paste')}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Or paste data copied from a spreadsheet
                </button>
                <span className="ml-2 text-xs text-gray-400">(Ctrl+V works here too)</span>
              </div>
              {/* Said here because this is where people wonder who will see the
                  file. "Upload" suggested it was going somewhere; it is not. */}
              <p className="flex items-start justify-center gap-2 text-sm text-gray-600">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>
                  Only you can see what you import. Your browser opens the file on this computer;
                  nothing is sent to LineList, and other people who use this site cannot see it.
                </span>
              </p>
            </div>
          )}

          {/* Step: Paste */}
          {step === 'paste' && !isLoading && (
            <div className="space-y-3">
              <label htmlFor="import-paste" className="block text-sm font-medium text-gray-700">
                Paste your data
              </label>
              <p className="text-sm text-gray-500">
                Select the cells in Excel or Google Sheets, including the header row, copy them, and paste here.
              </p>
              <textarea
                id="import-paste"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                autoFocus
                rows={12}
                spellCheck={false}
                wrap="off"
                placeholder={'case_id\tage\tonset_date\nC001\t34\t13/01/2025'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="flex gap-3">
                <button
                  onClick={resetToUpload}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handlePasteContinue}
                  disabled={!pastedText.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Parsing file...</span>
            </div>
          )}

          {/* Step: Sheet Selection (Excel with multiple sheets) */}
          {step === 'sheet-select' && !isLoading && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-900 mb-2">
                  Multiple Sheets Detected
                </h3>
                <p className="text-sm text-blue-700">
                  This Excel file contains {sheetNames.length} sheets. Please select which sheet to import.
                </p>
              </div>

              <div>
                <label htmlFor="import-sheet" className="block text-sm font-medium text-gray-700 mb-2">
                  Select Sheet
                </label>
                <select
                  id="import-sheet"
                  value={selectedSheet}
                  onChange={(e) => setSelectedSheet(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {sheetNames.map((name, index) => (
                    <option key={name} value={name}>
                      {name} {index === 0 ? '(first sheet)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={resetToUpload}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleSheetSelect}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step: questions the file cannot answer about itself */}
          {step === 'confirm' && !isLoading && preview && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-amber-900 mb-2">
                  Confirm how to read these columns
                </h3>
                <p className="text-sm text-amber-700">
                  Some values can be read in two ways and nothing in the file says which is meant.
                  Check the suggestion for each column before importing.
                </p>
              </div>

              {preview.dateQuestions.map((question) => {
                const example = question.examples[0];
                const choice = dateChoices[question.columnKey];
                const options: { value: DateChoice; title: string; detail: string }[] = [
                  { value: 'DMY', title: 'Day first', detail: `${example} is ${question.previews.DMY}` },
                  { value: 'MDY', title: 'Month first', detail: `${example} is ${question.previews.MDY}` },
                  { value: 'text', title: 'Not dates', detail: 'keep these values as text, exactly as written' },
                ];
                return (
                  <fieldset key={question.columnKey} className="border border-gray-200 rounded-lg p-4">
                    <legend className="font-medium text-gray-900 px-1">
                      Date column: {question.columnLabel}
                    </legend>

                    <div className="mb-3">
                      <p className="text-sm text-gray-500 mb-1">
                        {question.count.toLocaleString()} {question.count === 1 ? 'value' : 'values'} could be either order, for example:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {question.examples.map((v, i) => (
                          <code key={i} className="px-2 py-1 bg-gray-100 rounded text-sm">
                            {v}
                          </code>
                        ))}
                      </div>
                      {question.mixed && (
                        <p className="text-sm text-amber-700 mt-2">
                          This column mixes both orders: some of its dates can only be day-first and others only
                          month-first. Those are read the only way they can be; your choice applies to the rest.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      {options.map((option) => (
                        <label key={option.value} className={radioClass(choice === option.value)}>
                          <input
                            type="radio"
                            name={`date-order-${question.columnKey}`}
                            checked={choice === option.value}
                            onChange={() => setDateChoices({ ...dateChoices, [question.columnKey]: option.value })}
                            className="text-blue-600"
                          />
                          <div className="flex-1">
                            <span className="font-medium text-gray-900">{option.title}</span>
                            <span className="text-gray-600 ml-2">{option.detail}</span>
                            {option.value === question.suggested && (
                              <span className="ml-2 text-xs text-gray-500">
                                ({question.suggestedFrom === 'sibling'
                                  ? 'suggested: another date column in this file is written this way'
                                  : 'suggested from your date format setting'})
                              </span>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}

              {preview.numberQuestions.map((question) => {
                const example = question.examples[0];
                const choice = numberChoices[question.columnKey];
                const options: { value: NumberReading; title: string; detail: string }[] = [
                  { value: 'decimal', title: 'Decimal', detail: `${example} is between ${Math.floor(question.previews.decimal)} and ${Math.floor(question.previews.decimal) + 1}` },
                  { value: 'thousands', title: 'Thousands', detail: `${example} is ${question.previews.thousands}, a whole number in the thousands` },
                ];
                return (
                  <fieldset key={question.columnKey} className="border border-gray-200 rounded-lg p-4">
                    <legend className="font-medium text-gray-900 px-1">
                      Number column: {question.columnLabel}
                    </legend>

                    <div className="mb-3">
                      <p className="text-sm text-gray-500 mb-1">
                        {question.count.toLocaleString()} {question.count === 1 ? 'value' : 'values'} could be a decimal or a thousands figure, for example:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {question.examples.map((v, i) => (
                          <code key={i} className="px-2 py-1 bg-gray-100 rounded text-sm">
                            {v}
                          </code>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {options.map((option) => (
                        <label key={option.value} className={radioClass(choice === option.value)}>
                          <input
                            type="radio"
                            name={`number-reading-${question.columnKey}`}
                            checked={choice === option.value}
                            onChange={() => setNumberChoices({ ...numberChoices, [question.columnKey]: option.value })}
                            className="text-blue-600"
                          />
                          <div className="flex-1">
                            <span className="font-medium text-gray-900">{option.title}</span>
                            <span className="text-gray-600 ml-2">{option.detail}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}

              <div className="flex gap-3">
                <button
                  onClick={resetToUpload}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Continue with Import
                </button>
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && !isLoading && preview && (
            <div className="space-y-4">
              {/* Dataset Name */}
              <div>
                <label htmlFor="import-dataset-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Dataset Name
                </label>
                <input
                  id="import-dataset-name"
                  type="text"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Everything the import has to say, most consequential first.
                  All of it is listed: a warning hidden behind "and 12 more" is
                  a value changed without the user being told. */}
              {preview.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-h-64 overflow-auto" role="status">
                  <h4 className="text-sm font-medium text-yellow-800 mb-1">
                    Import notes ({preview.warnings.length})
                  </h4>
                  {WARNING_GROUPS.map(({ level, title }) => {
                    const group = preview.warnings.filter(w => w.level === level);
                    if (group.length === 0) return null;
                    return (
                      <div key={level} className="mt-2 first:mt-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-yellow-800">{title}</p>
                        <ul className="text-sm text-yellow-700 list-disc list-inside">
                          {group.map((warning, i) => (
                            <li key={i}>{warning.message}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Re-read under another encoding */}
              {encoding && textBytes && (
                <div className="flex items-center gap-2 text-sm">
                  <label htmlFor="import-encoding" className="text-gray-700">File encoding:</label>
                  <select
                    id="import-encoding"
                    value={encoding}
                    onChange={(e) => handleEncodingChange(e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded-lg text-sm"
                  >
                    {FALLBACK_ENCODINGS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{preview.records.length}</p>
                    <p className="text-sm text-gray-500">Records</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{preview.columns.length}</p>
                    <p className="text-sm text-gray-500">Columns</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 truncate" title={sourceName}>
                      {sourceName}
                    </p>
                    <p className="text-sm text-gray-500">Source</p>
                  </div>
                </div>
              </div>

              {/* Column Preview */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Detected Columns</h4>
                <div className="flex flex-wrap gap-2">
                  {preview.columns.map((col) => (
                    <span
                      key={col.key}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700"
                    >
                      {col.label}
                      <span className="ml-1 text-xs text-gray-500">({col.type})</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Data Preview */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Data Preview (first 5 rows)
                </h4>
                <div className="border border-gray-200 rounded-lg overflow-auto max-h-64">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {preview.columns.map((col) => (
                          <th
                            key={col.key}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {preview.records.slice(0, 5).map((record) => (
                        <tr key={record.id}>
                          {preview.columns.map((col) => (
                            <td
                              key={col.key}
                              className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap"
                            >
                              {String(record[col.key] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-4">
                {/* Change answers */}
                {hasQuestions && table && (
                  <button
                    onClick={() => setStep('confirm')}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Change how dates and numbers are read
                  </button>
                )}
                {/* Change File */}
                <button
                  onClick={resetToUpload}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Choose a different file
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          {step === 'preview' && (
            <button
              onClick={handleImport}
              disabled={!preview || preview.records.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import {preview?.records.length || 0} Records
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
