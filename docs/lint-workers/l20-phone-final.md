# L20 final phone QA

Authorized phone only: SM-A336E / RZCW101PJVN / Obsidian 1.12.7 / MiroCanvasTest / CDP 9341. Never access tablet 9340 or Windows 9346. The human confirmed the phone unlocked and Obsidian foreground; selected-serial ADB confirms md.obsidian/MainActivity and isKeyguardShowing=false. This app is below manifest minAppVersion 1.13.7: no supported-version or declarative settings certification.

Frozen root SHA256: main.js AFF2EE3A34A3045A30075C5736091C5CDE937E3E06D2C1D327659AE5705AA200; styles.css 7C5CE8C141B048AE4382ABB83F6C3A309A0BFEF5C21290BC527184202A76208C; manifest.json 68169DD642F5654F4A1C3FDF0F64510DD5DBA5A72C9D9A3ABF39F1A6D4F1C174.

Only this note and ignored tools/obsidian_cdp/.out/l20-phone-final artifacts may be written locally. No source/CSS/build/harness edits or commits. Guarded android.mjs deployment copies the three current root assets into MiroCanvasTest; wait at least 800ms and hash installed bytes back. Original active Export touch test file bytes, theme, plugin settings and relevant config bytes are captured before deployment and verified/restored after each matrix. Root and installed asset hashes must stay immutable.

Run sequentially, stop on the first actual failure: native-style-owners; owned-hidden --label l20-final; owned-visibility; css-state --expect-marks; timer-owners (current fit=true, width/page, no diagnostics); card-fill; font-failures (positional 9341, CDP_TITLE=Obsidian); arrow-color; drawing-hold-shapes. An ignored preload redirects harness fixed artifact paths into this worker directory and guards every selected-phone ADB operation against a locked/background app. No other device is authorized. Do not blindly wake/tap if the guard fails.

Evidence distinguishes actual ADB touch/stylus input from CDP/native API/CSSOM instrumentation and explicitly synthetic pressure pulses. ADB stylus input does not prove physical hardware pressure or physical pen handling. Native style-owner currentM1Sizers=0 is not active M1 appearanceSizerStyles coverage; parent owns that separate diagnosis. Status initially pending.

Deployment verified after 800ms: installed and root three-asset SHA256 match the immutable grant; original active file/theme/settings/config bytes preserved. See before.json and deployed.json.

- native-style-owners: STOP — FAILURE; original file/theme/settings/config bytes preserved. Evidence .out/l20-phone-final/native-style-owners.log and native-style-owners.result.json.

Final restoration/readback passed: original file bytes, active path, theme, settings and config bytes preserved; root/installed assets unchanged. Scope excludes active M1 sizer coverage and supported declarative settings on this legacy version.

## STOP receipt — first matrix missing native sizer

native-style-owners failed at check-native-style-owners.mjs:53, `actual ordinary native Markdown sizer` (actual=false, expected=true), 2026-10-06T20:12:40.589Z to 20:12:44.894Z. The ordinary fixture card exposed no .markdown-preview-sizer at the assertion. The first theme loop did not finish; no group DPR-reference, CSSOM restoration, replacement-retention or M1 extra coverage is claimed. Whether legacy/native lazy mounting explains the missing sizer remains unverified. Harness unchanged; no rerun or subsequent matrix started.

Remaining eight matrices NOT RUN: owned-hidden, owned-visibility, css-state, timer-owners, card-fill, font-failures, arrow-color, drawing-hold-shapes. No ADB touch/stylus gesture or CDP pressure pulse was sent by this first matrix. Evidence here is selected-phone read-only ADB identity/foreground checks, guarded CDP deployment and native API/style instrumentation. No physical pressure inference and no supported declarative settings claim.

Final readback 2026-10-06T20:13:04.730Z: phone still md.obsidian/MainActivity, unlocked, viewport 384x853 CSS pixels at DPR 2.8125; original Export touch test.canvas SHA256 ca7cbb16e78a73e4548e7853cfc9ebb02f273b95cec2c4523acb8229c72fa462 preserved exactly, along with active path/theme/settings/config bytes. Installed three assets match the frozen root hashes listed above. Phone remains on the original board. No access to tablet/Windows, source/CSS/build/harness edits or commits.

Artifacts in tools/obsidian_cdp/.out/l20-phone-final: before.json; deploy.log; deployed.json; native-style-owners-before.json; native-style-owners.log; native-style-owners.result.json; native-style-owners-after.json; native-style-owners/l20-native/styles-RZCW101PJVN.json (partial report passed=false, paint=[]); final.json. qa.mjs and preload.cjs are ignored worker-only wrappers, not shared harness edits. Queue stopped; parent owns any harness correction or new run grant.

