# LineList

LineList is a browser-based toolkit for reviewing, cleaning, analyzing, mapping, and visualizing epidemiologic data. It supports both outbreak investigation and routine analysis such as summarizing surveillance data. It is designed for FETP residents, junior epidemiologists, surveillance officers, and public health professionals who need guided analytical workflows without writing code.

Live application: [https://linelist.org](https://linelist.org)

## Features

- CSV and Excel import with worksheet and date-format handling
- Data-quality checks, line-list editing, derived variables, and edit history
- Epidemic curves with stratification, annotations, and incubation-period overlays
- Spot maps, area maps, and sketch maps
- Descriptive statistics, frequency tables, cross-tabulations, and 2×2 analysis
- Publication-oriented chart gallery and exports
- Synthetic training datasets (foodborne outbreak, monthly disease surveillance, child nutrition survey) and embedded tutorials
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
npm run lint
npm run build
npm run test:statistics   # one of the regression scripts; see package.json for the full list
```

Every `test:*` script in `package.json` runs in CI before each deploy. They check the
calculations against published worked examples and guard import, date, map-privacy and
persistence behaviour.

## Technology

- React 19 and TypeScript
- Tailwind CSS
- Leaflet and OpenStreetMap-derived layers
- Vite

## Feedback

Noticed an error, a confusing result, or have a suggestion? Email
[ellen.yard@gmail.com](mailto:ellen.yard@gmail.com?subject=LineList%20feedback) or
[open an issue](https://github.com/ellenyard/epikit/issues). Please don't send datasets or
screenshots that contain identifiable information.

## License

Released under the [MIT License](LICENSE).

## Disclaimer

LineList is an independent project. It is not an official product of, and is not endorsed by, the
Centers for Disease Control and Prevention.

## Acknowledgment

Developed by Ellen Yard.
