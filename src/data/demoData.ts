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
    id: 'participant_id',
    type: 'text',
    label: 'Participant ID',
    variableName: 'participant_id',
    required: true,
    placeholder: 'e.g., P001',
    width: '1/3',
  } as FormField,
  {
    id: 'onset_date',
    type: 'date',
    label: 'Symptom Onset Date',
    variableName: 'onset_date',
    required: false,
    helpText: 'Date when symptoms first appeared',
    width: '1/3',
  } as FormField,
  {
    id: 'onset_time',
    type: 'text',
    label: 'Symptom Onset Time',
    variableName: 'onset_time',
    required: false,
    placeholder: 'e.g., 14:00',
    helpText: '24-hour format (HH:MM)',
    width: '1/3',
  } as FormField,
  {
    id: 'hospitalization_date',
    type: 'date',
    label: 'Hospitalization Date',
    variableName: 'hospitalization_date',
    required: false,
    helpText: 'Date admitted to hospital (if applicable)',
    width: '1/3',
  } as FormField,
  {
    id: 'specimen_date',
    type: 'date',
    label: 'Specimen Collection Date',
    variableName: 'specimen_date',
    required: false,
    helpText: 'Date specimen was collected for lab testing',
    width: '1/3',
  } as FormField,
  {
    id: 'interview_date',
    type: 'date',
    label: 'Interview Date',
    variableName: 'interview_date',
    required: false,
    helpText: 'Date when participant was interviewed',
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
      { label: 'Male', value: 'Male' },
      { label: 'Female', value: 'Female' },
    ],
    width: '1/4',
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
    content: 'Select all symptoms the participant experienced.',
    width: 'full',
  } as LayoutElement,
  {
    id: 'diarrhea',
    type: 'checkbox',
    label: 'Diarrhea',
    variableName: 'diarrhea',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'vomiting',
    type: 'checkbox',
    label: 'Vomiting',
    variableName: 'vomiting',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'nausea',
    type: 'checkbox',
    label: 'Nausea',
    variableName: 'nausea',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'cramps',
    type: 'checkbox',
    label: 'Abdominal Cramps',
    variableName: 'cramps',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'fever',
    type: 'checkbox',
    label: 'Fever',
    variableName: 'fever',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'bloody_stool',
    type: 'checkbox',
    label: 'Bloody Stool',
    variableName: 'bloody_stool',
    required: false,
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
    id: 'instruction-exposure',
    type: 'instruction',
    content: 'At the community picnic on January 10, 2024',
    width: 'full',
  } as LayoutElement,
  {
    id: 'ate_potato_salad',
    type: 'checkbox',
    label: 'Potato Salad',
    variableName: 'ate_potato_salad',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'ate_chicken',
    type: 'checkbox',
    label: 'Grilled Chicken',
    variableName: 'ate_chicken',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'ate_coleslaw',
    type: 'checkbox',
    label: 'Coleslaw',
    variableName: 'ate_coleslaw',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'ate_hamburger',
    type: 'checkbox',
    label: 'Hamburger',
    variableName: 'ate_hamburger',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'ate_hotdog',
    type: 'checkbox',
    label: 'Hot Dog',
    variableName: 'ate_hotdog',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'ate_fruit_salad',
    type: 'checkbox',
    label: 'Fruit Salad',
    variableName: 'ate_fruit_salad',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'ate_cake',
    type: 'checkbox',
    label: 'Cake',
    variableName: 'ate_cake',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'drank_lemonade',
    type: 'checkbox',
    label: 'Lemonade',
    variableName: 'drank_lemonade',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'drank_iced_tea',
    type: 'checkbox',
    label: 'Iced Tea',
    variableName: 'drank_iced_tea',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'case_status',
    type: 'dropdown',
    label: 'Case Status',
    variableName: 'case_status',
    required: false,
    options: [
      { label: 'Confirmed', value: 'Confirmed' },
      { label: 'Probable', value: 'Probable' },
      { label: 'Suspected', value: 'Suspected' },
      { label: 'Not a case', value: 'Not a case' },
    ],
    width: '1/4',
  } as FormField,

  // Section: Location
  {
    id: 'section-location',
    type: 'section',
    content: 'Location',
    width: 'full',
  } as LayoutElement,
  {
    id: 'latitude',
    type: 'number',
    label: 'Latitude',
    variableName: 'latitude',
    required: false,
    helpText: 'Decimal degrees (e.g., 41.6723)',
    placeholder: '41.6723',
    width: '1/2',
  } as FormField,
  {
    id: 'longitude',
    type: 'number',
    label: 'Longitude',
    variableName: 'longitude',
    required: false,
    helpText: 'Decimal degrees (e.g., -83.6145)',
    placeholder: '-83.6145',
    width: '1/2',
  } as FormField,
];

