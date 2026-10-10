# Shape default size checks

## Trace recorded before implementation — 2026-10-10

Owned files: `src/shape-catalog.ts`, `tests/shape-catalog.test.ts`, and this
new check document. The parent owns the `src/m1-session.ts` caller.

`SHAPE_CATALOG` already assigns each picture a `square`, `wide`, or `tall`
aspect. `shapeCatalogEntry` uses the same lookup for a primary kind and all
of its aliases. Icon paths, catalogue entries, names, meanings, and translated
labels do not need to change.

An armed shape click reaches `M1Session.finishToolGesture`. A toolbar or spare
menu drop reaches `createFromBarDrag`, which passes the drop point as both
ends to `finishToolGesture`. The caller currently uses 200 x 200 for every
shape. Its free-drag branch instead derives the rectangle from board points
when pointer travel exceeds six screen pixels, with a 20px minimum per axis.

The new pure API is:

```ts
shapeDefaultSize(kind: string | undefined): { width: number; height: number }
```

It returns board dimensions from the resolved catalogue aspect:

| Aspect | Width | Height |
| --- | --- | --- |
| wide | 240 | 160 |
| tall | 160 | 240 |
| square | 200 | 200 |
| unknown or undefined kind | 200 | 200 |

The parent will use this helper for the shape default size in
`finishToolGesture`, retaining click/drop centering and the free-drag rectangle.
This task adds the catalogue API only; it does not establish caller integration.

## Mandatory focused checks

- Every primary catalogue entry returns the exact dimensions for its aspect.
- Every alias returns its entry's exact dimensions, including flowchart aliases.
- Unknown, empty, and undefined kinds return 200 x 200.
- Returned size objects can be changed without affecting later calls.
- Existing coverage still checks every supported kind, icon uniqueness,
  aliases, names, meanings, and English/Russian labels.
- Check whitespace only in the owned source/test files and this document.

## Evidence and pending checks

Focused unit execution: `npm test -- tests/shape-catalog.test.ts` passed all
60 tests in one file (428ms): 37 primary entries, 10 aliases, four fallback
cases, four fresh-object cases, and five existing catalogue/label tests.

Owned source/test whitespace: `git diff --check -- src/shape-catalog.ts
tests/shape-catalog.test.ts` passed. The new document had no whitespace diagnostics from
`git diff --no-index --check -- NUL docs/shape-default-size-checks.md`
(exit 1 reports the new-file difference).

Source inspection and these unit checks are not real-app
input evidence. Click/drop placement, centering at non-default zoom, free-drag
sizing, and native undo remain parent integration checks; no native tests,
screenshots, detector runs, or commits are part of this task.

Final parent integration/real-device results: [shape radius acceptance](shape-radius-acceptance.md). Earlier worker snapshots are historical; pending native cases remain explicit.
