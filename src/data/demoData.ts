import type { DataColumn, CaseRecord } from '../types/analysis';

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
// Exposure event: January 10, 2026 - Community Picnic (lunch served 12:00-2:00 PM)
// 96 attendees interviewed; suspected vehicle: Potato Salad
// Attack rates: Potato salad eaters 75% (36/48), Non-eaters 17% (8/48)
// Note: Some records contain messy data (y/n instead of Yes/No) to simulate real-world data entry
// Location: Toledo, OH area
// Case status: Confirmed (diarrhea + fever or bloody stool), Probable (diarrhea + GI symptoms), Suspected (mild symptoms only), Not a case (not ill)
export const demoCaseRecords: CaseRecord[] = [
  // ILL - Ate Potato Salad (36 cases total) - Index case P001 at 3320 Kirkwall, Toledo, OH 43606
  { id: '1', participant_id: 'P001', age: 34, sex: 'Female', case_status: 'Confirmed', onset_date: '2026-01-10', onset_time: '22:00', hospitalization_date: '2026-01-12', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6723, longitude: -83.6145 },
  { id: '2', participant_id: 'P002', age: 28, sex: 'Male', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '02:00', hospitalization_date: '2026-01-12', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6652, longitude: -83.5822 },
  { id: '3', participant_id: 'P003', age: 67, sex: 'Male', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '06:00', hospitalization_date: '2026-01-09', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'No', bloody_stool: 'Yes', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6534, longitude: -83.5356 },
  { id: '4', participant_id: 'P004', age: 45, sex: 'Female', case_status: 'Probable', onset_date: '2026-01-11', onset_time: '08:00', hospitalization_date: '', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'Yes', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6891, longitude: -83.6278 },
  { id: '5', participant_id: 'P005', age: 52, sex: 'Male', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '10:00', hospitalization_date: '2026-01-13', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6445, longitude: -83.5512 },
  { id: '6', participant_id: 'P006', age: 8, sex: 'Female', case_status: 'Probable', onset_date: '2026-01-11', onset_time: '04:00', hospitalization_date: '', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'Yes', nausea: '', cramps: 'Yes', fever: '', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: '', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: '', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6778, longitude: -83.6034 },
  { id: '7', participant_id: 'P007', age: 41, sex: 'Male', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '12:00', hospitalization_date: '2026-01-13', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6312, longitude: -83.5689 },
  { id: '8', participant_id: 'P008', age: 36, sex: 'Female', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '14:00', hospitalization_date: '2026-01-13', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'Yes', cramps: 'Yes', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6623, longitude: -83.6189 },
  { id: '9', participant_id: 'P009', age: 29, sex: 'Male', case_status: 'Probable', onset_date: '2026-01-11', onset_time: '16:00', hospitalization_date: '', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6956, longitude: -83.5467 },
  { id: '10', participant_id: 'P010', age: 55, sex: 'Female', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '18:00', hospitalization_date: '2026-01-13', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6489, longitude: -83.5934 },
  { id: '11', participant_id: 'P011', age: 72, sex: 'Female', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '20:00', hospitalization_date: '2026-01-12', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'Yes', bloody_stool: 'Yes', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6834, longitude: -83.5623 },
  { id: '12', participant_id: 'P012', age: 19, sex: 'Male', case_status: 'Probable', onset_date: '2026-01-11', onset_time: '22:00', hospitalization_date: '', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'Yes', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6567, longitude: -83.6312 },
  { id: '13', participant_id: 'P013', age: 38, sex: 'Female', case_status: 'Confirmed', onset_date: '2026-01-12', onset_time: '00:00', hospitalization_date: '2026-01-13', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6401, longitude: -83.5178 },
  { id: '14', participant_id: 'P014', age: 61, sex: 'Male', case_status: 'Probable', onset_date: '2026-01-12', onset_time: '06:00', hospitalization_date: '', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: '', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: '', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: '', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: '', drank_iced_tea: 'No', latitude: 41.6712, longitude: -83.5845 },
  { id: '15', participant_id: 'P015', age: 5, sex: 'Male', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '03:00', hospitalization_date: '2026-01-12', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6678, longitude: -83.6078 },
  { id: '16', participant_id: 'P016', age: 48, sex: 'Female', case_status: 'Probable', onset_date: '2026-01-11', onset_time: '11:00', hospitalization_date: '', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6523, longitude: -83.5589 },
  { id: '17', participant_id: 'P017', age: 33, sex: 'Male', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '15:00', hospitalization_date: '2026-01-13', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'Yes', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6867, longitude: -83.5734 },
  { id: '18', participant_id: 'P018', age: 59, sex: 'Female', case_status: 'Probable', onset_date: '2026-01-12', onset_time: '02:00', hospitalization_date: '', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6345, longitude: -83.6023 },

  // NOT ILL - Ate Potato Salad (6 people - some resistance/lower dose)
  { id: '19', participant_id: 'P019', age: 25, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6612, longitude: -83.5456 },
  { id: '20', participant_id: 'P020', age: 31, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6789, longitude: -83.5912 },
  { id: '21', participant_id: 'P021', age: 44, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6456, longitude: -83.6234 },
  { id: '22', participant_id: 'P022', age: 27, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6934, longitude: -83.5678 },
  { id: '23', participant_id: 'P023', age: 39, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6378, longitude: -83.5523 },
  { id: '24', participant_id: 'P024', age: 56, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6701, longitude: -83.6156 },

  // ILL - Did NOT Eat Potato Salad (4 cases - background illness or cross-contamination)
  { id: '25', participant_id: 'P025', age: 42, sex: 'Male', case_status: 'Suspected', onset_date: '2026-01-11', onset_time: '19:00', hospitalization_date: '', specimen_date: '', interview_date: '2026-01-13', diarrhea: 'No', vomiting: 'No', nausea: 'Yes', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6534, longitude: -83.5867 },
  { id: '26', participant_id: 'P026', age: 63, sex: 'Female', case_status: 'Suspected', onset_date: '2026-01-12', onset_time: '08:00', hospitalization_date: '', specimen_date: '', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6845, longitude: -83.5389 },
  { id: '27', participant_id: 'P027', age: 15, sex: 'Male', case_status: 'Probable', onset_date: '2026-01-11', onset_time: '23:00', hospitalization_date: '', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: '', nausea: 'Yes', cramps: 'No', fever: '', bloody_stool: '', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: '', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: '', drank_lemonade: 'No', drank_iced_tea: '', latitude: 41.6423, longitude: -83.6089 },
  { id: '28', participant_id: 'P028', age: 37, sex: 'Female', case_status: 'Suspected', onset_date: '2026-01-12', onset_time: '04:00', hospitalization_date: '', specimen_date: '', interview_date: '2026-01-13', diarrhea: 'No', vomiting: 'No', nausea: 'Yes', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6689, longitude: -83.5534 },

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

  // === ADDITIONAL RECORDS (P049-P096) - Doubling the dataset ===

  // ILL - Ate Potato Salad (18 more cases)
  { id: '49', participant_id: 'P049', age: 31, sex: 'Male', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '01:00', hospitalization_date: '2026-01-12', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'y', vomiting: 'n', nausea: 'No', cramps: 'Yes', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6598, longitude: -83.5723 },
  { id: '50', participant_id: 'P050', age: 54, sex: 'Female', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '05:00', hospitalization_date: '2026-01-12', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6745, longitude: -83.6012 },
  { id: '51', participant_id: 'P051', age: 23, sex: 'Male', case_status: 'Probable', onset_date: '2026-01-11', onset_time: '07:00', hospitalization_date: '', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'n', nausea: 'Yes', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6423, longitude: -83.5534 },
  { id: '52', participant_id: 'P052', age: 66, sex: 'Female', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '09:00', hospitalization_date: '2026-01-13', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'Yes', bloody_stool: 'Yes', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6812, longitude: -83.5878 },
  { id: '53', participant_id: 'P053', age: 42, sex: 'Male', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '13:00', hospitalization_date: '2026-01-13', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'y', vomiting: 'y', nausea: 'n', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6534, longitude: -83.6145 },
  { id: '54', participant_id: 'P054', age: 11, sex: 'Female', case_status: 'Probable', onset_date: '2026-01-11', onset_time: '17:00', hospitalization_date: '', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'Yes', nausea: '', cramps: 'Yes', fever: '', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: '', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6689, longitude: -83.5623 },
  { id: '55', participant_id: 'P055', age: 38, sex: 'Male', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '19:00', hospitalization_date: '2026-01-13', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'Yes', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6456, longitude: -83.5389 },
  { id: '56', participant_id: 'P056', age: 49, sex: 'Female', case_status: 'Probable', onset_date: '2026-01-11', onset_time: '21:00', hospitalization_date: '', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'y', vomiting: 'No', nausea: 'No', cramps: 'y', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6778, longitude: -83.6234 },
  { id: '57', participant_id: 'P057', age: 27, sex: 'Male', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '23:00', hospitalization_date: '2026-01-13', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6345, longitude: -83.5712 },
  { id: '58', participant_id: 'P058', age: 73, sex: 'Female', case_status: 'Confirmed', onset_date: '2026-01-12', onset_time: '01:00', hospitalization_date: '2026-01-12', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'Yes', bloody_stool: 'Yes', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6901, longitude: -83.5956 },
  { id: '59', participant_id: 'P059', age: 35, sex: 'Male', case_status: 'Probable', onset_date: '2026-01-12', onset_time: '03:00', hospitalization_date: '', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'n', nausea: 'y', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6567, longitude: -83.6078 },
  { id: '60', participant_id: 'P060', age: 58, sex: 'Female', case_status: 'Confirmed', onset_date: '2026-01-12', onset_time: '05:00', hospitalization_date: '2026-01-13', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'Yes', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6623, longitude: -83.5467 },
  { id: '61', participant_id: 'P061', age: 16, sex: 'Male', case_status: 'Probable', onset_date: '2026-01-11', onset_time: '10:30', hospitalization_date: '', specimen_date: '2026-01-11', interview_date: '2026-01-12', diarrhea: 'y', vomiting: 'y', nausea: '', cramps: 'Yes', fever: '', bloody_stool: 'n', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: '', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: '', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6489, longitude: -83.5823 },
  { id: '62', participant_id: 'P062', age: 44, sex: 'Female', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '14:30', hospitalization_date: '2026-01-13', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'Yes', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6734, longitude: -83.6189 },
  { id: '63', participant_id: 'P063', age: 62, sex: 'Male', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '16:30', hospitalization_date: '2026-01-13', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'Yes', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6401, longitude: -83.5534 },
  { id: '64', participant_id: 'P064', age: 7, sex: 'Female', case_status: 'Probable', onset_date: '2026-01-11', onset_time: '18:30', hospitalization_date: '', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'Yes', nausea: '', cramps: '', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: '', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: '', latitude: 41.6856, longitude: -83.5678 },
  { id: '65', participant_id: 'P065', age: 51, sex: 'Male', case_status: 'Confirmed', onset_date: '2026-01-11', onset_time: '20:30', hospitalization_date: '2026-01-13', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'Yes', nausea: 'No', cramps: 'No', fever: 'Yes', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6512, longitude: -83.6023 },
  { id: '66', participant_id: 'P066', age: 39, sex: 'Female', case_status: 'Probable', onset_date: '2026-01-12', onset_time: '04:00', hospitalization_date: '', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'y', vomiting: 'n', nausea: 'y', cramps: 'Yes', fever: 'n', bloody_stool: 'n', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6678, longitude: -83.5756 },

  // NOT ILL - Ate Potato Salad (6 more people)
  { id: '67', participant_id: 'P067', age: 29, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6423, longitude: -83.5912 },
  { id: '68', participant_id: 'P068', age: 33, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'n', vomiting: 'n', nausea: 'n', cramps: 'n', fever: 'n', bloody_stool: 'n', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6789, longitude: -83.6134 },
  { id: '69', participant_id: 'P069', age: 47, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6534, longitude: -83.5478 },
  { id: '70', participant_id: 'P070', age: 21, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6867, longitude: -83.5823 },
  { id: '71', participant_id: 'P071', age: 55, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'n', vomiting: 'n', nausea: 'n', cramps: 'n', fever: 'n', bloody_stool: 'n', ate_potato_salad: 'Yes', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6612, longitude: -83.6267 },
  { id: '72', participant_id: 'P072', age: 37, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'Yes', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6456, longitude: -83.5589 },

  // ILL - Did NOT Eat Potato Salad (4 more cases)
  { id: '73', participant_id: 'P073', age: 46, sex: 'Male', case_status: 'Suspected', onset_date: '2026-01-11', onset_time: '20:00', hospitalization_date: '', specimen_date: '', interview_date: '2026-01-13', diarrhea: 'n', vomiting: 'n', nausea: 'y', cramps: 'y', fever: 'n', bloody_stool: 'n', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6723, longitude: -83.5678 },
  { id: '74', participant_id: 'P074', age: 69, sex: 'Female', case_status: 'Suspected', onset_date: '2026-01-12', onset_time: '06:00', hospitalization_date: '', specimen_date: '', interview_date: '2026-01-13', diarrhea: 'Yes', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6389, longitude: -83.6045 },
  { id: '75', participant_id: 'P075', age: 18, sex: 'Male', case_status: 'Probable', onset_date: '2026-01-11', onset_time: '22:00', hospitalization_date: '', specimen_date: '2026-01-12', interview_date: '2026-01-13', diarrhea: 'y', vomiting: '', nausea: 'y', cramps: 'n', fever: '', bloody_stool: '', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: '', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: '', drank_lemonade: 'Yes', drank_iced_tea: '', latitude: 41.6801, longitude: -83.5312 },
  { id: '76', participant_id: 'P076', age: 41, sex: 'Female', case_status: 'Suspected', onset_date: '2026-01-12', onset_time: '02:00', hospitalization_date: '', specimen_date: '', interview_date: '2026-01-13', diarrhea: 'No', vomiting: 'No', nausea: 'Yes', cramps: 'Yes', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6545, longitude: -83.5934 },

  // NOT ILL - Did NOT Eat Potato Salad (20 more people)
  { id: '77', participant_id: 'P077', age: 52, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6634, longitude: -83.5789 },
  { id: '78', participant_id: 'P078', age: 19, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'n', vomiting: 'n', nausea: 'n', cramps: 'n', fever: 'n', bloody_stool: 'n', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6489, longitude: -83.6123 },
  { id: '79', participant_id: 'P079', age: 34, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6756, longitude: -83.5456 },
  { id: '80', participant_id: 'P080', age: 65, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6378, longitude: -83.5867 },
  { id: '81', participant_id: 'P081', age: 14, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6845, longitude: -83.6034 },
  { id: '82', participant_id: 'P082', age: 48, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'n', vomiting: 'n', nausea: 'n', cramps: 'n', fever: 'n', bloody_stool: 'n', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6512, longitude: -83.5623 },
  { id: '83', participant_id: 'P083', age: 28, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6689, longitude: -83.5178 },
  { id: '84', participant_id: 'P084', age: 57, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6423, longitude: -83.6189 },
  { id: '85', participant_id: 'P085', age: 23, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6778, longitude: -83.5534 },
  { id: '86', participant_id: 'P086', age: 70, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'n', vomiting: 'n', nausea: 'n', cramps: 'n', fever: 'n', bloody_stool: 'n', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6567, longitude: -83.5978 },
  { id: '87', participant_id: 'P087', age: 42, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6834, longitude: -83.5712 },
  { id: '88', participant_id: 'P088', age: 31, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6401, longitude: -83.6267 },
  { id: '89', participant_id: 'P089', age: 59, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6712, longitude: -83.5389 },
  { id: '90', participant_id: 'P090', age: 16, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'n', vomiting: 'n', nausea: 'n', cramps: 'n', fever: 'n', bloody_stool: 'n', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'Yes', latitude: 41.6589, longitude: -83.5823 },
  { id: '91', participant_id: 'P091', age: 45, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'No', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6456, longitude: -83.6078 },
  { id: '92', participant_id: 'P092', age: 26, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'No', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6823, longitude: -83.5467 },
  { id: '93', participant_id: 'P093', age: 63, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'No', drank_iced_tea: 'No', latitude: 41.6345, longitude: -83.5956 },
  { id: '94', participant_id: 'P094', age: 38, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'n', vomiting: 'n', nausea: 'n', cramps: 'n', fever: 'n', bloody_stool: 'n', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'No', ate_fruit_salad: 'No', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6701, longitude: -83.6145 },
  { id: '95', participant_id: 'P095', age: 49, sex: 'Male', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'Yes', ate_coleslaw: 'No', ate_hamburger: 'Yes', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'No', drank_lemonade: 'Yes', drank_iced_tea: 'No', latitude: 41.6534, longitude: -83.5623 },
  { id: '96', participant_id: 'P096', age: 74, sex: 'Female', case_status: 'Not a case', onset_date: '', onset_time: '', hospitalization_date: '', specimen_date: '', interview_date: '', diarrhea: 'No', vomiting: 'No', nausea: 'No', cramps: 'No', fever: 'No', bloody_stool: 'No', ate_potato_salad: 'No', ate_chicken: 'No', ate_coleslaw: 'Yes', ate_hamburger: 'No', ate_hotdog: 'Yes', ate_fruit_salad: 'Yes', ate_cake: 'Yes', drank_lemonade: 'Yes', drank_iced_tea: 'Yes', latitude: 41.6867, longitude: -83.5278 },
];

