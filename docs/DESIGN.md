# Daystash design system (dark fintech)

Matte charcoal and navy surfaces, solid fills with 1px borders, and violet used only for primary actions,
the active navigation item, selected states and key financial highlights. No glows, no decorative gradients on
surfaces (the two 3D illustrations are the only gradient artwork).

## Palette (`public/css/tokens.css`)
| Role | Value | Role | Value |
|---|---|---|---|
| Main background | `#10111A` | Success | `#42C994` |
| Sidebar | `#0B0C12` | Warning | `#F2B85B` |
| Surface | `#191B27` | Danger | `#F16F7C` |
| Elevated surface | `#202333` | Text | `#F5F5FA` |
| Borders | `#303345` | Secondary text | `#A2A5B7` |
| Violet / hover / soft | `#8B6CFF` / `#7657E8` / `#B49AFF` | | |

Derived, not new accents: translucent tints of the same hues (`--violet-tint`, `--success-tint`...), a muted text tone `#8A8EA2`,
an input background `#12131C` and a soft divider `#262839`.

**Contrast note:** white text on the primary violet `#8B6CFF` is about 3.7:1, below the 4.5:1 AA threshold for small text
(it passes for large or bold text, and on the hover colour `#7657E8` it is 4.9:1). The approved palette was followed as written. If you need strict AA, change `.btn-primary` to
`background: var(--violet-hover)`.

## Typography
Inter (variable, self-hosted in `public/fonts`, SIL OFL licence included), tabular numerals via `font-feature-settings: "tnum"`.
Scale: 12 / 13 / 15 / 18 / 24 / 30 / 40 px. Headings 600-700, tight tracking on large figures.

## Components (`components.css`)
`btn` (+ primary, secondary, ghost, danger, sm, icon), `field/input/select/input-affix`, `panel` (+ `panel-flush` for tables), `tile`, `table`
(+ `stack-rows`, which turns rows into labelled records on phones), `badge` (+ success / warning / danger / violet), `progress`, `banner`, `option`,
`kv`, `dialog` (animated in and out), `toast`, `tooltip`, `skeleton`, `empty`. Page layouts use the 12-column `g12` grid with `s3 ... s12` spans.

## Motion
180-250 ms, `cubic-bezier(.2,.7,.2,1)`: hover and focus states, page enter (fade + 8px rise), dialog in and out (160 ms exit), chart bars and donut
segments draw once when a page is entered (not after every action). Everything is reduced to ~0 ms under `prefers-reduced-motion`.

## Illustrations and icons
`public/js/illustrations.js`: a 3D calendar with coins (Overview budget section) and a 3D wallet (Rewards Buffer featured section), both inline SVG.
Nowhere else. `public/js/icons.js`: one outline family (1.7 stroke) for navigation and actions. Expense rows contain no logos or category art; categories are plain text.

## Frontend structure (native ES modules, no build step)
`main.js` router and render loop, global events - `state.js` state and race-safe loading - `actions.js` every button action and the forms -
`chart.js` (daily bars, donut, monthly bars; hover/focus tooltips) - `ui.js` (toasts, confirm dialog, animated closing, tooltips) -
`views/` one module per page (`overview`, `expenses`, `days` calendar, `rewards`, `history`, `settings`) plus `banners` and `common`.

To add a page: create `views/<name>.js` returning an HTML string, add it to `ROUTES` in `main.js` and an icon in `icons.js`.
