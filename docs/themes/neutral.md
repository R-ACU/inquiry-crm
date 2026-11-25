# Accent `neutral`

The default without a link parameter, and the fallback for any unknown value. Not based on a company: a calm blue for the invented catering business "Lindgrün".

The look itself (surfaces, type, shape, motion) is the same for every accent and lives in `src/app/globals.css` under `:root` (light) and `.dark` (dark). An accent only sets the colours below.

| Token | Light | Dark | Use |
| :--- | :--- | :--- | :--- |
| accent | `#2F64EE` | `#5D8BFF` | chart marks, icons, focus ring |
| accent-soft | `#E6EDFF` | `#1C2236` | tinted surfaces, icon circles |
| accent-fg | `#1F4FD1` | `#9BB7FF` | text and links in the accent |
| primary / hover | `#2F64EE` / `#2558D6` | same | buttons, the "Zugesagt" card; white text 5.0:1 |
| chart-2 | `#8EAAF7` | `#BCCBFF` | second series ("Neu"), weeks before the period |

All pairs are checked in `tests/unit/theme.test.ts` (WCAG AA for text, 3:1 for marks and icons) in both modes.
