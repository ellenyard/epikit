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
    variableName: 'case_id',
    required: true,
    placeholder: 'e.g., CASE-001',
    width: '1/3',
  } as FormField,
  {
    id: 'report_date',
    type: 'date',
    label: 'Date Reported',
    variableName: 'report_date',
    required: true,
    width: '1/3',
  } as FormField,
  {
    id: 'onset_date',
    type: 'date',
    label: 'Symptom Onset Date',
    variableName: 'onset_date',
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
    variableName: 'age',
    required: true,
    validation: { min: 0, max: 120 },
    width: '1/4',
  } as FormField,
  {
    id: 'sex',
    type: 'dropdown',
    label: 'Sex',
    variableName: 'sex',
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
    variableName: 'occupation',
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
    variableName: 'symptoms',
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
    variableName: 'hospitalized',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'outcome',
    type: 'dropdown',
    label: 'Outcome',
    variableName: 'outcome',
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
    variableName: 'ate_potato_salad',
    required: false,
    helpText: 'At the community picnic on Jan 10',
    width: '1/3',
  } as FormField,
  {
    id: 'ate_chicken',
    type: 'checkbox',
    label: 'Ate Grilled Chicken',
    variableName: 'ate_chicken',
    required: false,
    helpText: 'At the community picnic on Jan 10',
    width: '1/3',
  } as FormField,
  {
    id: 'ate_coleslaw',
    type: 'checkbox',
    label: 'Ate Coleslaw',
    variableName: 'ate_coleslaw',
    required: false,
    helpText: 'At the community picnic on Jan 10',
    width: '1/3',
  } as FormField,
  {
    id: 'classification',
    type: 'dropdown',
    label: 'Case Classification',
    variableName: 'classification',
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
    variableName: 'gps',
    required: false,
    helpText: 'Capture GPS coordinates of case residence',
    width: '1/2',
  } as FormField,
];

// Demo Dataset Columns (retrospective cohort study format)
export const demoColumns: DataColumn[] = [
  { key: 'participant_id', label: 'ID', type: 'text' },
  { key: 'age', label: 'Age', type: 'number' },
  { key: 'sex', label: 'Sex', type: 'text' },
  { key: 'ill', label: 'Ill', type: 'text' },
  { key: 'onset_date', label: 'Onset Date', type: 'date' },
  { key: 'onset_time', label: 'Onset Time', type: 'text' },
  { key: 'symptoms', label: 'Symptoms', type: 'text' },
  { key: 'ate_potato_salad', label: 'Potato Salad', type: 'text' },
  { key: 'ate_chicken', label: 'Grilled Chicken', type: 'text' },
  { key: 'ate_coleslaw', label: 'Coleslaw', type: 'text' },
  { key: 'ate_cake', label: 'Cake', type: 'text' },
  { key: 'drank_lemonade', label: 'Lemonade', type: 'text' },
  { key: 'latitude', label: 'Latitude', type: 'number' },
  { key: 'longitude', label: 'Longitude', type: 'number' },
];

