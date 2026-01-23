# Internationalization Testing Guide

## Purpose

This guide helps FETP programs test EpiKit's internationalization features, particularly for non-US locales and R integration.

## Test Data

This directory contains sample CSV files formatted for different locales:

- `french-locale-test.csv` - French format (semicolon delimiter, comma decimals)

## Testing Steps

### 1. Test Locale Auto-Detection

**Expected Behavior**: EpiKit should auto-detect your browser's language.

**Steps**:
1. Open EpiKit in your browser
2. Click the globe icon (top navigation) to open Language & Region Settings
3. Verify the auto-detected locale matches your browser settings
4. Note the decimal and thousands separators shown

**French Locale Example**:
- Decimal separator: `,`
- Thousands separator: (space)
- Example: 1 234,56

### 2. Test Number Display

**Expected Behavior**: Numbers should display in your locale format.

**Steps**:
1. Import the demo data or create a new dataset
2. Add numeric values (age, temperature, etc.)
3. Verify numbers display with your locale's decimal separator
4. For French: 37,2 not 37.2

### 3. Test CSV Import (European Format)

**Expected Behavior**: EpiKit should correctly parse European CSV files.

**Steps**:
1. Download `french-locale-test.csv` from this directory
2. In EpiKit, click "Import Data"
3. Select the `french-locale-test.csv` file
4. Verify in the preview:
   - 5 records detected
   - Columns: ID, Name, Age, Temperature, Date
   - Age shows as numbers: 45.5, 32.8, 28.3, etc. (internally stored with period)
   - Display may show: 45,5, 32,8, 28,3 (based on your locale setting)
5. Import the data

**Troubleshooting**:
- If columns are not detected correctly, the delimiter may not be auto-detected properly
- Report this as an issue

### 4. Test Number Entry

**Expected Behavior**: You can enter numbers using your locale format.

**Steps**:
1. After importing data, add a new record
2. For Age field, type: `25,5` (French format) or `25.5` (US format)
3. For Temperature, type: `37,8` or `37.8`
4. Save the record
5. Verify the number displays correctly

**Notes**:
- Both period and comma should work as decimal separators
- The system normalizes them internally

### 5. Test Calculated Variables (Formulas)

**Expected Behavior**: Formulas should work with locale-aware numbers.

**Steps**:
1. Go to Review module
2. Click "Create Variable"
3. Create a formula: `{temperature} * 1,8 + 32` (for Celsius to Fahrenheit)
   - French locale: use comma `1,8`
   - US locale: use period `1.8`
4. Verify the calculation produces correct results
5. Check a few records to confirm accuracy

**Expected Results**:
- 37,2°C → ~99°F
- 38,5°C → ~101°F

### 6. Test CSV Export for R

**Expected Behavior**: Exported CSV should work seamlessly in R.

**Critical Test**: This verifies R compatibility.

**Steps**:

**Part A: Export from EpiKit**
1. With your test data loaded, click "Export Data"
2. Save the CSV file
3. Open in a text editor (Notepad, TextEdit, etc.)
4. Verify:
   - If French locale: delimiter is `;` (semicolon)
   - If US locale: delimiter is `,` (comma)
   - **All numbers use period (.) as decimal separator** regardless of locale
   - Example line: `3;Pierre Bernard;28.3;36.9;17/01/2024`

**Part B: Import to R**
1. Open R or RStudio
2. For French/European export:
   ```r
   # Option 1: Specify semicolon delimiter
   data <- read.csv("french-locale-test.csv", sep=";")

   # Option 2: Use read.csv2 (defaults to semicolon)
   data <- read.csv2("french-locale-test.csv")
   ```
3. For US export:
   ```r
   data <- read.csv("export.csv")
   ```
4. Verify data:
   ```r
   # Check structure
   str(data)

   # Age and Temperature should be 'num' not 'chr'
   # Should see:
   # $ Age        : num  45.5 32.8 28.3 51.2 19.7
   # $ Temperature: num  37.2 38.5 36.9 37.4 39.1

   # View data
   head(data)

   # Check specific values
   data$Age[1]  # Should be 45.5
   data$Temperature[2]  # Should be 38.5
   ```

**Success Criteria**:
- ✅ No warnings about data types
- ✅ Numeric columns imported as `num` type
- ✅ Values are correct (45.5, not 455 or 4.55)
- ✅ No strings like "45,5" (should be numeric 45.5)

### 7. Test Cross-Locale Compatibility

**Expected Behavior**: Data exported in one locale works in another.

**Steps**:
1. Set locale to French (fr-FR)
2. Import `french-locale-test.csv`
3. Export the data → save as `french-export.csv`
4. Change locale to English (en-US)
5. Import the `french-export.csv` file
6. Verify all numbers are correct
7. Export again → save as `us-export.csv`
8. Compare the two files in a text editor:
   - **Numbers should be identical in both files** (period decimals)
   - Delimiter may differ (semicolon vs comma)

### 8. Test Date Formatting

**Expected Behavior**: Dates display according to locale.

**Steps**:
1. Set locale to French
2. View dates in the data - should show DD/MM/YYYY format
3. Change locale to US
4. View same dates - should show MM/DD/YYYY format
5. Data values should remain unchanged

## Common Issues and Solutions

### Issue: Numbers imported as text in R

**Symptom**: `str(data)` shows numeric columns as `chr`

**Cause**: Delimiter mismatch or decimal separator not recognized

**Solution**:
```r
# Check first few lines of CSV
readLines("file.csv", n=3)

# If semicolon delimited
data <- read.csv("file.csv", sep=";")

# Convert column if needed
data$Age <- as.numeric(data$Age)
```

### Issue: Decimal numbers show as integers

**Symptom**: 45.5 appears as 45

**Cause**: Delimiter matches decimal separator (rare with EpiKit exports)

**Solution**: This should not happen with EpiKit. If it does, please report as a bug.

### Issue: Cannot enter decimals in number fields

**Symptom**: Typing comma or period doesn't work

**Solution**:
- Check your locale settings
- Try both comma and period
- Some browsers may have input restrictions - report if persistent

## Reporting Issues

When reporting internationalization issues, please include:

1. Your locale setting (check globe icon)
2. Browser and version
3. Steps to reproduce
4. Expected vs actual behavior
5. Screenshot if helpful
6. Sample data file (if related to import/export)

Report at: https://github.com/ellenyard/epikit/issues

## Success Checklist

Before completing testing, verify:

- [ ] Locale auto-detected correctly or manually set
- [ ] Numbers display in correct format for locale
- [ ] Can enter numbers with locale decimal separator
- [ ] CSV import works with European format files
- [ ] CSV export uses period decimals (R-compatible)
- [ ] CSV delimiter appropriate for locale
- [ ] Calculated variables work with locale numbers
- [ ] Data exports to R without errors
- [ ] Numeric columns in R are type `num` not `chr`
- [ ] Values in R match original data
- [ ] Cross-locale import/export works
- [ ] Dates display appropriately for locale

## Contact for Testing Support

For questions about testing FETP programs:
- Review the INTERNATIONALIZATION.md documentation
- Check the main README for general usage
- Open an issue for bugs or feature requests

---

**Testing Version**: 1.0
**Last Updated**: January 2026
