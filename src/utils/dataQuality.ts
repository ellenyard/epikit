import type {
  CaseRecord,
  DataColumn,
  DataQualityIssue,
  DataQualityConfig,
  DataQualityCheckType,
  DataQualityFieldMapping,
} from '../types/analysis';

// Generate unique ID for issues
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Parse a date value from various formats
function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const str = String(value).trim();
  if (!str) return null;
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
}

// Get field value from record
function getFieldValue(record: CaseRecord, fieldKey: string | undefined): unknown {
  if (!fieldKey) return undefined;
  return record[fieldKey];
}

// Check if a value is empty
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

// Default configuration
export function getDefaultConfig(): DataQualityConfig {
  return {
    fieldMapping: {},
    enabledChecks: [
      'duplicate_exact',
      'duplicate_key',
      'temporal_onset_after_exposure',
      'temporal_onset_before_report',
      'temporal_death_after_onset',
      'temporal_future_date',
      'completeness_required',
      'range_age',
    ],
    dateRangeMonths: 24,
    ageMin: 0,
    ageMax: 120,
    positiveLabValues: ['Positive', 'Detected', 'Yes', 'positive', 'detected', 'yes'],
    confirmedStatusValues: ['Confirmed', 'confirmed', 'CONFIRMED'],
  };
}

// Auto-detect field mappings based on column names
export function autoDetectFieldMapping(columns: DataColumn[]): DataQualityFieldMapping {
  const mapping: DataQualityFieldMapping = {};

  const patterns: Partial<Record<keyof DataQualityFieldMapping, RegExp[]>> = {
    onsetDate: [/onset/i, /symptom.*date/i, /illness.*date/i, /start.*date/i],
    exposureDate: [/exposure/i, /exposed/i, /contact.*date/i],
    reportDate: [/report/i, /notification/i, /notify/i],
    deathDate: [/death/i, /died/i, /deceased.*date/i],
    specimenDate: [/specimen/i, /sample/i, /collection/i, /lab.*date/i],
    dateOfBirth: [/birth/i, /dob/i, /born/i],
    caseId: [/case.*id/i, /id$/i, /^id$/i, /patient.*id/i, /record.*id/i],
    firstName: [/first.*name/i, /given.*name/i, /^first$/i],
    lastName: [/last.*name/i, /surname/i, /family.*name/i, /^last$/i],
    fullName: [/^name$/i, /full.*name/i, /patient.*name/i],
    caseStatus: [/case.*status/i, /status/i, /classification/i],
    labResult: [/lab.*result/i, /result/i, /test.*result/i, /pcr/i],
    hospitalized: [/hospital/i, /admitted/i, /inpatient/i],
    hospitalName: [/hospital.*name/i, /facility/i],
    outcome: [/outcome/i, /disposition/i],
    age: [/^age$/i, /age.*years/i],
  };

  for (const col of columns) {
    const labelLower = col.label.toLowerCase();
    const keyLower = col.key.toLowerCase();

    for (const [field, regexList] of Object.entries(patterns)) {
      if (field === 'requiredFields') continue;

      for (const regex of regexList) {
        if (regex.test(labelLower) || regex.test(keyLower)) {
          // Only set if not already set (first match wins)
          if (!mapping[field as keyof DataQualityFieldMapping]) {
            (mapping as Record<string, string>)[field] = col.key;
          }
          break;
        }
      }
    }
  }

  return mapping;
}

// Check for exact duplicates
function checkExactDuplicates(
  records: CaseRecord[],
  columns: DataColumn[]
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const seen = new Map<string, string[]>();

  for (const record of records) {
    // Create a hash of all values except id
    const values = columns.map(col => {
      const val = record[col.key];
      return val === null || val === undefined ? '' : String(val);
    }).join('|');

    const existing = seen.get(values);
    if (existing) {
      existing.push(record.id);
    } else {
      seen.set(values, [record.id]);
    }
  }

  for (const [, ids] of seen) {
    if (ids.length > 1) {
      issues.push({
        id: generateId(),
        checkType: 'duplicate_exact',
        category: 'duplicate',
        severity: 'error',
        recordIds: ids,
        message: `${ids.length} exact duplicate records`,
        details: `Records have identical values in all fields`,
      });
    }
  }

  return issues;
}

