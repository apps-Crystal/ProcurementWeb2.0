# Procurement Web App - Design Theme & System

This document outlines the core theme elements, CSS variables, typography, and custom utility classes used in the central application. This can be used as a reference to apply the exact same design system across other web applications ensuring UI/UX consistency.

## Technology Stack
- **Framework:** Next.js
- **Styling:** Tailwind CSS (v4)
- **Icons:** Lucide React

---

## 1. Typography
Our applications utilize modern sans-serif typefaces for a clean, professional, and dense information layout.
- **Primary Font:** `Inter`
- **Fallback Font:** `Roboto`, `sans-serif`
- **Utility Variable:** `--font-sans`

---

## 2. Color Palette

The color system is defined using CSS variables in `@theme` (Tailwind v4 style). It features a professional blueish-grey scale as the primary color, with sand/golden tones for accents.

### Primary Colors (Blueish Grey)
A subdued, professional palette used for structural elements, headers, and primary actions.

| Step | Hex Code | Variable | Notes |
|---|---|---|---|
| **50** | `#f0f4f8` | `--color-primary-50` | Very light backgrounds |
| **100** | `#d9e2ec` | `--color-primary-100` | Hover states |
| **200** | `#bcccdc` | `--color-primary-200` | Borders, custom scrollbar tracks |
| **300** | `#9fb3c8` | `--color-primary-300` | Disabled UI elements |
| **400** | `#829ab1` | `--color-primary-400` | Secondary icons/text |
| **500** | `#627d98` | `--color-primary-500` | Mid-tone accents |
| **600** | `#486581` | `--color-primary-600` | Primary Buttons, Focus rings |
| **700** | `#334e68` | `--color-primary-700` | Hover states on primary buttons |
| **800** | `#243b53` | `--color-primary-800` | Strong text headers |
| **900** | `#1A3A5C` | `--color-primary-900` | Deep backgrounds (e.g., Sidebar) |

### Accent Colors (Gold / Sand)
Used sparingly to draw attention to distinct actions or brand elements.

| Step | Hex Code | Variable | Notes |
|---|---|---|---|
| **400** | `#d4b96a` | `--color-accent-400` | Light accent |
| **500** | `#C8A951` | `--color-accent-500` | Brand primary accent |
| **600** | `#b39542` | `--color-accent-600` | Darker accent, active states |

### Structural & Semantic Colors

| Type | Hex Code | Variable | Notes |
|---|---|---|---|
| **Success Alert** | `#2E7D32` | `--color-success` | Affirmative actions, completed tags |
| **Warning Alert** | `#F57C00` | `--color-warning` | Cautionary actions, pending states |
| **Danger Alert** | `#C62828` | `--color-danger` | Errors, destructive actions |
| **Background App**| `#F5F6FA` | `--color-background` | Main application body background |
| **Surface/Card** | `#FFFFFF` | `--color-surface` | White background for cards, forms |
| **Border Default**| `#E0E4ED` | `--color-border` | Standard divider and container borders |
| **Text Primary** | `#1C2B3A` | `--color-text-primary` | Standard reading text |
| **Text Secondary**| `#5A6A7A` | `--color-text-secondary`| Muted text, placeholders |

---

## 3. Base Styles
Applied globally to the `body` root element:
- **Background Color:** Var `--color-background` (`#F5F6FA`)
- **Text Color:** Var `--color-text-primary` (`#1C2B3A`)
- **Font-Smoothing:** Antialiased

---

## 4. Custom Enterprise Utility Classes
To maintain tight consistency across diverse inputs and layout surfaces without stacking verbose classes, a set of global CSS classes are baked into the theme. Apply these when creating structural components.

### Depth & Elevation
- **`.enterprise-shadow`**
  Applies a subtle, crisp shadow designed for business applications. Used on floating headers or dropdowns.
  *(Box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1))*

### Surfaces
- **`.enterprise-card`**
  The standard container wrapper for forms, summary tables, and dashboard modules.
  - Background: White (`--color-surface`)
  - Border: 1px solid (`--color-border`)
  - Border Radius: Sharp `2px` corners
  - Shadow: Standard enterprise-shadow

### Form Elements
- **`.enterprise-input`**
  Standardizes all form controls (text fields, selects, date pickers) across the app to guarantee uniformity.
  - Height & Sizing: `2.25rem` (36px) height, `100%` width
  - Padding: `0.25rem` vertically, `0.75rem` horizontally
  - Font Size: `0.875rem` (14px) for dense data entry
  - Interaction States: 
    - **Focus:** Crisp `var(--color-primary-600)` outline and inner shadow.
    - **Disabled:** 50% opacity and `not-allowed` cursor.
    - **Placeholder:** Uses `var(--color-text-secondary)` coloring.

### UI Enhancements
- **`.custom-scrollbar`**
  Intended for inner overflowing containers (like sidebars and list tables). Disables thick browser-default scrollbars in favor of a 5px thin, semi-transparent overlay using `var(--color-primary-200)`.

---

## How to Port to a New Project

To replicate this exact design aesthetic in other web applications:
1. Ensure the new project uses **Tailwind CSS v4**.
2. Copy the entire `@theme` block and custom CSS utility classes contained within the existing `globals.css` to the target application’s main CSS file.
3. Throughout the target application, rely precisely on these generic utility classes (`.enterprise-card`, `.enterprise-input`, etc.) instead of constructing components manually with raw tailwind variables each time.