// Retrospective Cohort Study - Community Picnic Foodborne Outbreak
// Exposure event: January 10, 2024 - Community Picnic (lunch served 12:00-2:00 PM)
// 48 attendees interviewed; suspected vehicle: Potato Salad
// Attack rates: Potato salad eaters 75% (18/24), Non-eaters 17% (4/24)
// Location: Toledo, OH area
export const demoCaseRecords: CaseRecord[] = [
  // ILL - Ate Potato Salad (18 cases) - Index case P001 at 3320 Kirkwall, Toledo, OH 43606
  { id: '1', participant_id: 'P001', age: 34, sex: 'Female', ill: 'Yes', onset_date: '2024-01-10', onset_time: '22:00', symptoms: 'Diarrhea, Cramps, Fever', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6723, longitude: -83.6145 },
  { id: '2', participant_id: 'P002', age: 28, sex: 'Male', ill: 'Yes', onset_date: '2024-01-11', onset_time: '02:00', symptoms: 'Diarrhea, Vomiting, Fever', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6652, longitude: -83.5822 },
  { id: '3', participant_id: 'P003', age: 67, sex: 'Male', ill: 'Yes', onset_date: '2024-01-11', onset_time: '06:00', symptoms: 'Diarrhea, Cramps, Bloody stool', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', latitude: 41.6534, longitude: -83.5356 },
  { id: '4', participant_id: 'P004', age: 45, sex: 'Female', ill: 'Yes', onset_date: '2024-01-11', onset_time: '08:00', symptoms: 'Diarrhea, Nausea, Cramps', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'No', latitude: 41.6891, longitude: -83.6278 },
  { id: '5', participant_id: 'P005', age: 52, sex: 'Male', ill: 'Yes', onset_date: '2024-01-11', onset_time: '10:00', symptoms: 'Diarrhea, Vomiting, Fever', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6445, longitude: -83.5512 },
  { id: '6', participant_id: 'P006', age: 8, sex: 'Female', ill: 'Yes', onset_date: '2024-01-11', onset_time: '04:00', symptoms: 'Diarrhea, Vomiting, Cramps', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6778, longitude: -83.6034 },
  { id: '7', participant_id: 'P007', age: 41, sex: 'Male', ill: 'Yes', onset_date: '2024-01-11', onset_time: '12:00', symptoms: 'Diarrhea, Fever', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'No', drank_lemonade: 'Yes', latitude: 41.6312, longitude: -83.5689 },
  { id: '8', participant_id: 'P008', age: 36, sex: 'Female', ill: 'Yes', onset_date: '2024-01-11', onset_time: '14:00', symptoms: 'Diarrhea, Nausea, Cramps, Fever', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', latitude: 41.6623, longitude: -83.6189 },
  { id: '9', participant_id: 'P009', age: 29, sex: 'Male', ill: 'Yes', onset_date: '2024-01-11', onset_time: '16:00', symptoms: 'Diarrhea, Cramps', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6956, longitude: -83.5467 },
  { id: '10', participant_id: 'P010', age: 55, sex: 'Female', ill: 'Yes', onset_date: '2024-01-11', onset_time: '18:00', symptoms: 'Diarrhea, Vomiting, Fever', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_cake: 'No', drank_lemonade: 'Yes', latitude: 41.6489, longitude: -83.5934 },
  { id: '11', participant_id: 'P011', age: 72, sex: 'Female', ill: 'Yes', onset_date: '2024-01-11', onset_time: '20:00', symptoms: 'Diarrhea, Cramps, Bloody stool, Fever', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6834, longitude: -83.5623 },
  { id: '12', participant_id: 'P012', age: 19, sex: 'Male', ill: 'Yes', onset_date: '2024-01-11', onset_time: '22:00', symptoms: 'Diarrhea, Nausea', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', latitude: 41.6567, longitude: -83.6312 },
  { id: '13', participant_id: 'P013', age: 38, sex: 'Female', ill: 'Yes', onset_date: '2024-01-12', onset_time: '00:00', symptoms: 'Diarrhea, Cramps, Fever', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'No', drank_lemonade: 'Yes', latitude: 41.6401, longitude: -83.5178 },
  { id: '14', participant_id: 'P014', age: 61, sex: 'Male', ill: 'Yes', onset_date: '2024-01-12', onset_time: '06:00', symptoms: 'Diarrhea, Vomiting', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6712, longitude: -83.5845 },
  { id: '15', participant_id: 'P015', age: 5, sex: 'Male', ill: 'Yes', onset_date: '2024-01-11', onset_time: '03:00', symptoms: 'Diarrhea, Vomiting, Fever', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6678, longitude: -83.6078 },
  { id: '16', participant_id: 'P016', age: 48, sex: 'Female', ill: 'Yes', onset_date: '2024-01-11', onset_time: '11:00', symptoms: 'Diarrhea, Cramps', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', latitude: 41.6523, longitude: -83.5589 },
  { id: '17', participant_id: 'P017', age: 33, sex: 'Male', ill: 'Yes', onset_date: '2024-01-11', onset_time: '15:00', symptoms: 'Diarrhea, Nausea, Fever', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'No', drank_lemonade: 'Yes', latitude: 41.6867, longitude: -83.5734 },
  { id: '18', participant_id: 'P018', age: 59, sex: 'Female', ill: 'Yes', onset_date: '2024-01-12', onset_time: '02:00', symptoms: 'Diarrhea, Cramps, Vomiting', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6345, longitude: -83.6023 },

  // NOT ILL - Ate Potato Salad (6 people - some resistance/lower dose)
  { id: '19', participant_id: 'P019', age: 25, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6612, longitude: -83.5456 },
  { id: '20', participant_id: 'P020', age: 31, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'No', drank_lemonade: 'No', latitude: 41.6789, longitude: -83.5912 },
  { id: '21', participant_id: 'P021', age: 44, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6456, longitude: -83.6234 },
  { id: '22', participant_id: 'P022', age: 27, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6934, longitude: -83.5678 },
  { id: '23', participant_id: 'P023', age: 39, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_cake: 'No', drank_lemonade: 'Yes', latitude: 41.6378, longitude: -83.5523 },
  { id: '24', participant_id: 'P024', age: 56, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', latitude: 41.6701, longitude: -83.6156 },

  // ILL - Did NOT Eat Potato Salad (4 cases - background illness or cross-contamination)
  { id: '25', participant_id: 'P025', age: 42, sex: 'Male', ill: 'Yes', onset_date: '2024-01-11', onset_time: '19:00', symptoms: 'Nausea, Cramps', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6534, longitude: -83.5867 },
  { id: '26', participant_id: 'P026', age: 63, sex: 'Female', ill: 'Yes', onset_date: '2024-01-12', onset_time: '08:00', symptoms: 'Diarrhea', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6845, longitude: -83.5389 },
  { id: '27', participant_id: 'P027', age: 15, sex: 'Male', ill: 'Yes', onset_date: '2024-01-11', onset_time: '23:00', symptoms: 'Diarrhea, Nausea', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', latitude: 41.6423, longitude: -83.6089 },
  { id: '28', participant_id: 'P028', age: 37, sex: 'Female', ill: 'Yes', onset_date: '2024-01-12', onset_time: '04:00', symptoms: 'Cramps, Nausea', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', latitude: 41.6689, longitude: -83.5534 },

  // NOT ILL - Did NOT Eat Potato Salad (20 people - the healthy unexposed)
  { id: '29', participant_id: 'P029', age: 50, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6567, longitude: -83.5712 },
  { id: '30', participant_id: 'P030', age: 22, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', latitude: 41.6912, longitude: -83.6045 },
  { id: '31', participant_id: 'P031', age: 35, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6345, longitude: -83.5278 },
  { id: '32', participant_id: 'P032', age: 68, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', latitude: 41.6756, longitude: -83.5956 },
  { id: '33', participant_id: 'P033', age: 12, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6478, longitude: -83.6178 },
  { id: '34', participant_id: 'P034', age: 46, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', latitude: 41.6623, longitude: -83.5423 },
  { id: '35', participant_id: 'P035', age: 30, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'No', drank_lemonade: 'Yes', latitude: 41.6889, longitude: -83.5789 },
  { id: '36', participant_id: 'P036', age: 58, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6412, longitude: -83.5634 },
  { id: '37', participant_id: 'P037', age: 24, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'No', latitude: 41.6734, longitude: -83.6267 },
  { id: '38', participant_id: 'P038', age: 71, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6501, longitude: -83.5145 },
  { id: '39', participant_id: 'P039', age: 40, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'No', drank_lemonade: 'Yes', latitude: 41.6856, longitude: -83.5512 },
  { id: '40', participant_id: 'P040', age: 17, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6389, longitude: -83.5978 },
  { id: '41', participant_id: 'P041', age: 53, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', latitude: 41.6678, longitude: -83.5334 },
  { id: '42', participant_id: 'P042', age: 26, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6945, longitude: -83.6123 },
  { id: '43', participant_id: 'P043', age: 64, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', latitude: 41.6312, longitude: -83.5856 },
  { id: '44', participant_id: 'P044', age: 32, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6589, longitude: -83.6034 },
  { id: '45', participant_id: 'P045', age: 47, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', latitude: 41.6801, longitude: -83.5467 },
  { id: '46', participant_id: 'P046', age: 20, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6456, longitude: -83.5723 },
  { id: '47', participant_id: 'P047', age: 43, sex: 'Male', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', latitude: 41.6723, longitude: -83.5189 },
  { id: '48', participant_id: 'P048', age: 75, sex: 'Female', ill: 'No', onset_date: '', onset_time: '', symptoms: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', latitude: 41.6634, longitude: -83.5945 },
];

export const demoDatasetName = 'Foodborne Outbreak - Community Picnic';
