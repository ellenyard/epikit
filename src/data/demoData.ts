import type { FormItem, FormField, LayoutElement } from '../types/form';
import type { DataColumn, CaseRecord } from '../types/analysis';

// Demo Form: Foodborne Outbreak Investigation
export const demoFormItems: FormItem[] = [
  // Section: Case Information
  {
    id: 'section-case-info',
    type: 'section',
    content: 'Case Information',
    width: 'full',
  } as LayoutElement,
  {
    id: 'case_id',
    type: 'text',
    label: 'Case ID',
    required: true,
    placeholder: 'e.g., CASE-001',
    width: '1/3',
  } as FormField,
  {
    id: 'report_date',
    type: 'date',
    label: 'Date Reported',
    required: true,
    width: '1/3',
  } as FormField,
  {
    id: 'onset_date',
    type: 'date',
    label: 'Symptom Onset Date',
    required: true,
    helpText: 'Date when symptoms first appeared',
    width: '1/3',
  } as FormField,

  // Section: Demographics
  {
    id: 'section-demographics',
    type: 'section',
    content: 'Demographics',
    width: 'full',
  } as LayoutElement,
  {
    id: 'age',
    type: 'number',
    label: 'Age (years)',
    required: true,
    validation: { min: 0, max: 120 },
    width: '1/4',
  } as FormField,
  {
    id: 'sex',
    type: 'dropdown',
    label: 'Sex',
    required: true,
    options: [
      { label: 'Male', value: 'male' },
      { label: 'Female', value: 'female' },
      { label: 'Other', value: 'other' },
    ],
    width: '1/4',
  } as FormField,
  {
    id: 'occupation',
    type: 'text',
    label: 'Occupation',
    required: false,
    width: '1/2',
  } as FormField,

  // Section: Clinical Information
  {
    id: 'section-clinical',
    type: 'section',
    content: 'Clinical Information',
    width: 'full',
  } as LayoutElement,
  {
    id: 'instruction-symptoms',
    type: 'instruction',
    content: 'Select all symptoms the patient experienced. Note the primary symptom for severity assessment.',
    width: 'full',
  } as LayoutElement,
  {
    id: 'symptoms',
    type: 'multiselect',
    label: 'Symptoms',
    required: true,
    options: [
      { label: 'Diarrhea', value: 'diarrhea' },
      { label: 'Vomiting', value: 'vomiting' },
      { label: 'Nausea', value: 'nausea' },
      { label: 'Abdominal cramps', value: 'cramps' },
      { label: 'Fever', value: 'fever' },
      { label: 'Bloody stool', value: 'bloody_stool' },
    ],
    width: '1/2',
  } as FormField,
  {
    id: 'hospitalized',
    type: 'checkbox',
    label: 'Hospitalized',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'outcome',
    type: 'dropdown',
    label: 'Outcome',
    required: true,
    options: [
      { label: 'Recovered', value: 'recovered' },
      { label: 'Hospitalized', value: 'hospitalized' },
      { label: 'Deceased', value: 'deceased' },
      { label: 'Unknown', value: 'unknown' },
    ],
    width: '1/4',
  } as FormField,

  // Divider
  {
    id: 'divider-1',
    type: 'divider',
    content: '',
    width: 'full',
  } as LayoutElement,

  // Section: Exposure Information
  {
    id: 'section-exposure',
    type: 'section',
    content: 'Exposure Information',
    width: 'full',
  } as LayoutElement,
  {
    id: 'ate_potato_salad',
    type: 'checkbox',
    label: 'Ate Potato Salad',
    required: false,
    helpText: 'At the community picnic on Jan 10',
    width: '1/3',
  } as FormField,
  {
    id: 'ate_chicken',
    type: 'checkbox',
    label: 'Ate Grilled Chicken',
    required: false,
    helpText: 'At the community picnic on Jan 10',
    width: '1/3',
  } as FormField,
  {
    id: 'ate_coleslaw',
    type: 'checkbox',
    label: 'Ate Coleslaw',
    required: false,
    helpText: 'At the community picnic on Jan 10',
    width: '1/3',
  } as FormField,
  {
    id: 'classification',
    type: 'dropdown',
    label: 'Case Classification',
    required: true,
    options: [
      { label: 'Confirmed', value: 'confirmed' },
      { label: 'Probable', value: 'probable' },
      { label: 'Suspected', value: 'suspected' },
    ],
    width: '1/2',
  } as FormField,

  // Section: Location
  {
    id: 'section-location',
    type: 'section',
    content: 'Location',
    width: 'full',
  } as LayoutElement,
  {
    id: 'gps',
    type: 'gps',
    label: 'Case Location',
    required: false,
    helpText: 'Capture GPS coordinates of case residence',
    width: '1/2',
  } as FormField,
];

