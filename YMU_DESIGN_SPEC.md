# YMU Design Spec — Single Source of Truth

## CSS Custom Properties

### Light mode (`:root`)
```css
--bg-page:        #F5F4F0;   /* warm off-white page base */
--bg-surface:     #FFFFFF;   /* cards, panels, sidebar */
--bg-surface-2:   #FAFAF8;   /* sidebar specifically */
--bg-hover:       #EEECEA;   /* nav item hover / active state */
--border-subtle:  #E8E6E0;   /* default card/panel border */
--border-medium:  #D0CEC8;   /* input borders, emphasis */
--text-primary:   #1A1A18;   /* headings, values, nav active */
--text-secondary: #6B6A64;   /* body, descriptions */
--text-tertiary:  #A09E98;   /* metadata, labels, placeholders */
--amber-bg:  #FAEEDA;  --amber-text:  #854F0B;
--green-bg:  #EAF3DE;  --green-text:  #3B6D11;
--blue-bg:   #E6F1FB;  --blue-text:   #185FA5;
--gray-bg:   #F1EFE8;  --gray-text:   #5F5E5A;
--purple-bg: #EEEDFE;  --purple-text: #534AB7;
--pink-bg:   #FBEAF0;  --pink-text:   #993556;
--radius-sm:   6px;
--radius-md:   8px;
--radius-lg:   10px;
--radius-pill: 9px;
--radius-full: 9999px;
--font-display: 'Bricolage Grotesque', sans-serif;
--font-body:    'Work Sans', sans-serif;
--font-mono:    'IBM Plex Mono', monospace;
```

### Dark mode (`[data-theme="dark"]`)
```css
--bg-page:        #1A1A18;
--bg-surface:     #242422;
--bg-surface-2:   #1E1E1C;
--bg-hover:       #2C2C2A;
--border-subtle:  #333330;
--border-medium:  #444441;
--text-primary:   #EDECEA;
--text-secondary: #A09E98;
--text-tertiary:  #6B6A64;
--amber-bg:  #633806;  --amber-text:  #FAC775;
--green-bg:  #27500A;  --green-text:  #C0DD97;
--blue-bg:   #0C447C;  --blue-text:   #B5D4F4;
--gray-bg:   #444441;  --gray-text:   #D3D1C7;
--purple-bg: #3C3489;  --purple-text: #CECBF6;
--pink-bg:   #72243E;  --pink-text:   #F4C0D1;
```

## Typography
- **Google Fonts**: `Bricolage Grotesque:wght@400;500;700`, `Work Sans:wght@400;500;700`, `IBM Plex Mono`
- `--font-display` → Bricolage Grotesque (headings, stat values, nav brand)
- `--font-body`    → Work Sans (all UI text)
- `--font-mono`    → IBM Plex Mono (section labels, timestamps, badges)

### Type scale
| Token | Size | Usage |
|---|---|---|
| `--text-xs`   | 10px | Section labels (uppercase + tracked) |
| `--text-sm`   | 11px | Metadata, sub-labels |
| `--text-base` | 12px | Task text, crew roles, badges |
| `--text-ui`   | 13px | Nav items, show names, panel body |
| `--text-md`   | 15px | Topbar title, brand name |
| `--text-lg`   | 16px | Section headings |
| `--text-stat` | 26px | Stat card values |

### Weights
- `--weight-regular: 400`
- `--weight-medium:  500`
- `--weight-bold:    700` — show names, crew names, panel titles only

### Section label rule
Always: `font-mono`, `text-xs`, uppercase, `letter-spacing: 0.06em`, `text-tertiary`.
Use the `.section-label` utility class.

## Layout
- Sidebar: 210px fixed, `padding: 20px 0`, nav gap: 2px between items
- Topbar: height 54px, `padding: 0 24px`
- Content: `padding: 24px`, `gap: 20px` between sections

## Borders
- Always `0.5px` except button outlines (`1px`)

## Components

### Show Row
- Height: 58px, `bg-surface`, `border-subtle`, `radius-lg`
- Grid: `36px icon | 1fr name+meta | auto badge | 80px date`
- Icon dot: 36×36, `radius-md`, status color bg+icon
- Show name: display font, font-bold, `text-primary`
- Meta: 12px, `text-tertiary`
- Date: `text-secondary` right-aligned; sub-date: 12px `text-tertiary`
- Hover: `border-color → border-medium`, transition 150ms

### Status Badge
- `font-size: 10px`, `font-weight: 700`, `text-transform: uppercase`
- `padding: 3px 8px`, `border-radius: var(--radius-pill)` (9px)
- Colors: `--[color]-bg` fill + `--[color]-text` text (never gray text on color bg)

### Nav Item
- `padding: 9px 16px`, `font-size: 13px`
- Default: `text-secondary`
- Active: `bg-hover`, `font-weight: 700`, `text-primary`, `radius-sm`, `margin: 0 6px`
- Hover: `bg-hover`, transition 150ms
- Section labels: mono, 10px, uppercase, tracked, `text-tertiary`, `pt: 12px pb: 4px`

### Avatar
- Topbar: 28px circle; Crew panel: 26px circle
- bg/text: use `--[color]-bg` / `--[color]-text` token pairs
- Initials: 10–11px, `font-weight: 700`

### Checkbox
- 14×14px, `border: 1px solid var(--border-medium)`, `border-radius: 3px`
- Checked: `bg: var(--text-primary)`, white checkmark SVG
- Done label: `text-tertiary` + `text-decoration: line-through`

### Panel
- `bg: var(--bg-surface)`, `border: 0.5px solid var(--border-subtle)`, `radius-lg`, `padding: 16px`
- Title: mono, 11px, uppercase, letter-spacing 0.08em, `text-tertiary`
- Row divider: `0.5px solid var(--border-subtle)`, `padding: 7px 0`

### Primary Button
- `bg: var(--text-primary)`, `color: var(--bg-surface)`
- `padding: 7px 14px`, `border-radius: var(--radius-md)`, `font-weight: 700`, `font-size: 12px`
- No border

### Icon Button
- 36×36px, `radius-md`, `border: 1px solid var(--border-medium)`, `bg: transparent`, `color: text-secondary`
- Hover: `bg-hover`