export const demoDatasetName = 'Foodborne Outbreak - Community Picnic';

// =============================================================================
// DEMO DATASET 2: Child Nutrition Survey (SMART-style rapid assessment)
//
// 300 children aged 6-59 months across 30 survey clusters, surveyed in
// two consecutive years (2024 and 2025). No geographic coordinates —
// designed to showcase EpiKit's visualization features: dot plots, box
// plots, waffle charts, heatmaps, grouped/paired bars, bullet charts,
// slope charts, and frequency distributions.
//
// Two-year design: 150 children surveyed in 2020 and 150 in 2025. The
// 2025 cohort shows meaningful improvements in coverage and nutrition —
// reflecting five years of programme impact — so that slope charts
// clearly display change over time.
//
// Key indicators (approximate, per year):
//   - Global Acute Malnutrition (GAM) by WHZ: ~8% SAM, ~17% MAM, ~75% Normal
//   - Stunting (HAZ < -2): ~38%
//   - Underweight (WAZ < -2): ~22%
//   - Vitamin A coverage: ~62% (2020) → ~74% (2025)
//   - Measles vaccination: ~72% (2020) → ~84% (2025)
// =============================================================================

export const nutritionDemoColumns: DataColumn[] = [
  { key: 'child_id', label: 'Child ID', type: 'text' },
  { key: 'age_months', label: 'Age (months)', type: 'number' },
  {
    key: 'age_group', label: 'Age Group', type: 'categorical',
    valueOrder: ['6-11 mo', '12-23 mo', '24-35 mo', '36-47 mo', '48-59 mo'],
  },
  { key: 'sex', label: 'Sex', type: 'categorical' },
  { key: 'caregiver_age', label: 'Caregiver Age', type: 'number' },
  {
    key: 'caregiver_education', label: 'Caregiver Education', type: 'categorical',
    valueOrder: ['None', 'Primary', 'Secondary', 'Higher'],
  },
  { key: 'household_size', label: 'Household Size', type: 'number' },
  { key: 'children_under5', label: 'Children Under 5', type: 'number' },
  { key: 'weight_kg', label: 'Weight (kg)', type: 'number' },
  { key: 'height_cm', label: 'Height (cm)', type: 'number' },
  { key: 'muac_cm', label: 'MUAC (cm)', type: 'number' },
  { key: 'oedema', label: 'Bilateral Oedema', type: 'categorical' },
  { key: 'whz', label: 'WHZ Score', type: 'number' },
  { key: 'haz', label: 'HAZ Score', type: 'number' },
  { key: 'waz', label: 'WAZ Score', type: 'number' },
  {
    key: 'gam_status', label: 'Acute Malnutrition (WHZ)', type: 'categorical',
    valueOrder: ['SAM', 'MAM', 'Normal'],
  },
  {
    key: 'muac_status', label: 'Acute Malnutrition (MUAC)', type: 'categorical',
    valueOrder: ['SAM', 'MAM', 'Normal'],
  },
  { key: 'stunting_status', label: 'Stunting Status', type: 'categorical' },
  { key: 'underweight_status', label: 'Underweight Status', type: 'categorical' },
  { key: 'currently_breastfeeding', label: 'Currently Breastfeeding', type: 'categorical' },
  { key: 'dietary_diversity_score', label: 'Dietary Diversity Score (0-8)', type: 'number' },
  { key: 'meal_frequency', label: 'Meal Frequency (per day)', type: 'number' },
  { key: 'vitamin_a_supplement', label: 'Vitamin A Supplement (past 6 mo)', type: 'categorical' },
  { key: 'measles_vaccinated', label: 'Measles Vaccinated', type: 'categorical' },
  { key: 'deworming', label: 'Deworming (past 6 mo)', type: 'categorical' },
  { key: 'survey_cluster', label: 'Survey Cluster', type: 'number' },
  { key: 'survey_date', label: 'Survey Date', type: 'date' },
  { key: 'survey_year', label: 'Survey Year', type: 'categorical', valueOrder: ['2020', '2025'] },
  { key: 'target_vitamin_a', label: 'Target Vitamin A Coverage (%)', type: 'number' },
  { key: 'target_measles', label: 'Target Measles Coverage (%)', type: 'number' },
  { key: 'vitamin_a_coverage_pct', label: 'Vitamin A Coverage (%)', type: 'number' },
  { key: 'measles_coverage_pct', label: 'Measles Coverage (%)', type: 'number' },
];

