# EpiKit

A modern, web-based epidemiology toolkit designed to replace and improve upon CDC's Epi Info. Built with React, TypeScript, and Tailwind CSS.

## Features

### Form Builder
- Drag-and-drop form designer
- 7 field types: Text, Number, Date, Dropdown, Checkbox, Multi-select, GPS
- Skip logic with conditional field visibility
- Form preview and testing
- Export forms as JSON or CSV templates

### Analysis Tools

#### Line Listing
- Tabular case data management
- Sort by any column
- Multi-condition filtering
- Inline cell editing
- Add/delete records
- Bulk operations
- CSV export

#### Epidemic Curve
- Configurable bin sizes: Hourly, 6-hour, 12-hour, Daily, Weekly (CDC/ISO)
- Stratification by any variable
- Color schemes: Default, Classification, Colorblind-friendly, Grayscale
- Annotations: First case marker, exposure events, interventions
- Incubation period overlays for 24+ pathogens
- SVG export

#### Spot Map
- Interactive geographic visualization
- OpenStreetMap, Satellite, and Topographic base maps
- Color-coded markers by any variable
- Click markers for case details
- Auto-fit to data bounds

#### 2x2 Table Analysis
- Risk Ratio (Relative Risk) with 95% CI
- Odds Ratio with 95% CI
- Risk Difference with 95% CI
- Attributable Risk Percent
- Chi-square test (Yates corrected)
- Fisher's exact test
- Attack rates
- Auto-generated interpretation

#### Descriptive Statistics
- Frequency distributions
- Central tendency: Mean, Median, Mode
- Dispersion: Std Dev, Variance, Range, IQR
- Five-number summary with box plot visualization
- Missing value counts

## Getting Started

### Prerequisites
- Node.js 18+

### Installation

```bash
# Clone the repository
git clone https://github.com/ellenyard/epikit.git
cd epikit

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173 in your browser.

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Tech Stack

- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS
- **Drag & Drop**: dnd-kit
- **Mapping**: Leaflet + OpenStreetMap
- **Build Tool**: Vite

## Project Structure

```
src/
├── components/
│   ├── analysis/
│   │   ├── Analysis.tsx        # Main analysis view
│   │   ├── LineListing.tsx     # Case data table
│   │   ├── EpiCurve.tsx        # Epidemic curve
│   │   ├── SpotMap.tsx         # Geographic mapping
│   │   ├── TwoByTwoAnalysis.tsx # 2x2 tables
│   │   ├── DescriptiveStats.tsx # Statistics
│   │   └── DataImport.tsx      # CSV import
│   ├── FieldPalette.tsx        # Form builder palette
│   ├── FormBuilder.tsx         # Form designer
│   ├── FormCanvas.tsx          # Form drop zone
│   ├── FormPreview.tsx         # Form testing
│   └── ...
├── hooks/
│   └── useDataset.ts           # Dataset state management
├── types/
│   ├── form.ts                 # Form type definitions
│   └── analysis.ts             # Analysis type definitions
└── utils/
    ├── csvParser.ts            # CSV import/export
    ├── statistics.ts           # Statistical calculations
    └── epiCurve.ts             # Epi curve utilities
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Inspired by CDC's Epi Info
- Built with support from epidemiologists at CDC
