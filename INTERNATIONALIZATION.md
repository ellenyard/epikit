# Internationalization & R Integration Guide

## Overview

EpiKit now supports multiple languages and regional number formats while maintaining **full compatibility with R** for data analysis. This guide explains how internationalization works and how to ensure smooth R integration.

## Supported Locales

EpiKit supports the following locales:

- **en-US** - English (United States)
- **fr-FR** - Français (France)
- **es-ES** - Español (España)
- **de-DE** - Deutsch (Deutschland)
- **pt-BR** - Português (Brasil)
- **ar-SA** - العربية (Saudi Arabia)

## How Locale Detection Works

1. **Browser Detection**: EpiKit automatically detects your browser's language setting
2. **LocalStorage Persistence**: Your selected locale is saved and restored on subsequent visits
3. **Manual Override**: You can manually select your preferred locale using the Language & Region Settings button (globe icon in the top navigation)

## Number Formatting by Locale

Different locales use different conventions for numbers:

| Locale | Decimal Sep | Thousands Sep | Example    |
|--------|-------------|---------------|------------|
| en-US  | .           | ,             | 1,234.56   |
| fr-FR  | ,           | (space)       | 1 234,56   |
| es-ES  | ,           | .             | 1.234,56   |
| de-DE  | ,           | .             | 1.234,56   |
| pt-BR  | ,           | .             | 1.234,56   |
| ar-SA  | ٫           | ٬             | ١٬٢٣٤٫٥٦  |

## CSV Export for R Compatibility

### Critical Design Decision

**CSV exports ALWAYS use period (.) as the decimal separator**, regardless of your locale setting. This ensures compatibility with R scripts across all locales.

### CSV Delimiter by Locale

The CSV field delimiter changes based on locale to avoid conflicts:

- **English (US)**: Comma (`,`) - Standard CSV format
- **European locales** (French, Spanish, German, Portuguese): Semicolon (`;`) - European CSV format
- **Arabic**: Comma (`,`)

### Why This Matters for R

When working with European locales:

```r
# For US locale exports (comma delimiter, period decimal)
data <- read.csv("export.csv")

# For European locale exports (semicolon delimiter, period decimal)
data <- read.csv2("export.csv", sep=";")
# OR
data <- read.csv("export.csv", sep=";")
```

**Important**: Even though the delimiter may be a semicolon, the decimal separator in the file is ALWAYS a period (`.`). This prevents the common problem where European number formats (like "1,5") are misinterpreted as two separate fields in R.

## Best Practices for FETP Programs

### For Field Epidemiologists

1. **Check Your Locale Settings**
   - Click the globe icon in the top navigation
   - Verify your language and region settings match your preference
   - Review the number format examples shown

2. **Data Entry**
   - Enter numbers using YOUR locale format (e.g., "1,5" for 1.5 in French)
   - EpiKit will automatically parse and store them correctly
   - Display will match your locale preference

3. **CSV Import from Excel**
   - If importing CSV files created in Excel with your local settings
   - EpiKit will auto-detect the delimiter (comma or semicolon)
   - Numbers with locale-specific decimals will be parsed correctly

4. **CSV Export for R Analysis**
   - Export your data using the Export button
   - The exported CSV will:
     - Use period (.) for all decimal numbers (R-compatible)
     - Use the appropriate delimiter for your locale
   - Share this file with R users anywhere in the world

### For R Users Receiving EpiKit Exports

When you receive a CSV export from EpiKit:

1. **Check the delimiter** by opening in a text editor:
   - If you see semicolons (`;`) between fields: European format
   - If you see commas (`,`) between fields: US format

2. **Import to R**:
   ```r
   # For US format
   data <- read.csv("epikit_export.csv")

   # For European format (semicolon delimited)
   data <- read.csv("epikit_export.csv", sep=";")
   # OR use read.csv2 which defaults to semicolon
   data <- read.csv2("epikit_export.csv")
   ```

3. **Verify numeric columns**:
   ```r
   # Check that numeric columns are imported as numbers, not strings
   str(data)

   # Numbers should show as 'num' type, not 'chr'
   # If they show as 'chr', check your import parameters
   ```

## Calculated Variables (Formulas)

When creating calculated variables:

- **US locale**: Use period for decimals: `{weight} / ({height} * {height})`
- **European locale**: Use comma for decimals: `{weight} / ({height} * {height})` or with commas in literal numbers if needed
- EpiKit automatically normalizes the formula before evaluation

## Troubleshooting

### Problem: Numbers appear incorrect after CSV import to R

**Solution**: The CSV likely uses a different delimiter than expected. Try:
```r
# Try semicolon delimiter
data <- read.csv("file.csv", sep=";")

# Check the first few rows
head(data)
```

### Problem: Decimal numbers show as integers

**Cause**: CSV delimiter matches the decimal separator, causing R to split numbers incorrectly.

**Solution**: This should not happen with EpiKit exports (we use period decimals in CSV). If it does occur with an imported file, verify:
1. The source file format
2. Your locale settings in EpiKit
3. Re-export from EpiKit to generate a clean R-compatible CSV

### Problem: Browser auto-detected wrong locale

**Solution**:
1. Click the globe icon (Language & Region Settings)
2. Manually select your preferred locale
3. Settings are saved automatically

## Technical Details

### Number Parsing

EpiKit uses locale-aware parsing that accepts numbers in multiple formats:

- Detects and handles both period and comma decimal separators
- Removes thousands separators before parsing
- Converts all internal representations to JavaScript numbers (period decimals)
- Displays numbers according to your locale preference

### CSV Format Specification

**Export Format**:
```
Variable1;Variable2;NumericValue
Text1;Text2;123.45
```

**Characteristics**:
- Delimiter: Locale-specific (`,` or `;`)
- Decimal separator: Always `.` (period) for R compatibility
- Quoted fields: Only when containing delimiter, quotes, or newlines
- Quote escaping: Double quotes (`""`) for embedded quotes

### Date Formats

Dates are formatted according to locale:

- **en-US**: MM/DD/YYYY
- **fr-FR, es-ES, pt-BR**: DD/MM/YYYY
- **de-DE**: DD.MM.YYYY
- **ar-SA**: DD/MM/YYYY

ISO format (YYYY-MM-DD) is recommended for R compatibility and is accepted for import regardless of locale.

## Testing Recommendations for FETP Programs

When testing EpiKit with different regional settings:

1. **Test Number Entry**
   - Enter decimal values: 1.5 (US) or 1,5 (Europe)
   - Enter large numbers: 1,234.56 (US) or 1 234,56 (France)
   - Verify display matches your locale

2. **Test CSV Export/Import Cycle**
   - Export data from EpiKit
   - Import to R using appropriate delimiter
   - Verify all numbers are correct
   - Verify no data type mismatches

3. **Test Calculated Variables**
   - Create a formula with decimal numbers
   - Verify calculation results are correct
   - Check that BMI, rates, etc. calculate properly

4. **Test Cross-Locale Collaboration**
   - Export from French locale
   - Import to R on US locale machine
   - Verify data integrity

## Support

For issues or questions about internationalization:
- Check your Language & Region Settings (globe icon)
- Review this documentation
- Report issues at: https://github.com/ellenyard/epikit/issues

---

**Last Updated**: January 2026
**Version**: 1.0