// Check for key field duplicates
function checkKeyDuplicates(
  records: CaseRecord[],
  mapping: DataQualityFieldMapping
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  // Check by case ID if available
  if (mapping.caseId) {
    const byId = new Map<string, string[]>();
    for (const record of records) {
      const val = getFieldValue(record, mapping.caseId);
      if (!isEmpty(val)) {
        const key = String(val).trim().toLowerCase();
        const existing = byId.get(key);
        if (existing) {
          existing.push(record.id);
        } else {
          byId.set(key, [record.id]);
        }
      }
    }
    for (const [key, ids] of byId) {
      if (ids.length > 1) {
        issues.push({
          id: generateId(),
          checkType: 'duplicate_key',
          category: 'duplicate',
          severity: 'error',
          recordIds: ids,
          field: mapping.caseId,
          message: `${ids.length} records with same Case ID`,
          details: `Case ID: "${key}"`,
        });
      }
    }
  }

  // Check by name combination if available
  const nameKey = mapping.fullName || (mapping.firstName && mapping.lastName ? 'name_combo' : null);
  if (nameKey) {
    const byName = new Map<string, string[]>();
    for (const record of records) {
      let name: string;
      if (mapping.fullName) {
        const val = getFieldValue(record, mapping.fullName);
        name = isEmpty(val) ? '' : String(val).trim().toLowerCase();
      } else {
        const first = getFieldValue(record, mapping.firstName);
        const last = getFieldValue(record, mapping.lastName);
        name = [
          isEmpty(first) ? '' : String(first).trim().toLowerCase(),
          isEmpty(last) ? '' : String(last).trim().toLowerCase(),
        ].filter(Boolean).join(' ');
      }

      if (name) {
        const existing = byName.get(name);
        if (existing) {
          existing.push(record.id);
        } else {
          byName.set(name, [record.id]);
        }
      }
    }
    for (const [name, ids] of byName) {
      if (ids.length > 1) {
        issues.push({
          id: generateId(),
          checkType: 'duplicate_key',
          category: 'duplicate',
          severity: 'warning',
          recordIds: ids,
          field: mapping.fullName || mapping.firstName,
          message: `${ids.length} records with same name`,
          details: `Name: "${name}"`,
        });
      }
    }
  }

  return issues;
}

// Check temporal: onset after exposure
function checkOnsetAfterExposure(
  records: CaseRecord[],
  mapping: DataQualityFieldMapping
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (!mapping.onsetDate || !mapping.exposureDate) return issues;

  for (const record of records) {
    const onset = parseDate(getFieldValue(record, mapping.onsetDate));
    const exposure = parseDate(getFieldValue(record, mapping.exposureDate));

    if (onset && exposure && onset < exposure) {
      issues.push({
        id: generateId(),
        checkType: 'temporal_onset_after_exposure',
        category: 'temporal',
        severity: 'error',
        recordIds: [record.id],
        field: mapping.onsetDate,
        message: 'Symptom onset before exposure date',
        details: `Onset: ${onset.toLocaleDateString()}, Exposure: ${exposure.toLocaleDateString()}`,
      });
    }
  }

  return issues;
}

// Check temporal: onset before report
function checkOnsetBeforeReport(
  records: CaseRecord[],
  mapping: DataQualityFieldMapping
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (!mapping.onsetDate || !mapping.reportDate) return issues;

  for (const record of records) {
    const onset = parseDate(getFieldValue(record, mapping.onsetDate));
    const report = parseDate(getFieldValue(record, mapping.reportDate));

    if (onset && report && onset > report) {
      issues.push({
        id: generateId(),
        checkType: 'temporal_onset_before_report',
        category: 'temporal',
        severity: 'warning',
        recordIds: [record.id],
        field: mapping.onsetDate,
        message: 'Symptom onset after report date',
        details: `Onset: ${onset.toLocaleDateString()}, Report: ${report.toLocaleDateString()}`,
      });
    }
  }

  return issues;
}

// Check temporal: death after onset
function checkDeathAfterOnset(
  records: CaseRecord[],
  mapping: DataQualityFieldMapping
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (!mapping.deathDate || !mapping.onsetDate) return issues;

  for (const record of records) {
    const death = parseDate(getFieldValue(record, mapping.deathDate));
    const onset = parseDate(getFieldValue(record, mapping.onsetDate));

    if (death && onset && death < onset) {
      issues.push({
        id: generateId(),
        checkType: 'temporal_death_after_onset',
        category: 'temporal',
        severity: 'error',
        recordIds: [record.id],
        field: mapping.deathDate,
        message: 'Death date before symptom onset',
        details: `Death: ${death.toLocaleDateString()}, Onset: ${onset.toLocaleDateString()}`,
      });
    }
  }

  return issues;
}

