# EpiKit

A modern, web-based epidemiology toolkit designed to assist FETP residents analyze data during outbreak responses. Built with React, TypeScript, and Tailwind CSS.

## Purpose

EpiKit is designed to assist FETP (Field Epidemiology Training Program) residents—junior field epidemiologists—with reviewing, cleaning, and analyzing data from their field investigations. Beyond providing analytical tools, EpiKit aims to reinforce best practices in field epidemiology and provide guidance and tips throughout the investigation process, helping trainees build strong foundational skills.

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
│   ├── analysis/               # Analysis tools
│   │   ├── AnalysisWorkflow.tsx    # Main analysis container
│   │   ├── VariableExplorer.tsx    # Single variable exploration
│   │   ├── TableBuilder.tsx        # Frequency & cross-tabulation tables
│   │   ├── TwoByTwoAnalysis.tsx    # 2x2 tables & measures of association
│   │   ├── EpiCurve.tsx            # Epidemic curve visualization
│   │   ├── SpotMap.tsx             # Geographic mapping
│   │   ├── LineListing.tsx         # Case data table
│   │   ├── AttackRates.tsx         # Attack rate calculations
│   │   ├── DataImport.tsx          # CSV/Excel import
│   │   └── ...
│   ├── review/                 # Data review & cleaning
│   │   ├── Review.tsx              # Main review container
│   │   ├── DataQualityPanel.tsx    # Duplicate/date/range checks
│   │   ├── CreateVariableModal.tsx # Variable creation
│   │   ├── EditLogPanel.tsx        # Edit history tracking
│   │   └── ...
│   ├── collect/                # Data collection
│   │   ├── Collect.tsx             # Form-based data entry
│   │   └── DataEntryForm.tsx       # Entry form renderer
│   ├── tutorials/              # Interactive tutorials
│   │   ├── EpiCurveTutorial.tsx
│   │   ├── SpotMapTutorial.tsx
│   │   ├── TwoByTwoTutorial.tsx
│   │   └── ...
│   ├── shared/                 # Reusable UI components
│   │   ├── ContextualSidebar.tsx
│   │   ├── HelpPanel.tsx
│   │   └── ...
│   ├── FormBuilder.tsx         # Form designer
│   ├── FormCanvas.tsx          # Form drop zone
│   ├── FormPreview.tsx         # Form testing
│   └── ...
├── types/
│   ├── form.ts                 # Form type definitions
│   └── analysis.ts             # Analysis type definitions
└── utils/
    ├── csvParser.ts            # CSV import/export
    ├── excelParser.ts          # Excel file parsing
    ├── statistics.ts           # Statistical calculations
    ├── epiCurve.ts             # Epi curve utilities
    ├── dataQuality.ts          # Data quality checks
    ├── stringSimilarity.ts     # Fuzzy matching algorithms
    ├── persistence.ts          # localStorage management
    └── localeNumbers.ts        # International number formats
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Inspired by CDC's Epi Info
- Built with support from epidemiologists at CDC