/** Seeded linear congruential generator — produces reproducible demo data */
function makeLCG(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function generateNutritionRecords(): CaseRecord[] {
  const rand = makeLCG(2025);

  // Box-Muller transform for approximately normal values
  function randNorm(mean: number, sd: number): number {
    const u1 = Math.max(1e-10, rand());
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sd * z;
  }
  function round1(n: number) { return Math.round(n * 10) / 10; }
  function round2(n: number) { return Math.round(n * 100) / 100; }
  function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

  // Dates span two survey years — 6 collection dates per year (5-year gap)
  const surveyDates2020 = [
    '2020-10-05', '2020-10-12', '2020-10-19',
    '2020-11-02', '2020-11-09', '2020-11-16',
  ];
  const surveyDates2025 = [
    '2025-10-06', '2025-10-13', '2025-10-20',
    '2025-11-03', '2025-11-10', '2025-11-17',
  ];

  const records: CaseRecord[] = [];

  for (let i = 0; i < 300; i++) {
    const child_id = `NC${String(i + 1).padStart(3, '0')}`;

    // Age 6-59 months, roughly uniform
    const age_months = Math.floor(rand() * 54) + 6;
    const age_group =
      age_months < 12 ? '6-11 mo' :
      age_months < 24 ? '12-23 mo' :
      age_months < 36 ? '24-35 mo' :
      age_months < 48 ? '36-47 mo' : '48-59 mo';

    const sex = rand() < 0.5 ? 'Male' : 'Female';

    const caregiver_age = clamp(Math.round(randNorm(28, 7)), 18, 50);
    const edu_val = rand();
    const caregiver_education =
      edu_val < 0.18 ? 'None' :
      edu_val < 0.52 ? 'Primary' :
      edu_val < 0.84 ? 'Secondary' : 'Higher';

    const household_size = clamp(Math.round(randNorm(5.5, 2)), 2, 12);
    const children_under5 = clamp(Math.floor(rand() * 4) + 1, 1, Math.floor(household_size / 2) + 1);

    // Anthropometric z-scores for a high-burden setting
    const whz = round2(clamp(randNorm(-1.0, 1.2), -4, 2.5));
    const haz = round2(clamp(randNorm(-1.6, 1.3), -4, 2.5));
    const waz = round2(clamp(0.5 * whz + 0.5 * haz + randNorm(0, 0.4), -4, 2.5));

    // Classification
    const gam_status = whz < -3 ? 'SAM' : whz < -2 ? 'MAM' : 'Normal';
    const stunting_status = haz < -2 ? 'Stunted' : 'Not Stunted';
    const underweight_status = waz < -2 ? 'Underweight' : 'Normal';

    // Physical measurements derived from z-scores + age (approximate WHO growth curves)
    const height_cm = round1(clamp(67 + age_months * 0.77 + haz * 2.2 + randNorm(0, 0.5), 60, 120));
    const weight_kg = round1(clamp((height_cm / 100) ** 2 * 16.5 * (1 + whz * 0.09), 4.5, 22));

    // MUAC correlated with WHZ and age
    const muac_cm = round1(clamp(12.5 + whz * 0.75 + (age_months - 12) * 0.015 + randNorm(0, 0.35), 9.5, 17.5));
    const muac_status = muac_cm < 11.5 ? 'SAM' : muac_cm < 12.5 ? 'MAM' : 'Normal';

    const oedema = rand() < 0.04 ? 'Yes' : 'No';

    // Breastfeeding — common under 24 months, rare after
    const currently_breastfeeding = rand() < (age_months < 24 ? 0.70 : 0.12) ? 'Yes' : 'No';

    // Dietary diversity: higher with better caregiver education
    const dds_base =
      caregiver_education === 'None' ? 2.2 :
      caregiver_education === 'Primary' ? 3.0 :
      caregiver_education === 'Secondary' ? 3.8 : 4.5;
    const dietary_diversity_score = clamp(Math.round(randNorm(dds_base, 1.4)), 0, 8);

    // Meal frequency — older children eat more often
    const meal_frequency = clamp(Math.floor(rand() * 4) + (age_months < 12 ? 1 : 2), 1, 5);

    // Survey year: first 150 children = 2020, second 150 = 2025
    const survey_year = i < 150 ? '2020' : '2025';
    const yearDates = survey_year === '2020' ? surveyDates2020 : surveyDates2025;

    // Year-over-year improvement: 2025 cohort has better programme coverage
    const yearBoost = survey_year === '2025' ? 0.12 : 0;

    // Coverage: slightly lower for acutely malnourished children
    const cov_adj = gam_status === 'Normal' ? 0 : -0.08;
    const vitamin_a_supplement = rand() < (0.62 + cov_adj + yearBoost) ? 'Yes' : 'No';
    const measles_vaccinated   = rand() < (0.72 + cov_adj + yearBoost) ? 'Yes' : 'No';
    const deworming            = rand() < (0.55 + cov_adj + yearBoost) ? 'Yes' : 'No';

    const survey_cluster = Math.floor(rand() * 30) + 1;
    const survey_date = yearDates[Math.floor(rand() * yearDates.length)];

    // Target coverage percentages (national programme targets)
    const target_vitamin_a = 90;
    const target_measles = 95;

    // Compute individual coverage as percentage (100 or 0) — aggregating by
    // category (e.g. age group) will yield meaningful percentages
    const vitamin_a_coverage_pct = vitamin_a_supplement === 'Yes' ? 100 : 0;
    const measles_coverage_pct = measles_vaccinated === 'Yes' ? 100 : 0;

    records.push({
      id: String(i + 1),
      child_id,
      age_months,
      age_group,
      sex,
      caregiver_age,
      caregiver_education,
      household_size,
      children_under5,
      weight_kg,
      height_cm,
      muac_cm,
      oedema,
      whz,
      haz,
      waz,
      gam_status,
      muac_status,
      stunting_status,
      underweight_status,
      currently_breastfeeding,
      dietary_diversity_score,
      meal_frequency,
      vitamin_a_supplement,
      measles_vaccinated,
      deworming,
      survey_cluster,
      survey_date,
      survey_year,
      target_vitamin_a,
      target_measles,
      vitamin_a_coverage_pct,
      measles_coverage_pct,
    });
  }

  return records;
}

export const nutritionDemoRecords: CaseRecord[] = generateNutritionRecords();
export const nutritionDemoDatasetName = 'Child Nutrition Survey - Rapid Assessment';
