# L20 timer/native harness update — before edits

2026-10-06, Carver; shared primary checkout
J:/NIX/WRK/Code/Obsidian-Plugin---Miro-Canvas, HEAD 2f3687c.
Parent registration: [L20-PLATFORM](../lint-remediation-checks.md#l20-platform)
and [L20-CORE native follow-ups](../lint-remediation-checks.md#l20-core-and-native-follow-ups).
Exclusive scope: tools/obsidian_cdp/check-timer-owners.mjs and this note only.
Read current AGENTS/README workflow/contributing, platform PDF readiness/closure
trace and the current harness/host/tests. Preserve all concurrent changes.
No builds, CDP connection, Obsidian/plugin/device operations, OS focus/input,
deployments, shared register edits or proof-file writes are authorized here.

## Exact affected sites/callers, traced before implementation

The harness bundles an isolated probe when its owner later runs it, connects
through connectByTitle/checked and records result.lifecycle/result.pdf. Its
PDF block calls createObsidianDocumentHost.openFile for width/page, reads the
actual native view's renderer/pdfViewer and calls applyNativePdfFit directly.
Baseline helper is loaded from 85cb6cd. The old equality assertion between
currentFit and baselineFit treats a historical early readiness race as a
compatibility oracle, although L20 intentionally waits for initialized renderer,
loaded pdfDocument, firstPagePromise/pagesPromise and native initial view.
The old diagnostics.length===0 conditional also lets native-fit failures pass
whenever a fallback diagnostic exists. Replace with four unconditional checks:
width === page-width, page === page-fit, currentFit === true, diagnostics empty.
Keep baseline outcome as informational observation only, with no absent-private-
capability inference or compatibility pass/fail claim. A baseline error must
remain informational as well.

User actions covered when parent runs this harness: open/reuse a native exported
PDF at page 1 in width/page mode; delayed/failed renderer; switch active Canvas
leaf, unload/reload plugin; same-owner deadline cleanup. Preserve all existing
native lifecycle calls, Reflect.apply receiver checks, 2000ms deadline capture,
1950..5000ms elapsed bounds, rejection handling and strict original board-byte
comparison. Nothing changes plugin behavior or test-vault boundaries.

Late-ready facade site: the forced never-ready viewer is resolved after its
original timeout, but currently supplies only currentScaleValue. With L20's
new readiness checks, missing pdfDocument/firstPage/pages can mask a late-write
regression. Supply the legitimately loaded shape: stable pdfDocument object,
resolved firstPagePromise/pagesPromise, resolved initializedPromise and
isInitialViewSet:true. Keep a setter counter with real scale readback. After
asserting no late writes, run a fresh active fit against the same loaded facade
as a positive control (must fit once and read back page-fit), then recheck owner
handle/receiver cleanup. This control is instrumentation, never native PDF
capability evidence. Real source-host focused tests cover readiness/cancellation.

result.popout's old 'no separate OS window created' statement cannot describe
parent's supplied __hiddenPopoutLeaf. Keep popout/closed-owner verification in a
separate parent native harness; this result must say external verification is
pending. No --popout-target, invented ownerWindow or window opening is added.

## Mandatory local checks, pending before edits

- node --check on the owned harness, without executing its top-level build/CDP.
- In-memory tests of the actual extracted PDF assertion block: baseline false
  or rejection is informational; successful width/page/currentFit/no diagnostic
  passes; incorrect width, incorrect page, currentFit false or nonempty
  diagnostics fails; loaded late facade qualifies for fresh active fit and no
  write occurs on the expired request. Use fake app/probe/owner only, no native
  claim and no artifact-file output.
- Focused existing tests/obsidian-document-host.test.ts (Node synthetic), with
  cache disabled and console output only: readiness, rejection, exact deadline,
  owner receiver, closure destroys timers, cancellation and late readiness.
- Scoped git diff --check, UTF-8/CRLF and static confirmation that lifecycle,
  isolated-vault/hidden-window and strictbyte guards remain intact.

Parent-only pending evidence: actual exported native PDF width/page/readback,
empty diagnostics/currentFit on frozen installed build; main/hidden-popout owner
receiver and real lifecycle/closed-window settlement; strict original bytes and
physical-device matrices. No local syntax/unit check establishes those passes.

## Completed bounded patch and local results

Changed only tools/obsidian_cdp/check-timer-owners.mjs and this exclusive note.
Actual width/page/currentFit/diagnostics assertions are unconditional; the
85cb6cd result/error is explicitly informational and cannot fail the current
native fit verdict. No absent-capability or compatibility inference is recorded.
Loaded late facade includes pdfDocument, firstPagePromise, pagesPromise,
initializedPromise and isInitialViewSet:true, plus real setter/readback. After
zero expired-request writes, one fresh active fit is required; captured-owner
receiver/handle cleanup is checked again. Popout is truthfully pending in an
external parent probe, with no claim about whether parent created a window.
No popout CLI/window creation/owner fabrication was added.

Verification performed without running the harness:
- node --check tools/obsidian_cdp/check-timer-owners.mjs: passed.
- Nine in-memory cases execute only the actual AST-extracted PDF block against
  fake app/probe/owner objects. Historical true, false and rejection all permit
  a successful current verdict. Wrong width, wrong page, currentFit false,
  nonempty diagnostics, injected late write and failed fresh-facade control
  all reject with their specific assertion. This proves harness assertions,
  not native fit behavior. A first fixture attempt omitted view.file identity;
  it was corrected in memory and all nine cases then passed. No source repair
  or external operation was needed for that fixture issue.
- Existing tests/obsidian-document-host.test.ts: 54/54 passed, with
  --no-file-parallelism --maxWorkers 1 --no-cache and console output only.
  This is Node/synthetic bridge readiness/cancellation/closure evidence.
- Compared the full lifecycle block to HEAD with only CRLF normalization:
  unchanged. Static checks retain isolated-vault boundary, hidden-window check,
  plugin timer owner identity, 1950..5000ms bound around the original 2000ms
  deadline, rejection refusal and original-board-text strict equality.
- Scoped git diff --check passed; both owned files are UTF-8 without BOM/CRLF.

No plugin build, top-level harness execution, CDP connection, Obsidian/device
operation, OS focus/input, deployment, shared-file edit, commit or proof-artifact
write was performed. Existing concurrent platform/native source changes were
read only. Native width/page/readback/currentFit/diagnostics and main/hidden
popout/closed-owner lifecycle evidence remain entirely PENDING for parent runs
on the frozen installed build; source-host tests do not substitute for them.