// Demo Dataset Columns (matching the form fields)
export const demoColumns: DataColumn[] = [
  { key: 'case_id', label: 'Case ID', type: 'text' },
  { key: 'report_date', label: 'Date Reported', type: 'date' },
  { key: 'onset_date', label: 'Symptom Onset Date', type: 'date' },
  { key: 'age', label: 'Age (years)', type: 'number' },
  { key: 'sex', label: 'Sex', type: 'text' },
  { key: 'occupation', label: 'Occupation', type: 'text' },
  { key: 'symptoms', label: 'Symptoms', type: 'text' },
  { key: 'hospitalized', label: 'Hospitalized', type: 'text' },
  { key: 'outcome', label: 'Outcome', type: 'text' },
  { key: 'ate_potato_salad', label: 'Ate Potato Salad', type: 'text' },
  { key: 'ate_chicken', label: 'Ate Grilled Chicken', type: 'text' },
  { key: 'ate_coleslaw', label: 'Ate Coleslaw', type: 'text' },
  { key: 'classification', label: 'Case Classification', type: 'text' },
  { key: 'latitude', label: 'Latitude', type: 'number' },
  { key: 'longitude', label: 'Longitude', type: 'number' },
];

// Demo Case Records - Simulated foodborne outbreak at a community picnic
// Exposure event: January 10, 2024 - Community Picnic
// Suspected vehicle: Potato Salad (Salmonella - typical incubation 12-72 hours)
export const demoCaseRecords: CaseRecord[] = [
  // Wave 1: Early cases (12-24 hours post-exposure)
  { id: '1', case_id: 'FB-001', report_date: '2024-01-11', onset_date: '2024-01-11', age: 34, sex: 'Female', occupation: 'Teacher', symptoms: 'Diarrhea, Cramps, Fever', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', classification: 'Confirmed', latitude: 33.7490, longitude: -84.3880 },
  { id: '2', case_id: 'FB-002', report_date: '2024-01-11', onset_date: '2024-01-11', age: 28, sex: 'Male', occupation: 'Engineer', symptoms: 'Diarrhea, Vomiting, Fever', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', classification: 'Confirmed', latitude: 33.7550, longitude: -84.3900 },
  { id: '3', case_id: 'FB-003', report_date: '2024-01-11', onset_date: '2024-01-11', age: 67, sex: 'Male', occupation: 'Retired', symptoms: 'Diarrhea, Cramps, Bloody stool', hospitalized: 'Yes', outcome: 'Hospitalized', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', classification: 'Confirmed', latitude: 33.7620, longitude: -84.3850 },

  // Wave 2: Peak (24-48 hours post-exposure)
  { id: '4', case_id: 'FB-004', report_date: '2024-01-12', onset_date: '2024-01-12', age: 45, sex: 'Female', occupation: 'Nurse', symptoms: 'Diarrhea, Nausea, Cramps', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', classification: 'Confirmed', latitude: 33.7440, longitude: -84.3950 },
  { id: '5', case_id: 'FB-005', report_date: '2024-01-12', onset_date: '2024-01-12', age: 52, sex: 'Male', occupation: 'Manager', symptoms: 'Diarrhea, Vomiting, Fever', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', classification: 'Confirmed', latitude: 33.7580, longitude: -84.3780 },
  { id: '6', case_id: 'FB-006', report_date: '2024-01-12', onset_date: '2024-01-12', age: 8, sex: 'Female', occupation: 'Student', symptoms: 'Diarrhea, Vomiting, Cramps', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', classification: 'Confirmed', latitude: 33.7400, longitude: -84.3820 },
  { id: '7', case_id: 'FB-007', report_date: '2024-01-12', onset_date: '2024-01-12', age: 41, sex: 'Male', occupation: 'Chef', symptoms: 'Diarrhea, Fever', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', classification: 'Confirmed', latitude: 33.7680, longitude: -84.3920 },
  { id: '8', case_id: 'FB-008', report_date: '2024-01-12', onset_date: '2024-01-12', age: 36, sex: 'Female', occupation: 'Lawyer', symptoms: 'Diarrhea, Nausea, Cramps, Fever', hospitalized: 'Yes', outcome: 'Hospitalized', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', classification: 'Confirmed', latitude: 33.7520, longitude: -84.3720 },
  { id: '9', case_id: 'FB-009', report_date: '2024-01-12', onset_date: '2024-01-12', age: 29, sex: 'Male', occupation: 'Sales', symptoms: 'Diarrhea, Cramps', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', classification: 'Probable', latitude: 33.7460, longitude: -84.3860 },
  { id: '10', case_id: 'FB-010', report_date: '2024-01-12', onset_date: '2024-01-12', age: 55, sex: 'Female', occupation: 'Accountant', symptoms: 'Diarrhea, Vomiting, Fever', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', classification: 'Confirmed', latitude: 33.7590, longitude: -84.3980 },

  // Wave 3: Late cases (48-72 hours post-exposure)
  { id: '11', case_id: 'FB-011', report_date: '2024-01-13', onset_date: '2024-01-13', age: 72, sex: 'Female', occupation: 'Retired', symptoms: 'Diarrhea, Cramps, Bloody stool, Fever', hospitalized: 'Yes', outcome: 'Hospitalized', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', classification: 'Confirmed', latitude: 33.7350, longitude: -84.3750 },
  { id: '12', case_id: 'FB-012', report_date: '2024-01-13', onset_date: '2024-01-13', age: 19, sex: 'Male', occupation: 'Student', symptoms: 'Diarrhea, Nausea', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', classification: 'Probable', latitude: 33.7700, longitude: -84.3800 },
  { id: '13', case_id: 'FB-013', report_date: '2024-01-13', onset_date: '2024-01-13', age: 38, sex: 'Female', occupation: 'Doctor', symptoms: 'Diarrhea, Cramps, Fever', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', classification: 'Confirmed', latitude: 33.7480, longitude: -84.4000 },
  { id: '14', case_id: 'FB-014', report_date: '2024-01-13', onset_date: '2024-01-13', age: 61, sex: 'Male', occupation: 'Retired', symptoms: 'Diarrhea, Vomiting', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', classification: 'Suspected', latitude: 33.7560, longitude: -84.3680 },

  // Controls (attended picnic but not ill, for 2x2 analysis reference)
  // Note: In a real investigation, you'd also collect data from non-ill attendees
  // These are ill people who did NOT eat potato salad (to show association)
  { id: '15', case_id: 'FB-015', report_date: '2024-01-12', onset_date: '2024-01-12', age: 42, sex: 'Male', occupation: 'Electrician', symptoms: 'Nausea, Cramps', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', classification: 'Suspected', latitude: 33.7420, longitude: -84.3890 },
  { id: '16', case_id: 'FB-016', report_date: '2024-01-14', onset_date: '2024-01-13', age: 33, sex: 'Female', occupation: 'Designer', symptoms: 'Diarrhea', hospitalized: 'No', outcome: 'Recovered', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', classification: 'Suspected', latitude: 33.7640, longitude: -84.3840 },
];

export const demoDatasetName = 'Foodborne Outbreak - Community Picnic (Jan 2024)';