// Demo Dataset Columns (retrospective cohort study format)
export const demoColumns: DataColumn[] = [
  { key: 'participant_id', label: 'ID', type: 'text' },
  { key: 'age', label: 'Age', type: 'number' },
  { key: 'sex', label: 'Sex', type: 'categorical' },
  { key: 'case_status', label: 'Case Status', type: 'categorical' },
  { key: 'onset_date', label: 'Onset Date', type: 'date' },
  { key: 'onset_time', label: 'Onset Time', type: 'text' },
  { key: 'hospitalization_date', label: 'Hospitalization Date', type: 'date' },
  { key: 'specimen_date', label: 'Specimen Date', type: 'date' },
  { key: 'interview_date', label: 'Interview Date', type: 'date' },
  { key: 'diarrhea', label: 'Diarrhea', type: 'categorical' },
  { key: 'vomiting', label: 'Vomiting', type: 'categorical' },
  { key: 'nausea', label: 'Nausea', type: 'categorical' },
  { key: 'cramps', label: 'Abdominal Cramps', type: 'categorical' },
  { key: 'fever', label: 'Fever', type: 'categorical' },
  { key: 'bloody_stool', label: 'Bloody Stool', type: 'categorical' },
  { key: 'ate_potato_salad', label: 'Potato Salad', type: 'categorical' },
  { key: 'ate_chicken', label: 'Grilled Chicken', type: 'categorical' },
  { key: 'ate_coleslaw', label: 'Coleslaw', type: 'categorical' },
  { key: 'ate_hamburger', label: 'Hamburger', type: 'categorical' },
  { key: 'ate_hotdog', label: 'Hot Dog', type: 'categorical' },
  { key: 'ate_fruit_salad', label: 'Fruit Salad', type: 'categorical' },
  { key: 'ate_cake', label: 'Cake', type: 'categorical' },
  { key: 'drank_lemonade', label: 'Lemonade', type: 'categorical' },
  { key: 'drank_iced_tea', label: 'Iced Tea', type: 'categorical' },
  { key: 'latitude', label: 'Latitude', type: 'number' },
  { key: 'longitude', label: 'Longitude', type: 'number' },
];