// Check temporal: no future dates
function checkFutureDates(
  records: CaseRecord[],
  columns: DataColumn[]
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Get all date columns
  const dateColumns = columns.filter(c => c.type === 'date').map(c => c.key);

  for (const record of records) {
    for (const colKey of dateColumns) {
      const date = parseDate(getFieldValue(record, colKey));
      if (date && date > today) {
        const col = columns.find(c => c.key === colKey);
        issues.push({
          id: generateId(),
          checkType: 'temporal_future_date',
          category: 'temporal',
          severity: 'error',
          recordIds: [record.id],
          field: colKey,
          message: `Future date in ${col?.label || colKey}`,
          details: `Date: ${date.toLocaleDateString()}`,
        });
      }
    }
  }

  return issues;
}

// Check completeness: required fields
function checkRequiredFields(
  records: CaseRecord[],
  mapping: DataQualityFieldMapping,
  columns: DataColumn[]
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const requiredFields = mapping.requiredFields || [];

  for (const record of records) {
    for (const fieldKey of requiredFields) {
      const value = getFieldValue(record, fieldKey);
      if (isEmpty(value)) {
        const col = columns.find(c => c.key === fieldKey);
        issues.push({
          id: generateId(),
          checkType: 'completeness_required',
          category: 'completeness',
          severity: 'warning',
          recordIds: [record.id],
          field: fieldKey,
          message: `Missing required field: ${col?.label || fieldKey}`,
        });
      }
    }
  }

  return issues;
}

// Check range: age
function checkAgeRange(
  records: CaseRecord[],
  mapping: DataQualityFieldMapping,
  config: DataQualityConfig
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (!mapping.age) return issues;

  for (const record of records) {
    const ageVal = getFieldValue(record, mapping.age);
    if (!isEmpty(ageVal)) {
      const age = Number(ageVal);
      if (!isNaN(age) && (age < config.ageMin || age > config.ageMax)) {
        issues.push({
          id: generateId(),
          checkType: 'range_age',
          category: 'range',
          severity: age < 0 ? 'error' : 'warning',
          recordIds: [record.id],
          field: mapping.age,
          message: `Age out of expected range (${config.ageMin}-${config.ageMax})`,
          details: `Age: ${age}`,
        });
      }
    }
  }

  return issues;
}

// Check logic: confirmed case needs positive lab
function checkConfirmedNeedsPositive(
  records: CaseRecord[],
  mapping: DataQualityFieldMapping,
  config: DataQualityConfig
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (!mapping.caseStatus || !mapping.labResult) return issues;

  for (const record of records) {
    const status = getFieldValue(record, mapping.caseStatus);
    const labResult = getFieldValue(record, mapping.labResult);

    if (!isEmpty(status) && config.confirmedStatusValues.includes(String(status))) {
      // Case is confirmed, check if lab is positive
      if (isEmpty(labResult) || !config.positiveLabValues.includes(String(labResult))) {
        issues.push({
          id: generateId(),
          checkType: 'logic_confirmed_needs_positive',
          category: 'logic',
          severity: 'warning',
          recordIds: [record.id],
          field: mapping.labResult,
          message: 'Confirmed case without positive lab result',
          details: `Status: ${status}, Lab: ${labResult || '(empty)'}`,
        });
      }
    }
  }

  return issues;
}

// Check logic: hospitalized needs hospital name
function checkHospitalizedNeedsHospital(
  records: CaseRecord[],
  mapping: DataQualityFieldMapping
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (!mapping.hospitalized || !mapping.hospitalName) return issues;

  const yesValues = ['yes', 'y', 'true', '1'];

  for (const record of records) {
    const hospitalized = getFieldValue(record, mapping.hospitalized);
    const hospitalName = getFieldValue(record, mapping.hospitalName);

    if (!isEmpty(hospitalized) && yesValues.includes(String(hospitalized).toLowerCase())) {
      if (isEmpty(hospitalName)) {
        issues.push({
          id: generateId(),
          checkType: 'logic_hospitalized_needs_hospital',
          category: 'logic',
          severity: 'warning',
          recordIds: [record.id],
          field: mapping.hospitalName,
          message: 'Hospitalized but no hospital name',
        });
      }
    }
  }

  return issues;
}

