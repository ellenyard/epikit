# LineList Launch To-Do List

This checklist focuses on showing the value of the existing product, making it easy to try safely, and learning from early users before adding more features.

## 1. Homepage hero and first impression

- [x] Finalize the homepage headline and supporting copy.
- [x] Replace “Built by field epidemiologists for field epidemiologists” with accurate, benefit-focused language.
- [x] Add a primary **Try a sample outbreak** button in the hero.
- [x] Add a secondary **Import your own data** or **Launch app** button.
- [x] Add a reassurance line: “No account required · Synthetic sample data included.”
- [x] Add a strong product image below the hero copy.
- [x] Confirm that the hero layout works well on desktop and mobile.

**Done when:** A new visitor can understand what LineList does, who it is for, and how to try it without scrolling.

## 2. Sample-outbreak experience

- [ ] Decide where **Try a sample outbreak** should land: Review/Clean, Epi Curve, or a short guided path.
- [ ] Add a direct URL or app state that opens the foodborne outbreak demo in the chosen starting place.
- [ ] Add a small “Start here” prompt for first-time sample users.
- [ ] Verify that the demo is clearly labeled as synthetic.
- [ ] Test the full path from homepage button to first useful result.

**Done when:** A first-time visitor can reach a meaningful demo screen in one click and create an epi curve within about one minute.

## 3. Product screenshots

- [ ] Create a consistent screenshot style and browser-window frame.
- [ ] Capture a hero image showing a compelling completed result, preferably an epi curve.
- [ ] Capture Review/Clean with the line list and Data Quality panel visible.
- [ ] Capture an analysis view with an epi curve, stratification, or incubation-period overlay.
- [ ] Capture a map or chart-gallery view that demonstrates communication and export.
- [ ] Use only synthetic data and check every visible field for accidental identifiers.
- [ ] Crop screenshots so important labels remain readable.
- [ ] Export optimized WebP versions and retain source-quality PNGs.
- [ ] Add descriptive alt text, image dimensions, and responsive sizing.
- [ ] Lazy-load screenshots below the hero.

**Done when:** The homepage shows the workflow and quality of the output without requiring visitors to launch the app.

## 4. Homepage structure and feature story

- [ ] Add a three-step workflow section: **Review and clean → Analyze → Map and communicate**.
- [ ] Create three illustrated feature sections using the new screenshots.
- [ ] Write outcome-focused headings and captions for each screenshot.
- [ ] Reduce the current nine-card feature grid to a compact “Also included” section.
- [ ] Add a short “Who LineList is for” statement.
- [ ] Keep the privacy section prominent but visually separate from the main product story.
- [ ] Update the final call to action to **Try the sample outbreak**.
- [ ] Review page length, spacing, and visual rhythm on desktop and mobile.

**Done when:** The page tells a coherent story from messy data to a usable outbreak-investigation result.

## 5. Privacy and storage language

- [ ] Replace absolute “nothing is uploaded” language with precise wording about imported datasets.
- [ ] Mention that map tiles and other external resources can make ordinary network requests.
- [ ] Explain that browser storage can be cleared and project backups should be exported.
- [ ] Review or remove “Works offline” claims unless all advertised behavior has been tested offline.
- [ ] Make privacy wording consistent across the homepage, dashboard, onboarding, help center, README, and image assets.
- [ ] Recheck the warning against importing PHI or direct identifiers.

**Done when:** Privacy claims are accurate, consistent, understandable, and do not overpromise.

## 6. Early-access feedback

- [ ] Add an **Early access** or **Feedback welcome** message to the homepage.
- [ ] Choose a feedback destination: GitHub issue form, email, or a very short external form.
- [ ] Add a visible **Send feedback** link to the homepage.
- [ ] Add a persistent but unobtrusive **Send feedback** link inside the app.
- [ ] Ask three questions: what the user tried, what confused or blocked them, and whether they would use LineList in practice.
- [ ] Confirm that the feedback process does not ask users to submit outbreak data or identifiers.

**Done when:** A user can report a problem or reaction in under two minutes.

## 7. Early user testing

- [ ] Recruit five people from the intended audience, such as FETP residents, local public-health staff, or instructors.
- [ ] Ask each person to open the sample outbreak without coaching.
- [ ] Ask each person to create an epi curve.
- [ ] Ask each person to export one result.
- [ ] Record where they hesitate, misunderstand wording, or get stuck.
- [ ] Group findings into critical blockers, recurring friction, and optional ideas.
- [ ] Fix the critical blockers before building additional analytical features.

**Done when:** Five target users have completed the same core tasks and the main recurring obstacles have been addressed.

## 8. Accessibility, performance, and final polish

- [ ] Add visible keyboard focus styles to homepage links and buttons.
- [ ] Check heading order, landmarks, link names, and screenshot alt text.
- [ ] Test homepage and app navigation with a keyboard.
- [ ] Check color contrast for new text, buttons, captions, and early-access messaging.
- [ ] Verify that screenshots do not cause layout shifts.
- [ ] Check homepage loading performance after screenshots are added.
- [ ] Test current desktop and mobile browsers.
- [ ] Recheck title, description, canonical URL, social image, structured data, sitemap, and robots file.
- [ ] Run the existing build, lint, and regression checks.

**Done when:** The revised homepage is accessible, responsive, fast, and passes the project’s existing checks.

## Later, only if early use justifies it

- [ ] Consider testimonials or short case examples after real users provide permission.
- [ ] Consider privacy-respecting usage measurement limited to navigation and feature use, never dataset contents or filenames.
- [ ] Consider formal trademark advice if LineList gains meaningful adoption or institutional use.
- [ ] Consider new analytical features only in response to repeated user needs.

## Not priorities right now

- [ ] Do not add accounts, cloud dataset storage, payments, or complex infrastructure without validated demand.
- [ ] Do not rename the existing `epikit_*` browser-storage keys without a migration plan for saved user work.
