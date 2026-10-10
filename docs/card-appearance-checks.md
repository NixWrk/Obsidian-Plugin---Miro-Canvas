# Card corners and paragraph indentation — 2026-10-09

Trace before implementation: native cards obtain their face radius from
Obsidian's Canvas CSS. Imported app cards, previews, documents and embeds also
use fixed 10px radii in styles.css. M1CanvasSession owns the decorated Canvas
root and reconciles native cards after materialization; global settings rebuild
the session. CustomBoardStyles applies explicit per-selection declarations.
Independent export builds another M1CanvasSession with cloned global settings,
so card appearance must participate in that session without altering source data.

Paragraph snippets target Markdown preview paragraphs and CodeMirror lines.
Canvas text cards and file embeds share these classes with normal notes. The
owner requested general snippet isolation instead of an indentation-only
toggle: snippets are excluded by default and individually allowed in settings.
The isolation must leave note tabs/snippet enablement unchanged and restore on
disposal. It must not change paragraph text, source or native history. The
separate canvas-snippet-checks.md records its boundary and inheritance checks.

Mandatory checks before accepting:

- Radius 0 and nonzero, bounded settings, saving/reopen, both locales and themes.
- Ordinary text/file/link and imported card faces; diagrams, drawings, sticky
  notes, groups and source text keep their own geometry. Explicit named card
  styles may still override the global default.
- A paragraph-indentation snippet in a note and a Canvas: toggle only the
  snippet permission, inspect rendered paragraphs and edited lines, keep the note
  style and snippet enablement; new Markdown materialization and disposal.
- Independent PDF/PPTX/SVG appearance, content readiness, no source mutation,
  no screenshot/foreground takeover, Stop/error cleanup.
- Real isolated Windows input and physical Android in MiroCanvasTest, listing
  model/app version and ADB actions separately from CDP preparation/text.
- Types, focused/full tests, lint/CSS/build, schema/submission, three synthetic
  smoke modes and diff check. Synthetic results do not substitute for real input.

## Final representative native acceptance — 2026-10-09

Windows uses an isolated, permanently hidden/unfocused Obsidian 1.14.4 runtime
(launcher user agent 1.12.7). SM-X736B/R52Y808PDJB uses Android 16, Obsidian
1.13.8 and WebView 153 in MiroCanvasTest. The owner subsequently requested a
phone follow-up; its new check is pending ADB authorization and is not covered
by the Windows/tablet results.
Receipts are ignored files under tools/obsidian_cdp/.out/card-appearance.

Both native receipts pass: square text cards, nonzero radius and unchanged
group geometry; an actual Markdown note remains indented 47px while Canvas
has 0px, including snippet !important and inherited body/custom-variable rules.
Allowing the named snippet restores Canvas indentation/variables. Native SDK
Setting controls come from the real declarative definitions, mounted in an
owned acceptance panel with the Settings keyboard scope. Windows types radius
20 with trusted CDP input and activates the snippet control; renderer focus is emulated without activating the native window; tablet changes radius
to 24 and enables the snippet with real ADB taps. Mounting, note/board opening,
text readiness and hidden-window frame preparation are instrumentation.
These receipts do not claim a native global-settings search interaction.

SVG is actually saved through the guarded vault callback: Windows 76,719 bytes
(10 paths/61 text elements), tablet 78,146 bytes (10 paths/60 text elements).
Both have zero image/foreignObject substitutions and include all three expected
card texts. 63/37 samples respectively preserve source camera/selection/classes;
source bytes are unchanged and job/renderer registries are empty after export.

Existing PDF/PPTX checks also pass on both native surfaces with radius20:
Windows 81,773/93,506 bytes and 265 invariant samples; tablet 90,251/101,984
bytes and 248 samples. Both formats contain expected independent DOM card text,
terminate their workers and preserve source file bytes. Raster checkers inspect
payloads rather than writing attachments; SVG checks do write the attachment.
No screen capture or foreground takeover is used for any export. Original
paths/preferences are restored and the temporary acceptance snippet is removed.

The final suite passes 3,103 tests with one existing skip, all types/builds,
schema/submission, three synthetic smoke modes and 77 Python cases. Source lint
has only the retained command-ID advisory; CSS has zero !important/:has.
One design detector run reports three pre-existing CSS warnings and palette
sidecar advisories; none is introduced by the radius/value-field rules.

Remaining broader cases: native imported/file/link card variants, every theme
combination, editor-mode snippet styling and unsupported/global/popout cases.
Unit/local Chromium coverage for these stays distinct from native acceptance.

Final corner overlap follow-up: all 3,103 tests pass with the existing skip.
Windows and tablet --small-card receipts separately verify radius48 on a
100x40 native card exports with rx20/ry20 for both the painted face and overflow
clip, with the same source/cleanup invariants. Small SVGs are 76,695/77,485 bytes
and 49/34 invariant samples. Standard and small fixtures use separate receipts.
The first tablet small-card assertion wrongly required a literal XML space
between wrapped words; all expected glyphs were present. The corrected checker
compares glyph text without whitespace and reruns successfully on both devices.
The earlier claim of that first assertion passing was premature and is corrected
by these final receipts.

## Shape corner radius and initial proportions — 2026-10-10

Trace before edits: on SM-X736B/Android16/Obsidian1.13.8 in MiroCanvasTest,
round_rectangle nodes cd83b7ccc2c5b4c2 (250x60) and a443eab2bdbc202d
(210x200) use shapePath's fixed normalized12 corners, stretching the horizontal
and vertical radii differently. CardAppearance intentionally excludes shapes,
so cardCornerRadius0 does not control these outlines. finishToolGesture gives
every shape200x200 for a click/bar drop; the catalogue already declares wide,
tall or square. Drawn rectangles keep the user's drag dimensions.

Required checks: catalogue default proportions and aliases; tap/bar-drop vs
free drag/Shift constraints; actual tablet ADB creation; per-shape radius0 and
nonzero, circular physical corners on wide/tall nodes, explicit size clamping;
one native history transaction, persistence/reopen/Undo, locks/review and
unknown-field/miroSource preservation. Shape paths, text insets, edge/connector
landing and preview resize/rotation must use the same current dimensions and
normalized outline before release, after commit/cancel and at non-default zoom.
Independent SVG/PDF/PPTX must reuse that geometry without source/camera mutation.
Change the upstream checked schema before adding a stored cornerRadius.
Record real Android input separately from CDP setup; leave unverified cases
pending. The current request concerns shape outlines, not card CSS radius.

Final parent integration/real-device results: [shape radius acceptance](shape-radius-acceptance.md). Earlier worker snapshots are historical; pending native cases remain explicit.
