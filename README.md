# LineList

LineList is a browser-based toolkit for reviewing, cleaning, analyzing, mapping, and visualizing outbreak investigation data. It is designed for FETP residents, junior epidemiologists, and public health professionals who need guided analytical workflows without writing code.

Live application: [https://linelist.org](https://linelist.org)

## Features

- CSV and Excel import with worksheet and date-format handling
- Data-quality checks, line-list editing, derived variables, and edit history
- Epidemic curves with stratification, annotations, and incubation-period overlays
- Spot maps, area maps, and sketch maps
- Descriptive statistics, frequency tables, cross-tabulations, and 2×2 analysis
- Publication-oriented chart gallery and exports
- Synthetic training datasets and embedded tutorials
- Project export and import for portable backups
- Locale and accessibility controls

## Data handling

Imported datasets are processed in the browser and saved in that browser's local storage. LineList does not upload imported datasets to an application server or provide cloud dataset storage. Map layers and other externally hosted resources can still generate normal network requests.

Do not import protected health information or other direct identifiers. De-identify datasets and follow applicable organizational policies before use.

## Local development

Prerequisite: Node.js 20 or later.

```bash
git clone https://github.com/ellenyard/epikit.git
cd epikit
npm install
npm run dev
```

Open `http://localhost:5173`.

## Verification

```bash
npm run build
npm run lint
npm run test:csv
npm run test:area-map
```

## Technology

- React 19 and TypeScript
- Tailwind CSS
- Leaflet and OpenStreetMap-derived layers
- Vite

## Acknowledgment

Developed by Ellen Yard.