## New exclusive native-style harness grant — diagnosis and before edit

Parent explicitly authorizes this worker alone to edit check-native-style-owners.mjs for native viewport/lazy-content preparation; product/assets remain frozen. Independent eight matrices may continue after a concrete refusal of the first proof. No other device/app access.

Actual phone diagnosis disproves undefined tZoom/offscreen guesses: grid zoom=tZoom=-1.840253402578228, scale=0.2792727272727273; ordinary rect x282.764,y503.250,w67.025,h50.269 is on-screen, initialized/attached, child loaded, but placeholder and zero previews/sizers/M1 owners. Native render source calls updateBreakpoint(canvas.zoom>canvas.zoomBreakpoint||isEditing); actual zoomBreakpoint=-1.7; updateBreakpoint calls mountContent when true and unmountContent when false. Native zoomToBbox computes a log2 target and center; native setViewport stores x=tx,y=ty,zoom=tZoom. Sources and measured state: viewport-original.json.

Native zoomToBbox(ordinary.getBBox()) plus finite target validation and setViewport mounts the REAL child at zoom=0,scale=1,tx1020,ty570: visible 240x180 card, real sizer count1, actual ordinary appearanceSizerStyles owner count1 after 54.4ms. No synthesized card/preview DOM, changed enum, direct child mounting or plugin refresh used. This proves center is valid and low-zoom native content gating caused the missing sizer. Actual native methods/source/state: viewport-visible.json. Original bytes/theme/settings/config/assets restored/verified afterward.

Before implementation: visit each fixture card with the native zoom/center API; bounded 5s wait for its visible real content (sizer for native text cards). Collect paint only while that card's real native content exists. Ensure group/code/ordinary visible again for later probes. Require an active ordinary M1 owner >=1 before and after replacement, and check detached-owner absence; no zero-count pass. Preserve exact paint, group declaration/DPR reference, latest priority/table teardown, history/source/unknown checks. Record viewport readiness evidence, keep failures concrete, original restoration in finally. Mandatory phone corrected harness plus independent eight matrices, immutable asset and exact original-file/config readback. Other-host reruns remain parent-owned.

Final restoration/readback passed: original file bytes, active path, theme, settings and config bytes preserved; root/installed assets unchanged. Scope excludes active M1 sizer coverage and supported declarative settings on this legacy version.

Final restoration/readback passed: original file bytes, active path, theme, settings and config bytes preserved; root/installed assets unchanged. Scope excludes active M1 sizer coverage and supported declarative settings on this legacy version.

- native-style-owners: PASS; original file/theme/settings/config bytes preserved. Evidence .out/l20-phone-final/native-style-owners.log and native-style-owners.result.json.

### Corrected harness / phone proof receipt — exclusive edit complete

check-native-style-owners.mjs now visits actual native card viewports and waits at most 5s for real content. Paint is read while each card is visible. Code/group/ordinary are positioned again for their individual probes. The ordinary replacement probe requires an active M1 owner both before and after, rejects detached owners and verifies unchanged history. No fake preview DOM, enum change, blanket skip or numerical tolerance; the existing exact group CSS declarations and same-host DPR reference remain.

Corrected full matrix PASS at 2026-10-06T20:19:54.934Z to 20:20:02.766Z, both themes. Source replacements100 with source target count5→5; ordinary replacements100 with active M1 sizer count1→1 and ordinary owner1; no detached-owner/history changes. The previous Windows/tablet M1count0 scope limitation is not retroactively certified; this new phone result has positive installed M1 ownership. Exact group declaration width1px/style dashed; actual selected0.711111px/dashed equals same-host reference0.711111px/dashed, before/after solid border restored. Host CSSOM pure-helper latest native color/important priority and table teardown passed. Source/unknown metadata preserved.

Reviewable patch: .out/l20-phone-final/native-style-harness.patch against native-style-harness.before.mjs. node --check and scoped git diff --check passed. Diagnosis artifacts viewport-original.json and viewport-visible.json retain native sources and before/after measurements. Installed matrix report native-style-owners/l20-native/styles-RZCW101PJVN.json passed=true. Harness lease edit is complete; no further harness changes planned. Parent owns other-host reruns. Independent phone matrices continue on the unchanged frozen assets.

- owned-hidden: PASS; original file/theme/settings/config bytes preserved. Evidence .out/l20-phone-final/owned-hidden.log and owned-hidden.result.json.

- owned-visibility: PASS; original file/theme/settings/config bytes preserved. Evidence .out/l20-phone-final/owned-visibility.log and owned-visibility.result.json.