// Check logic: deceased needs death date
function checkDeceasedNeedsDate(
  records: CaseRecord[],
  mapping: DataQualityFieldMapping
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (!mapping.outcome || !mapping.deathDate) return issues;

  const deceasedValues = ['deceased', 'dead', 'died', 'death', 'fatal'];

  for (const record of records) {
    const outcome = getFieldValue(record, mapping.outcome);
    const deathDate = getFieldValue(record, mapping.deathDate);

    if (!isEmpty(outcome) && deceasedValues.includes(String(outcome).toLowerCase())) {
      if (isEmpty(deathDate)) {
        issues.push({
          id: generateId(),
          checkType: 'logic_deceased_needs_date',
          category: 'logic',
          severity: 'warning',
          recordIds: [record.id],
          field: mapping.deathDate,
          message: 'Deceased outcome but no death date',
        });
      }
    }
  }

  return issues;
}

// Main function to run all enabled checks
export function runDataQualityChecks(
  records: CaseRecord[],
  columns: DataColumn[],
  config: DataQualityConfig
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const { enabledChecks, fieldMapping } = config;

  // Duplicate checks
  if (enabledChecks.includes('duplicate_exact')) {
    issues.push(...checkExactDuplicates(records, columns));
  }
  if (enabledChecks.includes('duplicate_key')) {
    issues.push(...checkKeyDuplicates(records, fieldMapping));
  }

  // Temporal checks
  if (enabledChecks.includes('temporal_onset_after_exposure')) {
    issues.push(...checkOnsetAfterExposure(records, fieldMapping));
  }
  if (enabledChecks.includes('temporal_onset_before_report')) {
    issues.push(...checkOnsetBeforeReport(records, fieldMapping));
  }
  if (enabledChecks.includes('temporal_death_after_onset')) {
    issues.push(...checkDeathAfterOnset(records, fieldMapping));
  }
  if (enabledChecks.includes('temporal_future_date')) {
    issues.push(...checkFutureDates(records, columns));
  }

  // Completeness checks
  if (enabledChecks.includes('completeness_required')) {
    issues.push(...checkRequiredFields(records, fieldMapping, columns));
  }

  // Range checks
  if (enabledChecks.includes('range_age')) {
    issues.push(...checkAgeRange(records, fieldMapping, config));
  }

  // Logic checks
  if (enabledChecks.includes('logic_confirmed_needs_positive')) {
    issues.push(...checkConfirmedNeedsPositive(records, fieldMapping, config));
  }
  if (enabledChecks.includes('logic_hospitalized_needs_hospital')) {
    issues.push(...checkHospitalizedNeedsHospital(records, fieldMapping));
  }
  if (enabledChecks.includes('logic_deceased_needs_date')) {
    issues.push(...checkDeceasedNeedsDate(records, fieldMapping));
  }

  return issues;
}

// Get human-readable check name
export function getCheckName(checkType: DataQualityCheckType): string {
  const names: Record<DataQualityCheckType, string> = {
    duplicate_exact: 'Exact Duplicates',
    duplicate_key: 'Key Field Duplicates',
    temporal_onset_after_exposure: 'Onset After Exposure',
    temporal_onset_before_report: 'Onset Before Report',
    temporal_death_after_onset: 'Death After Onset',
    temporal_future_date: 'Future Dates',
    temporal_date_range: 'Date Range',
    logic_confirmed_needs_positive: 'Confirmed Needs Positive Lab',
    logic_hospitalized_needs_hospital: 'Hospitalized Needs Hospital',
    logic_deceased_needs_date: 'Deceased Needs Death Date',
    completeness_required: 'Required Fields',
    range_age: 'Age Range',
  };
  return names[checkType] || checkType;
}

// Get category display name
export function getCategoryName(category: DataQualityIssue['category']): string {
  const names: Record<DataQualityIssue['category'], string> = {
    duplicate: 'Duplicates',
    temporal: 'Date/Time Issues',
    logic: 'Logic Issues',
    completeness: 'Missing Data',
    range: 'Out of Range',
  };
  return names[category] || category;
}

// Group issues by category
export function groupIssuesByCategory(
  issues: DataQualityIssue[]
): Record<DataQualityIssue['category'], DataQualityIssue[]> {
  const grouped: Record<DataQualityIssue['category'], DataQualityIssue[]> = {
    duplicate: [],
    temporal: [],
    logic: [],
    completeness: [],
    range: [],
  };

  for (const issue of issues) {
    grouped[issue.category].push(issue);
  }

  return grouped;
}