// Retrospective Cohort Study - Community Picnic Foodborne Outbreak
// Exposure event: January 10, 2024 - Community Picnic (lunch served 12:00-2:00 PM)
// 48 attendees interviewed; suspected vehicle: Potato Salad
// Attack rates: Potato salad eaters 75% (18/24), Non-eaters 17% (4/24)
// Location: Toledo, OH area
// Case status: Confirmed (diarrhea + fever or bloody stool), Probable (diarrhea + GI symptoms), Suspected (mild symptoms only), Not a case (not ill)
export const demoCaseRecords: CaseRecord[] = [
  // ILL - Ate Potato Salad (18 cases) - Index case P001 at 3320 Kirkwall, Toledo, OH 43606
  { id: '1', participant_id: 'P001', age: 34, sex: 'Female', case_status: 'Confirmed', onset_date: '2024-01-10', onset_time: '22:00', hospitalization_date: '2024-01-12', specimen_date: '2024-01-11', interview_date: '2024-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6723, longitude: -83.6145 },
  { id: '2', participant_id: 'P002', age: 28, sex: 'Male', case_status: 'Confirmed', onset_date: '2024-01-11', onset_time: '02:00', hospitalization_date: '2024-01-12', specimen_date: '2024-01-11', interview_date: '2024-01-12', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6652, longitude: -83.5822 },
  { id: '3', participant_id: 'P003', age: 67, sex: 'Male', case_status: 'Confirmed', onset_date: '2024-01-11', onset_time: '06:00', hospitalization_date: '2024-01-09', specimen_date: '2024-01-11', interview_date: '2024-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'No', bloody_stool: 'Yes', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6534, longitude: -83.5356 },
  { id: '4', participant_id: 'P004', age: 45, sex: 'Female', case_status: 'Probable', onset_date: '2024-01-11', onset_time: '08:00', hospitalization_date: '', specimen_date: '2024-01-11', interview_date: '2024-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'Yes', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6891, longitude: -83.6278 },
  { id: '5', participant_id: 'P005', age: 52, sex: 'Male', case_status: 'Confirmed', onset_date: '2024-01-11', onset_time: '10:00', hospitalization_date: '2024-01-13', specimen_date: '2024-01-11', interview_date: '2024-01-12', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6445, longitude: -83.5512 },
  { id: '6', participant_id: 'P006', age: 8, sex: 'Female', case_status: 'Probable', onset_date: '2024-01-11', onset_time: '04:00', hospitalization_date: '', specimen_date: '2024-01-11', interview_date: '2024-01-12', diarrhea: 'Yes', vomiting: 'Yes', nausea: '', cramps: 'Yes', fever: '', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: '', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: '', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6778, longitude: -83.6034 },
  { id: '7', participant_id: 'P007', age: 41, sex: 'Male', case_status: 'Confirmed', onset_date: '2024-01-11', onset_time: '12:00', hospitalization_date: '2024-01-13', specimen_date: '2024-01-11', interview_date: '2024-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6312, longitude: -83.5689 },
  { id: '8', participant_id: 'P008', age: 36, sex: 'Female', case_status: 'Confirmed', onset_date: '2024-01-11', onset_time: '14:00', hospitalization_date: '2024-01-13', specimen_date: '2024-01-11', interview_date: '2024-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'Yes', cramps: 'Yes', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6623, longitude: -83.6189 },
  { id: '9', participant_id: 'P009', age: 29, sex: 'Male', case_status: 'Probable', onset_date: '2024-01-11', onset_time: '16:00', hospitalization_date: '', specimen_date: '2024-01-12', interview_date: '2024-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6956, longitude: -83.5467 },
  { id: '10', participant_id: 'P010', age: 55, sex: 'Female', case_status: 'Confirmed', onset_date: '2024-01-11', onset_time: '18:00', hospitalization_date: '2024-01-13', specimen_date: '2024-01-12', interview_date: '2024-01-13', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6489, longitude: -83.5934 },
  { id: '11', participant_id: 'P011', age: 72, sex: 'Female', case_status: 'Confirmed', onset_date: '2024-01-11', onset_time: '20:00', hospitalization_date: '2024-01-12', specimen_date: '2024-01-12', interview_date: '2024-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'Yes', bloody_stool: 'Yes', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6834, longitude: -83.5623 },
  { id: '12', participant_id: 'P012', age: 19, sex: 'Male', case_status: 'Probable', onset_date: '2024-01-11', onset_time: '22:00', hospitalization_date: '', specimen_date: '2024-01-12', interview_date: '2024-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'Yes', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6567, longitude: -83.6312 },
  { id: '13', participant_id: 'P013', age: 38, sex: 'Female', case_status: 'Confirmed', onset_date: '2024-01-12', onset_time: '00:00', hospitalization_date: '2024-01-13', specimen_date: '2024-01-12', interview_date: '2024-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6401, longitude: -83.5178 },
  { id: '14', participant_id: 'P014', age: 61, sex: 'Male', case_status: 'Probable', onset_date: '2024-01-12', onset_time: '06:00', hospitalization_date: '', specimen_date: '2024-01-12', interview_date: '2024-01-13', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: '', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: '', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: '', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: '', drank_iced_tea: 'No', latitude: 41.6712, longitude: -83.5845 },
  { id: '15', participant_id: 'P015', age: 5, sex: 'Male', case_status: 'Confirmed', onset_date: '2024-01-11', onset_time: '03:00', hospitalization_date: '2024-01-12', specimen_date: '2024-01-11', interview_date: '2024-01-12', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6678, longitude: -83.6078 },
  { id: '16', participant_id: 'P016', age: 48, sex: 'Female', case_status: 'Probable', onset_date: '2024-01-11', onset_time: '11:00', hospitalization_date: '', specimen_date: '2024-01-11', interview_date: '2024-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6523, longitude: -83.5589 },
  { id: '17', participant_id: 'P017', age: 33, sex: 'Male', case_status: 'Confirmed', onset_date: '2024-01-11', onset_time: '15:00', hospitalization_date: '2024-01-13', specimen_date: '2024-01-12', interview_date: '2024-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'Yes', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6867, longitude: -83.5734 },
  { id: '18', participant_id: 'P018', age: 59, sex: 'Female', case_status: 'Probable', onset_date: '2024-01-12', onset_time: '02:00', hospitalization_date: '', specimen_date: '2024-01-12', interview_date: '2024-01-13', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6345, longitude: -83.6023 },

  // NOT ILL - Ate Potato Salad (6 people - some resistance/lower dose)
  { id: '19', participant_id: 'P019', age: 25, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6612, longitude: -83.5456 },
  { id: '20', participant_id: 'P020', age: 31, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6789, longitude: -83.5912 },
  { id: '21', participant_id: 'P021', age: 44, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6456, longitude: -83.6234 },
  { id: '22', participant_id: 'P022', age: 27, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6934, longitude: -83.5678 },
  { id: '23', participant_id: 'P023', age: 39, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6378, longitude: -83.5523 },
  { id: '24', participant_id: 'P024', age: 56, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6701, longitude: -83.6156 },

  // ILL - Did NOT Eat Potato Salad (4 cases - background illness or cross-contamination)
  { id: '25', participant_id: 'P025', age: 42, sex: 'Male', case_status: 'Suspected', onset_date: '2024-01-11', onset_time: '19:00', hospitalization_date: '', specimen_date: '', interview_date: '2024-01-13', diarrhea: 'No', vomiting: 'No', nausea: 'Yes', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6534, longitude: -83.5867 },
  { id: '26', participant_id: 'P026', age: 63, sex: 'Female', case_status: 'Suspected', onset_date: '2024-01-12', onset_time: '08:00', hospitalization_date: '', specimen_date: '', interview_date: '2024-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6845, longitude: -83.5389 },
  { id: '27', participant_id: 'P027', age: 15, sex: 'Male', case_status: 'Probable', onset_date: '2024-01-11', onset_time: '23:00', hospitalization_date: '', specimen_date: '2024-01-12', interview_date: '2024-01-13', diarrhea: 'Yes', vomiting: '', nausea: 'Yes', cramps: 'No', fever: '', bloody_stool: '', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: '', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: '', drank_lemonade: 'No', drank_iced_tea: '', latitude: 41.6423, longitude: -83.6089 },
  { id: '28', participant_id: 'P028', age: 37, sex: 'Female', case_status: 'Suspected', onset_date: '2024-01-12', onset_time: '04:00', hospitalization_date: '', specimen_date: '', interview_date: '2024-01-13', diarrhea: 'No', vomiting: 'No', nausea: 'Yes', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6689, longitude: -83.5534 },

  // NOT ILL - Did NOT Eat Potato Salad (20 people - the healthy unexposed)
  { id: '29', participant_id: 'P029', age: 50, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6567, longitude: -83.5712 },
  { id: '30', participant_id: 'P030', age: 22, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6912, longitude: -83.6045 },
  { id: '31', participant_id: 'P031', age: 35, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6345, longitude: -83.5278 },
  { id: '32', participant_id: 'P032', age: 68, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6756, longitude: -83.5956 },
  { id: '33', participant_id: 'P033', age: 12, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6478, longitude: -83.6178 },
  { id: '34', participant_id: 'P034', age: 46, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6623, longitude: -83.5423 },
  { id: '35', participant_id: 'P035', age: 30, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6889, longitude: -83.5789 },
  { id: '36', participant_id: 'P036', age: 58, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6412, longitude: -83.5634 },
  { id: '37', participant_id: 'P037', age: 24, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6734, longitude: -83.6267 },
  { id: '38', participant_id: 'P038', age: 71, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6501, longitude: -83.5145 },
  { id: '39', participant_id: 'P039', age: 40, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6856, longitude: -83.5512 },
  { id: '40', participant_id: 'P040', age: 17, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6389, longitude: -83.5978 },
  { id: '41', participant_id: 'P041', age: 53, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6678, longitude: -83.5334 },
  { id: '42', participant_id: 'P042', age: 26, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6945, longitude: -83.6123 },
  { id: '43', participant_id: 'P043', age: 64, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6312, longitude: -83.5856 },
  { id: '44', participant_id: 'P044', age: 32, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6589, longitude: -83.6034 },
  { id: '45', participant_id: 'P045', age: 47, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6801, longitude: -83.5467 },
  { id: '46', participant_id: 'P046', age: 20, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6456, longitude: -83.5723 },
  { id: '47', participant_id: 'P047', age: 43, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6723, longitude: -83.5189 },
  { id: '48', participant_id: 'P048', age: 75, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6634, longitude: -83.5945 },
];

export const demoDatasetName = 'Foodborne Outbreak - Community Picnic';

// =============================================================================
// FORM TEMPLATES
// Pre-built forms for common epidemiological investigations.
// Users can start from these templates instead of building from scratch.
// =============================================================================

/**
 * Contact Tracing Form Template
 *
 * Standard form for contact tracing during infectious disease outbreaks.
 * Captures: contact demographics, exposure details, symptom monitoring,
 * and follow-up information.
 *
 * Based on CDC contact tracing guidance for respiratory illnesses.
 */
export const contactTracingFormItems: FormItem[] = [
  // Section: Index Case Reference
  {
    id: 'section-index-case',
    type: 'section',
    content: 'Index Case Reference',
    width: 'full',
  } as LayoutElement,
  {
    id: 'instruction-index',
    type: 'instruction',
    content: 'Link this contact to the case they were exposed to.',
    width: 'full',
  } as LayoutElement,
  {
    id: 'index_case_id',
    type: 'text',
    label: 'Index Case ID',
    variableName: 'index_case_id',
    required: true,
    placeholder: 'e.g., CASE-001',
    helpText: 'The ID of the confirmed/probable case this contact was exposed to',
    width: '1/2',
  } as FormField,
  {
    id: 'contact_id',
    type: 'text',
    label: 'Contact ID',
    variableName: 'contact_id',
    required: true,
    placeholder: 'e.g., CT-001',
    helpText: 'Unique identifier for this contact',
    width: '1/2',
  } as FormField,

  // Section: Contact Demographics
  {
    id: 'section-demographics',
    type: 'section',
    content: 'Contact Demographics',
    width: 'full',
  } as LayoutElement,
  {
    id: 'contact_name',
    type: 'text',
    label: 'Contact Name',
    variableName: 'contact_name',
    required: true,
    placeholder: 'Full name',
    width: '1/2',
  } as FormField,
  {
    id: 'contact_phone',
    type: 'text',
    label: 'Phone Number',
    variableName: 'contact_phone',
    required: true,
    placeholder: 'e.g., 555-123-4567',
    width: '1/2',
  } as FormField,
  {
    id: 'contact_age',
    type: 'number',
    label: 'Age (years)',
    variableName: 'contact_age',
    required: false,
    validation: { min: 0, max: 120 },
    width: '1/4',
  } as FormField,
  {
    id: 'contact_sex',
    type: 'dropdown',
    label: 'Sex',
    variableName: 'contact_sex',
    required: false,
    options: [
      { label: 'Male', value: 'Male' },
      { label: 'Female', value: 'Female' },
    ],
    width: '1/4',
  } as FormField,
  {
    id: 'contact_address',
    type: 'text',
    label: 'Address',
    variableName: 'contact_address',
    required: false,
    placeholder: 'Street address, city',
    width: '1/2',
  } as FormField,

  // Section: Exposure Information
  {
    id: 'divider-1',
    type: 'divider',
    content: '',
    width: 'full',
  } as LayoutElement,
  {
    id: 'section-exposure',
    type: 'section',
    content: 'Exposure Information',
    width: 'full',
  } as LayoutElement,
  {
    id: 'exposure_date',
    type: 'date',
    label: 'Date of Exposure',
    variableName: 'exposure_date',
    required: true,
    helpText: 'Date when contact was exposed to the index case',
    width: '1/3',
  } as FormField,
  {
    id: 'last_contact_date',
    type: 'date',
    label: 'Last Contact Date',
    variableName: 'last_contact_date',
    required: false,
    helpText: 'Most recent date of contact with index case',
    width: '1/3',
  } as FormField,
  {
    id: 'exposure_setting',
    type: 'dropdown',
    label: 'Exposure Setting',
    variableName: 'exposure_setting',
    required: true,
    options: [
      { label: 'Household', value: 'Household' },
      { label: 'Workplace', value: 'Workplace' },
      { label: 'School', value: 'School' },
      { label: 'Healthcare', value: 'Healthcare' },
      { label: 'Social gathering', value: 'Social gathering' },
      { label: 'Transportation', value: 'Transportation' },
      { label: 'Other', value: 'Other' },
    ],
    width: '1/3',
  } as FormField,
  {
    id: 'exposure_duration',
    type: 'dropdown',
    label: 'Exposure Duration',
    variableName: 'exposure_duration',
    required: false,
    helpText: 'Approximate total time spent with index case',
    options: [
      { label: '< 15 minutes', value: '<15min' },
      { label: '15-60 minutes', value: '15-60min' },
      { label: '1-4 hours', value: '1-4hrs' },
      { label: '> 4 hours', value: '>4hrs' },
      { label: 'Lives together', value: 'Cohabitant' },
    ],
    width: '1/3',
  } as FormField,
  {
    id: 'contact_type',
    type: 'dropdown',
    label: 'Contact Type',
    variableName: 'contact_type',
    required: true,
    options: [
      { label: 'Close contact (< 6 feet)', value: 'Close' },
      { label: 'Casual contact', value: 'Casual' },
      { label: 'Healthcare worker', value: 'HCW' },
    ],
    width: '1/3',
  } as FormField,
  {
    id: 'ppe_used',
    type: 'checkbox',
    label: 'PPE Used During Exposure',
    variableName: 'ppe_used',
    required: false,
    helpText: 'Was the contact wearing a mask or other PPE?',
    width: '1/3',
  } as FormField,

  // Section: Risk Assessment
  {
    id: 'divider-2',
    type: 'divider',
    content: '',
    width: 'full',
  } as LayoutElement,
  {
    id: 'section-risk',
    type: 'section',
    content: 'Risk Assessment',
    width: 'full',
  } as LayoutElement,
  {
    id: 'risk_level',
    type: 'dropdown',
    label: 'Risk Level',
    variableName: 'risk_level',
    required: true,
    options: [
      { label: 'High risk', value: 'High' },
      { label: 'Medium risk', value: 'Medium' },
      { label: 'Low risk', value: 'Low' },
    ],
    width: '1/3',
  } as FormField,
  {
    id: 'instruction-highrisk',
    type: 'instruction',
    content: 'High-risk factors include: household contact, direct physical contact, healthcare exposure without PPE, or prolonged close contact (>15 min within 6 feet).',
    width: 'full',
  } as LayoutElement,
  {
    id: 'underlying_conditions',
    type: 'checkbox',
    label: 'Has Underlying Conditions',
    variableName: 'underlying_conditions',
    required: false,
    helpText: 'Immunocompromised, chronic illness, elderly, etc.',
    width: '1/3',
  } as FormField,
  {
    id: 'vaccinated',
    type: 'dropdown',
    label: 'Vaccination Status',
    variableName: 'vaccinated',
    required: false,
    options: [
      { label: 'Fully vaccinated', value: 'Full' },
      { label: 'Partially vaccinated', value: 'Partial' },
      { label: 'Not vaccinated', value: 'None' },
      { label: 'Unknown', value: 'Unknown' },
    ],
    width: '1/3',
  } as FormField,

  // Section: Monitoring & Follow-up
  {
    id: 'divider-3',
    type: 'divider',
    content: '',
    width: 'full',
  } as LayoutElement,
  {
    id: 'section-monitoring',
    type: 'section',
    content: 'Monitoring & Follow-up',
    width: 'full',
  } as LayoutElement,
  {
    id: 'quarantine_start',
    type: 'date',
    label: 'Quarantine Start Date',
    variableName: 'quarantine_start',
    required: false,
    width: '1/3',
  } as FormField,
  {
    id: 'quarantine_end',
    type: 'date',
    label: 'Quarantine End Date',
    variableName: 'quarantine_end',
    required: false,
    width: '1/3',
  } as FormField,
  {
    id: 'monitoring_status',
    type: 'dropdown',
    label: 'Monitoring Status',
    variableName: 'monitoring_status',
    required: true,
    options: [
      { label: 'Active monitoring', value: 'Active' },
      { label: 'Self-monitoring', value: 'Self' },
      { label: 'Completed', value: 'Completed' },
      { label: 'Lost to follow-up', value: 'Lost' },
    ],
    width: '1/3',
  } as FormField,

  // Section: Current Symptoms
  {
    id: 'divider-4',
    type: 'divider',
    content: '',
    width: 'full',
  } as LayoutElement,
  {
    id: 'section-symptoms',
    type: 'section',
    content: 'Current Symptoms',
    width: 'full',
  } as LayoutElement,
  {
    id: 'instruction-symptoms',
    type: 'instruction',
    content: 'Record any symptoms the contact is currently experiencing.',
    width: 'full',
  } as LayoutElement,
  {
    id: 'symptomatic',
    type: 'dropdown',
    label: 'Currently Symptomatic',
    variableName: 'symptomatic',
    required: true,
    options: [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
    ],
    width: '1/4',
  } as FormField,
  {
    id: 'symptom_onset',
    type: 'date',
    label: 'Symptom Onset Date',
    variableName: 'symptom_onset',
    required: false,
    helpText: 'If symptomatic, date symptoms began',
    width: '1/4',
    skipLogic: {
      action: 'show',
      conditions: [{ fieldId: 'symptomatic', operator: 'equals', value: 'Yes' }],
      logic: 'and',
    },
  } as FormField,
  {
    id: 'fever',
    type: 'checkbox',
    label: 'Fever',
    variableName: 'fever',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'cough',
    type: 'checkbox',
    label: 'Cough',
    variableName: 'cough',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'shortness_of_breath',
    type: 'checkbox',
    label: 'Shortness of Breath',
    variableName: 'shortness_of_breath',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'fatigue',
    type: 'checkbox',
    label: 'Fatigue',
    variableName: 'fatigue',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'loss_of_taste_smell',
    type: 'checkbox',
    label: 'Loss of Taste/Smell',
    variableName: 'loss_of_taste_smell',
    required: false,
    width: '1/4',
  } as FormField,
  {
    id: 'other_symptoms',
    type: 'text',
    label: 'Other Symptoms',
    variableName: 'other_symptoms',
    required: false,
    placeholder: 'Describe any other symptoms',
    width: '1/2',
  } as FormField,

  // Section: Testing
  {
    id: 'divider-5',
    type: 'divider',
    content: '',
    width: 'full',
  } as LayoutElement,
  {
    id: 'section-testing',
    type: 'section',
    content: 'Testing',
    width: 'full',
  } as LayoutElement,
  {
    id: 'tested',
    type: 'dropdown',
    label: 'Has Been Tested',
    variableName: 'tested',
    required: false,
    options: [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
      { label: 'Pending', value: 'Pending' },
    ],
    width: '1/4',
  } as FormField,
  {
    id: 'test_date',
    type: 'date',
    label: 'Test Date',
    variableName: 'test_date',
    required: false,
    width: '1/4',
    skipLogic: {
      action: 'show',
      conditions: [{ fieldId: 'tested', operator: 'equals', value: 'Yes' }],
      logic: 'and',
    },
  } as FormField,
  {
    id: 'test_result',
    type: 'dropdown',
    label: 'Test Result',
    variableName: 'test_result',
    required: false,
    options: [
      { label: 'Positive', value: 'Positive' },
      { label: 'Negative', value: 'Negative' },
      { label: 'Inconclusive', value: 'Inconclusive' },
      { label: 'Pending', value: 'Pending' },
    ],
    width: '1/4',
    skipLogic: {
      action: 'show',
      conditions: [{ fieldId: 'tested', operator: 'equals', value: 'Yes' }],
      logic: 'and',
    },
  } as FormField,
  {
    id: 'converted_to_case',
    type: 'checkbox',
    label: 'Converted to Case',
    variableName: 'converted_to_case',
    required: false,
    helpText: 'Check if this contact has become a confirmed/probable case',
    width: '1/4',
  } as FormField,

  // Section: Notes
  {
    id: 'divider-6',
    type: 'divider',
    content: '',
    width: 'full',
  } as LayoutElement,
  {
    id: 'section-notes',
    type: 'section',
    content: 'Notes',
    width: 'full',
  } as LayoutElement,
  {
    id: 'interview_date',
    type: 'date',
    label: 'Interview Date',
    variableName: 'interview_date',
    required: false,
    width: '1/3',
  } as FormField,
  {
    id: 'interviewer',
    type: 'text',
    label: 'Interviewer Initials',
    variableName: 'interviewer',
    required: false,
    placeholder: 'e.g., JD',
    width: '1/3',
  } as FormField,
  {
    id: 'notes',
    type: 'text',
    label: 'Additional Notes',
    variableName: 'notes',
    required: false,
    placeholder: 'Any additional information',
    width: 'full',
  } as FormField,
];

/**
 * Available form templates with metadata
 */
export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  items: FormItem[];
}

export const formTemplates: FormTemplate[] = [
  {
    id: 'contact-tracing',
    name: 'Contact Tracing Form',
    description: 'Track contacts of confirmed cases during infectious disease outbreaks',
    items: contactTracingFormItems,
  },
  // Future templates can be added here:
  // - CDC Case Report Form
  // - Vaccine-Preventable Disease Form
  // - Respiratory Illness Questionnaire
];
