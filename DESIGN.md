# SeriesBumb Design System

This file summarizes the approved design spec in `docs/superpowers/specs/2026-09-25-seriesbumb-design.md`, section 9. The spec is authoritative when a detail is omitted here.

## Intent

A dark, readable Thai cassette encyclopedia inspired by the information structure of Encyclopaedia Metallum. Dense information is organized with a left navigation, paired facts, tabs, and discography tables. Surfaces stay plain so album art and catalog data lead.

## Color

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#14110E` | page |
| `--surface` | `#1C1814` | hover, inputs, drawer |
| `--surface-2` | `#231E19` | image backing, placeholders |
| `--border` | `#3A322A` | controls, tabs, table headers |
| `--rule` | `#2E2720` | structural dividers |
| `--row-rule` | `#241F1A` | table rows |
| `--text` | `#E6DFD3` | main text |
| `--text-soft` | `#C9C0B2` | descriptions |
| `--text-muted` | `#A89C8A` | secondary text |
| `--label` | `#8F8474` | labels at 13px or larger |
| `--heading` | `#F0E6D2` | headings |
| `--accent` | `#D4A24C` | links, selected tabs, focus, primary action |
| `--accent-ink` | `#1A1409` | text on accent |
| `--status` | `#D9785F` | error and selected status |
| `--success` | `#8DB07A` | success feedback |

Never lower text opacity. Check actual foreground/background pairs for WCAG AA.

## Typography

- Noto Serif Thai 500 for headings and navigation group labels.
- IBM Plex Sans Thai 400/500 for body, controls, and tables.
- IBM Plex Mono 400 for years, durations, catalog numbers, and numerical columns.
- Body 15–16px at 1.7 line height; tables 14px; labels 13px; H1 28px; H2 20px.

## Layout

- Center the site in a 1120px container. Side padding is 16px below 640px and 24px above.
- Use the 4/8/12/16/24/32/48px spacing scale.
- Header is 56px tall. At desktop widths, show a 208px sidebar and search input up to 320px.
- At widths below 1024px, provide mobile navigation and put entity imagery before the facts.
- At widths below 640px, collapse information pairs and dense tables into readable stacked content.
- Cover art uses `object-fit: contain` on `--surface-2` to preserve the physical cassette shape.

## Components and Interaction

- Links and current navigation use the gold accent. Focus rings are 2px accent.
- Buttons and fields have 4px corners and at least 40px height, or 44px on touch screens.
- Tabs start as working anchor links to visible sections and gain ARIA tab behavior with JavaScript.
- Mobile navigation uses a native dialog when enhanced. Without JavaScript, its link scrolls to the visible navigation at page end.
- Motion lasts no more than 300ms and is skipped or reduced for the user's reduced-motion preference.

## Content

All UI copy is Thai. Catalog content is plain text and rendered as text expressions. Empty and error states explain the next useful action. Do not invent tape records or statistics to fill a new page.
