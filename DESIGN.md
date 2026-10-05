---
name: Miro Canvas
description: Miro's tools on Obsidian's native Canvas.
colors:
  surface: "var(--background-primary)"
  secondary-surface: "var(--background-secondary)"
  text: "var(--text-normal)"
  secondary-text: "var(--text-muted)"
  border: "var(--background-modifier-border)"
  hover: "var(--background-modifier-hover)"
  accent: "var(--interactive-accent)"
  sticky-yellow: "#ffe86d"
rounded:
  small: "var(--radius-s, 4px)"
  medium: "var(--radius-m, 8px)"
spacing:
  panel-edge: "12px"
  arrange-controls: "12px"
components:
  floating-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.medium}"
  panel-toggle:
    width: "44px"
    height: "44px"
---

# Design System: Miro Canvas

## Overview

Extend Obsidian's Canvas with Miro's tools. The host application's controls,
theme and native board mechanics remain the foundation. A person should be
able to find a tool, complete a task and return to their notes without learning
another interface language.

This document records the existing implementation and the first navigation
refinement. Theme variables are the source of truth, not fixed light/dark
palettes. `styles.css`, Obsidian's Setting components and the localized copy
implement these rules; this file does not introduce another UI framework.

## Colors

Use the host's surface, text, border, hover and accent variables for controls.
Board content uses the existing Miro palettes from `miro-palette.ts` and
`welcome-board.ts`; sticky yellow is content, not a universal interface accent.
Use `readableInk()` for text on painted examples. Verify both host themes.
State needs a visible cue beyond colour: selected icon, focus outline or label.

## Typography

Controls inherit Obsidian's UI font and size variables. Board fonts remain
the person's choice; font packs download only on a deliberate button press.
Use native headings for settings. Keep labels short and put the consequence
of a choice in its description. English and Russian must fit the same controls.
Changing percentages and other numeric controls use tabular numbers where
already defined in `styles.css`.

The welcome board uses 42px for its main title, 32px for the first task title,
24px for introduction text and 22px for explanations and the numbered route.
These are board units; verify the actual zoom rather than treating them as
screen pixels.

## Layout

Settings keep native rows and remain readable as one complete page. The section
selector at the top moves focus and scrolls to a native heading; it never hides
settings. Getting started appears before detailed parameters. Developer
diagnostics sit under a separate final heading.
On tablets, the introduction actions and section selector put controls below
their explanations so long button labels do not squeeze the text. Navigation
uses the host content padding to keep headings clear of its mobile header.

Floating tools, navigation and minimap retain their independent saved positions.
Positions and tool lists are separate for computer, tablet and phone. Existing
responsive CSS uses 900px and 480px boundaries; verify narrow widths, landscape
and the on-screen keyboard before changing them.

Keep touch controls separate. Panel arrangement and fold controls already use
44px targets; the dense mobile toolbar uses 40px targets. Increase reach only
when it does not overlap another control or alter board gesture ownership.

The welcome board keeps twelve numbered sections, real examples and a sandbox.
Its introduction offers a short route; detailed capabilities remain available.
README follows actions and outcomes, with relevant GIFs under expandable details.

## Elevation & Depth

Floating panels use the host's `--shadow-s` with the fallbacks already in CSS.
Borders distinguish controls and selection; shadows communicate floating panels.
Native card fill belongs to its rounded face, not a second opaque outer shell.
Only one visible selection outline belongs to a gesture.

## Shapes

Controls use the host's small and medium radii. Board shapes preserve their own
geometry and stroke. Do not apply a general radius or extra outline to every
Canvas node. Adjacent surfaces must not create a second visible card border.

## Components

- **Settings:** native Setting, dropdown, slider, toggle and button components.
  The section selector has an accessible name and focuses the selected heading.
- **Panels:** localized labels, one consistent Obsidian/Lucide icon set and
  distinct hover, focus, selected and disabled states. Button padding uses
  `--miro-canvas-button-padding` so Obsidian's tablet rules do not distort it.
- **Export:** explain selecting a page, dragging its label, resizing its corner
  and preserving paper proportions next to the page list. Help must be visible
  on touch devices without hovering.
- **Welcome:** demonstrate real editable objects, resolved comments and exported
  files. Instructions alone do not count as an editable demonstration.
- **Documentation:** retain text instructions alongside GIFs. Decorative imagery
  cannot replace a real view of the plugin's result.

## Do's and Don'ts

- Do preserve native Canvas, unknown file fields and `miroSource`.
- Do check keyboard focus, real mouse/touch input, both themes and Russian copy.
- Do respect the person's existing boards; updated guides create a fresh copy.
- Do document limitations beside the affected action.
- Don't add a second styling framework or download fonts for interface decoration.
- Don't animate drawing, dragging, resizing or rotation geometry. Feedback must
  track the input immediately. Existing short state transitions are interruptible.
- Don't apply blanket scale-on-press or hover effects to gesture handles.
- Don't add `!important`, `:has()` or expensive visual effects for cosmetic fixes.
- Don't silently replace the twelve-section guide with a smaller feature sample.