- css-state: PASS; original file/theme/settings/config bytes preserved. Evidence .out/l20-phone-final/css-state.log and css-state.result.json.

- timer-owners: PASS; original file/theme/settings/config bytes preserved. Evidence .out/l20-phone-final/timer-owners.log and timer-owners.result.json.

- card-fill: PASS; original file/theme/settings/config bytes preserved. Evidence .out/l20-phone-final/card-fill.log and card-fill.result.json.

- font-failures: PASS; original file/theme/settings/config bytes preserved. Evidence .out/l20-phone-final/font-failures.log and font-failures.result.json.

- arrow-color: PASS; original file/theme/settings/config bytes preserved. Evidence .out/l20-phone-final/arrow-color.log and arrow-color.result.json.

- drawing-hold-shapes: PASS; original file/theme/settings/config bytes preserved. Evidence .out/l20-phone-final/drawing-hold-shapes.log and drawing-hold-shapes.result.json.

Final restoration/readback passed: original file bytes, active path, theme, settings and config bytes preserved; root/installed assets unchanged. Scope excludes physical hardware pressure, supported declarative settings on this legacy version and other-host reruns. Positive active M1 phone evidence belongs to the corrected native-style report.

## Final new-grant receipt — all nine matrices PASS

Completed 2026-10-06T20:26:02.614Z on SM-A336E/RZCW101PJVN only, Obsidian 1.12.7, MiroCanvasTest, port9341. Corrected native style owners, owned hidden, owned visibility, CSS state --expect-marks, timer owners, card fill, font failures, arrow color and drawing hold/shapes all passed sequentially. Exact original file/config/settings/theme preservation and immutable root/installed three-asset hashes passed before and after each matrix and at final readback. No other device accessed, product/build changes, additional harness edits or commits. The authorized harness lease edit is finished.

Receipt JSON: .out/l20-phone-final/receipt.json; final.json holds original bytes/config evidence and installed hashes. Root/installed main remains AFF2EE3A34A3045A30075C5736091C5CDE937E3E06D2C1D327659AE5705AA200; CSS remains7C5CE8C141B048AE4382ABB83F6C3A309A0BFEF5C21290BC527184202A76208C; manifest remains68169DD642F5654F4A1C3FDF0F64510DD5DBA5A72C9D9A3ABF39F1A6D4F1C174. Original Export touch test.canvas hash remains ca7cbb16e78a73e4548e7853cfc9ebb02f273b95cec2c4523acb8229c72fa462, foreground/unlocked on original board.

Timer PDF proof: actual native view, currentFit=true, width=page-width, page=page-fit, diagnostics=[]; forced never-ready/rejection/late-readiness branches are explicitly instrumentation, not native failure observations. Hidden/search/visibility and CSS selection/resize use guarded real ADB touch; resize preview/commit/Undo/Redo/cancel passed at0.5 and1.25 scale. Card/arrow both themes and plugin reload passed. Font failure/retry uses isolated native browser registry/Blob instrumentation and positional9341 with CDP_TITLE=Obsidian.

Drawing evidence: guarded ADB stylus movement, hold true/false, highlighter, cancellation and native Undo/Redo; controlled CDP pressure widths[5,8] at log zoom0,-1,1 are separately labelled synthetic. Smart rectangles at angles0,8,30,-30,60,80; ellipses0,30; triangles0,30 recognized expected kind, dimensions and snapped rotation, with Undo/Redo. No physical S Pen or hardware pressure certification. Android screenshots are inside this worker's drawing/CSS artifact subdirectories; no Windows screenshots/foreground activity.

Positive installed phone M1 replacement proof: ordinary center metadata unchanged/valid, owner1 initially and after100 ordinary preview replacements; source5→5 after100 code preview replacements. Native histories unchanged, no retained detached owners. Earlier Windows/tablet zero-owner checks remain limited and require their parent-owned reruns. This legacy1.12.7 phone result does not certify the supported declarative settings path or change manifest minimum1.13.7. No settings-navigation matrix was run.

Patch/proof: native-style-harness.patch; viewport-original.json; viewport-visible.json; native-style-owners/l20-native/styles-RZCW101PJVN.json. Harness SHA256 before72eb2345344973e12ea9c852be4529feda99471bb9c04fa6f38b3f6da7099809, aftere8adc6726f8dfca04d6cfe63a94837a40008a4c709a5e0e47f7a9622dc5b064e. Existing exact DPR reference, all paint/CSSOM restoration, source/unknown integrity and history assertions retained; no tolerances or skips. Syntax/scoped whitespace checks passed. Phone work complete; stop changes.
