// Parent-run settings input, fresh tutorial and export help. --background stays hidden.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectByTitle, connectTarget, listTargets, pressKey, screenshot } from "./cdp.mjs";
import { captureNativeSdk } from "./native-sdk.mjs";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log("Usage: node tools/obsidian_cdp/check-settings-navigation.mjs [--port PORT] [--background] [--main-target ID] [--expected-vault PATH] [--serial SUPPORTED_ANDROID_SERIAL] [--theme obsidian|moonstone]\n--background requires an already-hidden isolated Windows renderer with plugin settings already inline. No popup creation, foregrounding, OS input or screenshots in that mode. Parent runs app/device checks; --help never connects.");
} else {
  await main();
}

async function main() {
  const known = new Set(["--port", "--background", "--main-target", "--expected-vault", "--serial", "--theme"]);
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    assert.ok(known.has(flag) && !(flag in options), `unknown or repeated argument: ${flag}`);
    if (flag === "--background") options[flag] = true;
    else {
      assert.ok(args[index + 1] && !args[index + 1].startsWith("--"), `missing value: ${flag}`);
      options[flag] = args[++index];
    }
  }
  const background = options["--background"] === true;
  const serial = options["--serial"];
  assert.ok(!(background && serial), "--background is Windows-only; --serial uses the supported-device path");
  const port = Number(options["--port"] ?? "9336");
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, "invalid port");
  const theme = options["--theme"];
  assert.ok(theme === undefined || ["obsidian", "moonstone"].includes(theme), "unknown test theme");
  if (serial) assert.match(serial, /^[a-zA-Z0-9._:-]+$/u);
  const label = `${serial ?? (background ? "desktop-background" : "desktop")}${theme === "moonstone" ? "-light" : ""}`;
  const adb = process.env.ADB ?? "C:/Program Files/VirtualTablet Server/adb/adb.exe";
  const android = fileURLToPath(new URL("./android.mjs", import.meta.url));
  const out = fileURLToPath(new URL("./.out/l20-authoring-dom/", import.meta.url));
  const minimum = JSON.parse(readFileSync(new URL("../../manifest.json", import.meta.url), "utf8")).minAppVersion;
  const guardOptions = { background, mobile: Boolean(serial), expectedVault: options["--expected-vault"] ?? null, minimum };
  const report = { label, background, passed: false, runtime: null, screenshots: [],
    input: background ? "trusted background CDP mouse/key events; dropdown predecessor/focus setup is DOM instrumentation"
      : serial ? "ADB taps and dropdown keys; CDP Tab continuation; DOM probes/preparation" : "desktop CDP mouse/key events; screenshots foreground the target",
    settlement: [], checks: {}, restoration: { attempted: false, passed: false }, nativeBackgroundScreenshot: background ? "skipped" : "not-background" };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let mainTarget;
  let settings;
  let saved;
  let welcomeBaseline;

  async function checked(send, code) {
    const expression = `(async () => { const identity = (${guardRuntime.toString()})(${JSON.stringify(guardOptions)}); ${code} })()`;
    let timer;
    try {
      const response = await Promise.race([
        send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: false, silent: true }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("guarded settings evaluation timed out")), 15000); }),
      ]);
      if (response.error) throw new Error(response.error.message);
      const exception = response.result?.exceptionDetails;
      if (exception) throw new Error(exception.exception?.description ?? exception.text);
      return response.result?.result?.value;
    } finally {
      clearTimeout(timer);
    }
  }

  async function trustedKey(send, name) {
    await checked(send, "return true;");
    await pressKey(send, name);
    await checked(send, "return true;");
  }

  async function tap(send, location) {
    await checked(send, "return true;");
    if (serial) {
      execFileSync(process.execPath, [android, "tap", "--serial", serial, "--port", String(port), "--x", String(location.x), "--y", String(location.y)], { windowsHide: true, timeout: 12000 });
    } else {
      if (!background) await send("Page.bringToFront");
      await send("Input.dispatchMouseEvent", { type: "mousePressed", ...location, button: "left", buttons: 1, clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...location, button: "left", buttons: 0, clickCount: 1 });
    }
    await wait(250);
    await checked(send, "return true;");
  }

  async function point(send, selector) {
    return checked(send, `const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('control missing');
      const r=e.getBoundingClientRect();if(r.width<=0||r.height<=0)throw Error('control has no rendered bounds');
      const point={x:r.x+r.width/2,y:r.y+r.height/2};if(!e.contains(document.elementFromPoint(point.x,point.y)))throw Error('control obscured');return point;`);
  }

  async function shot(send, name) {
    if (background) {
      report.screenshots.push({ name, status: "skipped", reason: "hidden background Windows; no screenshot/capture/foregrounding" });
      return;
    }
    await checked(send, "return true;");
    const filename = `${out}design-${label}-${name}.png`;
    if (serial) execFileSync(process.execPath, [android, "shot", "--serial", serial, "--out", filename], { windowsHide: true, timeout: 12000 });
    else writeFileSync(filename, await screenshot(send));
    report.screenshots.push({ name, status: "captured", filename });
  }

  const hash = text => createHash("sha256").update(text).digest("hex");
  function contentWitness(text, isCanvas) {
    if (!isCanvas) return text;
    const document = JSON.parse(text);
    assert.ok(Array.isArray(document.nodes), "Canvas baseline needs native nodes");
    const copy = { ...document, nodes: [...document.nodes].sort((left, right) => String(left.id).localeCompare(String(right.id), "en")) };
    const canonical = value => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    return JSON.stringify(canonical(copy));
  }

  function witnessDifference(left, right) {
    const changedKeys = [];
    const changedIds = new Set();
    function compare(before, after, path, id) {
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      if (before && after && typeof before === "object" && typeof after === "object"
        && !Array.isArray(before) && !Array.isArray(after)) {
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
          compare(before[key], after[key], path ? path + "." + key : key, id);
        }
        return;
      }
      if (Array.isArray(before) && Array.isArray(after)) {
        if (path === "nodes") {
          if (before.length !== after.length) changedKeys.push("nodes.length");
          const oldNodes = new Map(before.map(node => [node.id, node]));
          const newNodes = new Map(after.map(node => [node.id, node]));
          for (const nodeId of new Set([...oldNodes.keys(), ...newNodes.keys()])) {
            compare(oldNodes.get(nodeId), newNodes.get(nodeId), "nodes[" + nodeId + "]", nodeId);
          }
        } else {
          for (let index = 0; index < Math.max(before.length, after.length); index++) {
            compare(before[index], after[index], path + "[" + index + "]", id);
          }
        }
        return;
      }
      changedKeys.push(path);
      if (id !== undefined) changedIds.add(id);
    }
    compare(JSON.parse(left), right === undefined ? null : JSON.parse(right), "");
    return { changedIds: [...changedIds], changedKeys };
  }

  function nativeImageCreationWitness(initialWitness, image) {
    const document = JSON.parse(initialWitness);
    const node = document.nodes.find(node => node.id === "da3ab1600ec81a0b");
    if (!image || !node || node.type !== "file" || !node.file?.endsWith("/Picture.png")) return undefined;
    assert.equal(image.id, node.id, "creation image identity");
    assert.equal(image.file, node.file, "creation image file");
    assert.equal(image.width, node.width, "native image creation must preserve width");
    assert.ok(Number.isFinite(image.naturalWidth) && image.naturalWidth > 0 && Number.isFinite(image.naturalHeight) && image.naturalHeight > 0,
      "loaded native image dimensions required");
    const ratio = image.naturalWidth / image.naturalHeight;
    assert.equal(image.aspectRatio, ratio, "native image aspect ratio must match loaded image");
    assert.equal(Math.round(Math.min(node.width, node.height * ratio)), node.width, "native image normalization must preserve width");
    const height = Math.round(Math.min(node.height, node.width / ratio));
    assert.equal(image.height, height, "native image height must equal native rounded aspect-ratio fit");
    node.height = height;
    return { witness: contentWitness(JSON.stringify(document), true), evidence: {
      id: node.id, filepath: node.file, beforeHeight: JSON.parse(initialWitness).nodes.find(n => n.id === node.id).height,
      afterHeight: height, width: node.width, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, aspectRatio: ratio,
      originTrace: "tools/obsidian_cdp/.out/l20-tablet-final/height-diagnosis-summary.json; native app.js:1:3261559 image load/resize; L19/L20/unloaded identical",
    } };
  }

  async function settleBeforeBaseline(expectedPath, stage, creationText) {
    let witness = creationText === undefined ? undefined : contentWitness(creationText, true);
    let creationVariant;
    let creationAccepted = false;
    let requiredPath = expectedPath;
    let last;
    let lastMismatch;
    let nativeMismatchCount = 0;
    let stable = 0;
    for (let attempt = 0; attempt < 48; attempt++) {
      const snapshot = await checked(mainTarget.send, `const file=app.workspace.getActiveFile();if(!file)throw Error('active test file required');
        const text=await app.vault.read(file);const view=app.workspace.activeLeaf?.view,canvas=view?.canvas;
        const native=file.extension==='canvas'&&typeof canvas?.getData==='function'?canvas.getData():null;
        const imageNode=${creationText !== undefined}?canvas?.nodes?.get('da3ab1600ec81a0b'):null;
        const imageEl=imageNode?.contentEl?.firstChild;
        const image=imageEl?.tagName==='IMG'&&imageNode.aspectRatio?{id:imageNode.id,file:imageNode.file?.path??imageNode.filePath,
          width:imageNode.width,height:imageNode.height,aspectRatio:imageNode.aspectRatio,naturalWidth:imageEl.naturalWidth,naturalHeight:imageEl.naturalHeight}:null;
        return {image,path:file.path,text,isCanvas:file.extension==='canvas',native,nativeViewFilePath:view?.file?.path??null,liveOrder:Array.isArray(native?.nodes)?native.nodes.map(node=>node.id):null};`);
      requiredPath ??= snapshot.path;
      assert.equal(snapshot.path, requiredPath, "active file changed during native settlement");
      const currentWitness = contentWitness(snapshot.text, snapshot.isCanvas);
      if (witness === undefined) witness = currentWitness;
      if (creationText !== undefined && snapshot.image && creationVariant === undefined) {
        creationVariant = nativeImageCreationWitness(witness, snapshot.image);
      }
      const isCreationVariant = creationVariant !== undefined && currentWitness === creationVariant.witness;
      assert.ok(currentWitness === witness || !creationAccepted && isCreationVariant,
        "native settlement changed fields/source/extensions beyond root node ordering: "
        + JSON.stringify(snapshot.isCanvas ? witnessDifference(witness, currentWitness) : { changedKeys: ["text"] }));
      if (isCreationVariant && currentWitness !== witness) {
        witness = currentWitness;
        creationAccepted = true;
        stable = 0;
        last = undefined;
        report.nativeCreationNormalization = { ...creationVariant.evidence, everyOtherCanonicalFieldUnchanged: true,
          initialWitnessSha256: hash(contentWitness(creationText, true)), normalizedWitnessSha256: hash(currentWitness) };
      }
      const fileOrder = snapshot.isCanvas ? JSON.parse(snapshot.text).nodes.map(node => node.id) : null;
      const aligned = !snapshot.isCanvas || Array.isArray(snapshot.liveOrder) && JSON.stringify(fileOrder) === JSON.stringify(snapshot.liveOrder);
      const nativeWitness = snapshot.isCanvas && Array.isArray(snapshot.native?.nodes)
        ? contentWitness(JSON.stringify(snapshot.native), true) : undefined;
      if (creationText !== undefined && snapshot.nativeViewFilePath === snapshot.path && nativeWitness !== undefined) {
        const initialWitness = contentWitness(creationText, true);
        assert.ok(nativeWitness === initialWitness || nativeWitness === creationVariant?.witness,
          "fresh native creation changed fields beyond verified image height: " + JSON.stringify(witnessDifference(initialWitness, nativeWitness)));
      }
      const nativeMatches = snapshot.nativeViewFilePath === snapshot.path
        && (!snapshot.isCanvas || nativeWitness === currentWitness);
      if (!nativeMatches) {
        lastMismatch = { stage, attempt: attempt + 1, path: snapshot.path, nativeViewFilePath: snapshot.nativeViewFilePath,
          fileWitnessSha256: hash(currentWitness), nativeWitnessSha256: nativeWitness === undefined ? null : hash(nativeWitness),
          ...(snapshot.isCanvas ? witnessDifference(currentWitness, nativeWitness) : { changedIds: [], changedKeys: ["nativeViewFilePath"] }) };
        if (snapshot.nativeViewFilePath !== snapshot.path) lastMismatch.changedKeys.push("nativeViewFilePath");
        report.nativeLoadingMismatches ??= [];
        report.nativeLoadingMismatches.push(lastMismatch);
        nativeMismatchCount += 1;
        stable = 0;
        last = undefined;
        await wait(250);
        continue;
      }
      const key = JSON.stringify([snapshot.path, snapshot.text, snapshot.liveOrder, snapshot.nativeViewFilePath, nativeWitness]);
      // Native getData sorts nodes; every stable sample must still match every field.
      stable = key === last ? stable + 1 : 0;
      last = key;
      if (stable >= 4) {
        report.settlement.push({ stage, path: snapshot.path, attempts: attempt + 1, stableSamples: stable + 1, nativeOrderAligned: aligned,
          nativeFullWitnessMatch: true, nativeViewFilePath: snapshot.nativeViewFilePath, recoveredNativeMismatches: nativeMismatchCount,
          bytesSha256: hash(snapshot.text), sourceAndUnknownWitnessPreserved: true });
        return snapshot;
      }
      await wait(250);
    }
    const details = lastMismatch ?? { stage, path: requiredPath, changedIds: [], changedKeys: ["stable byte/order samples"] };
    throw new Error(stage + ": native full-field/file identity did not settle within 48 samples; no save or file rewrite attempted: "
      + JSON.stringify({ path: details.path, nativeViewFilePath: details.nativeViewFilePath,
        mismatchCount: nativeMismatchCount, changedIds: details.changedIds.slice(0, 20), changedKeyCount: details.changedKeys.length,
        changedKeys: details.changedKeys.slice(0, 30) }));
  }

  async function verifyBytes(snapshot, stage) {
    const text = await checked(mainTarget.send, `const file=app.vault.getAbstractFileByPath(${JSON.stringify(snapshot.path)});if(!file)throw Error('baseline file disappeared');return await app.vault.read(file);`);
    assert.equal(text, snapshot.text, `${stage}: original bytes/unknown fields/miroSource changed`);
    report.checks[stage] = { exactBytes: true, unknownAndSourcePreserved: true, sha256: hash(text), path: snapshot.path };
  }

  try {
    mkdirSync(out, { recursive: true });
    if (options["--main-target"]) {
      const target = (await listTargets(port)).find(target => target.type === "page" && target.id === options["--main-target"]);
      assert.ok(target, "exact main target not found");
      mainTarget = await connectTarget(target);
    } else mainTarget = await connectByTitle(port, serial ? "Obsidian" : undefined);
    report.sdkCapture = await captureNativeSdk(mainTarget.send);
    report.runtime = await checked(mainTarget.send, "return identity;");
    if (background) {
      assert.equal(await checked(mainTarget.send, "return Boolean(document.querySelector('.miro-canvas-settings'));"), true,
        "background mode requires parent-prepared inline plugin settings; no native popup creation attempted");
    }
    const pluginAssets = await checked(mainTarget.send, `const directory=app.vault.configDir+'/plugins/miro-canvas/';
      return await Promise.all(['main.js','manifest.json','styles.css'].map(async name=>({name,text:await app.vault.adapter.read(directory+name)})));`);
    report.pluginAssets = Object.fromEntries(pluginAssets.map(asset => [asset.name, hash(asset.text)]));
    const initialTheme = await checked(mainTarget.send, "return app.vault.getConfig('theme');");
    const original = await settleBeforeBaseline(undefined, "original-before-actions");
    saved = { file: original.path, snapshot: original, theme: initialTheme };
    if (theme !== undefined) await checked(mainTarget.send, `app.changeTheme(${JSON.stringify(theme)});app.updateTheme();return true;`);
    if (background) {
      settings = mainTarget;
    } else {
      await checked(mainTarget.send, "app.setting.open();app.setting.openTabById('miro-canvas');return true;");
      await wait(400);
      if (await checked(mainTarget.send, "return Boolean(document.querySelector('.miro-canvas-settings'));")) settings = mainTarget;
      else {
        for (const target of await listTargets(port)) {
          if (target.type !== "page" || target.id === mainTarget.target.id) continue;
          const candidate = await connectTarget(target);
          try {
            if (await checked(candidate.send, "return Boolean(document.querySelector('.miro-canvas-settings'));")) { settings = candidate; break; }
          } finally {
            if (settings !== candidate) candidate.close();
          }
        }
      }
    }
    assert.ok(settings, "plugin settings page did not open");
    await checked(settings.send, "document.querySelector('.miro-canvas-settings').scrollTop=0;return true;");
    await shot(settings.send, "settings");
    const initial = await checked(settings.send, `const root=document.querySelector('.miro-canvas-settings');return {
      sections:[...root.querySelectorAll('[data-miro-settings-section]')].map(e=>e.dataset.miroSettingsSection),width:root.clientWidth,scrollWidth:root.scrollWidth};`);
    assert.equal(initial.sections.length, 12);
    assert.ok(initial.scrollWidth <= initial.width + 1, "settings must not overflow horizontally");
    report.checks.sections = initial;
    if (background) {
      report.dropdownSetup = await checked(settings.send, `const select=document.querySelector('.miro-canvas-settings-jump select');
        if(!select)throw Error('section select missing');const index=[...select.options].findIndex(option=>option.value==='drawing');
        if(index<1)throw Error('drawing option/predecessor missing');select.selectedIndex=index-1;select.focus({preventScroll:true});
        if(document.activeElement!==select)throw Error('DOM focus setup failed');return {classification:'DOM predecessor/focus setup; no select click or popup',predecessor:select.value,target:'drawing'};`);
      await trustedKey(settings.send, "ArrowDown");
      await wait(100);
      assert.equal(await checked(settings.send, "return document.activeElement===document.querySelector('[data-miro-settings-section=drawing] .setting-item-name');"), true,
        "background ArrowDown did not invoke the native jump; no Enter-on-select/popup fallback attempted");
      await trustedKey(settings.send, "Enter");
    } else {
      await tap(settings.send, await point(settings.send, ".miro-canvas-settings-jump select"));
      for (let step = 0; step < (serial ? 6 : 5); step++) {
        if (serial) execFileSync(adb, ["-s", serial, "shell", "input", "keyevent", "20"], { windowsHide: true, timeout: 12000 });
        else await trustedKey(settings.send, "ArrowDown");
      }
      if (serial) execFileSync(adb, ["-s", serial, "shell", "input", "keyevent", "66"], { windowsHide: true, timeout: 12000 });
      else await trustedKey(settings.send, "Enter");
    }
    await wait(300);
    const selected = await checked(settings.send, `const root=document.querySelector('.miro-canvas-settings');
      const heading=root.querySelector('[data-miro-settings-section=drawing] .setting-item-name');const header=document.querySelector('.modal-header');
      return {focus:document.activeElement===heading,focusedText:document.activeElement?.textContent,y:heading.getBoundingClientRect().top,
        headerBottom:header?.getBoundingClientRect().bottom??root.getBoundingClientRect().top,value:root.querySelector('.miro-canvas-settings-jump select').value};`);
    assert.equal(selected.focus, true, `section heading receives keyboard focus: ${selected.focusedText}`);
    assert.equal(selected.value, "", "same section can be chosen again");
    assert.ok(selected.y >= selected.headerBottom - 1, "heading must clear the native header");
    await trustedKey(settings.send, "Tab");
    assert.equal(await checked(settings.send, "return document.activeElement?.closest('.setting-item')?.previousElementSibling?.dataset.miroSettingsSection;"), "drawing", "Tab reaches the first setting in the section");
    report.checks.nativeSectionJump = { ...selected, keyboardContinuation: true };
    await shot(settings.send, "drawing");
    await checked(settings.send, "document.querySelector('.miro-canvas-settings').scrollTop=0;return true;");
    await checked(mainTarget.send, `if(window.__l20SettingsCreationProbe)throw Error('creation probe already owned');
      const vault=app.vault,create=vault.create,probe={records:[],restore:()=>{vault.create=create;delete window.__l20SettingsCreationProbe;}};
      window.__l20SettingsCreationProbe=probe;vault.create=async function(path,text,...args){const file=await Reflect.apply(create,this,[path,text,...args]);
        if(path.endsWith('.canvas'))probe.records.push({path,text});return file;};return true;`);
    await tap(settings.send, await point(settings.send, ".miro-canvas-settings-action button"));
    let fresh;
    for (let attempt = 0; attempt < 40; attempt++) {
      fresh = await checked(mainTarget.send, "const file=app.workspace.getActiveFile();return {path:file?.path,ready:file?.extension==='canvas'&&!!app.workspace.activeLeaf?.view?.canvas};");
      if (fresh.path !== saved.file && fresh.ready) break;
      await wait(250);
    }
    assert.ok(fresh.ready && fresh.path !== saved.file, "fresh welcome board did not open");
    const creation = await checked(mainTarget.send, `const probe=window.__l20SettingsCreationProbe;if(!probe)throw Error('creation capture missing');
      try{if(probe.records.length!==1)throw Error('exactly one fresh Canvas creation required');return probe.records[0];}finally{probe.restore();}`);
    assert.equal(creation.path, fresh.path, "initial raw creation belongs to fresh active board");
    await checked(mainTarget.send, "app.setting.close();return true;");
    await wait(300);
    await checked(mainTarget.send, "const c=app.workspace.activeLeaf.view.canvas;c.zoomToBbox({minX:-40,minY:-40,maxX:1920,maxY:640});c.setViewport(c.tx,c.ty,c.tZoom);return true;");
    welcomeBaseline = await settleBeforeBaseline(fresh.path, "fresh-welcome-after-native-viewport", creation.text);
    const raw = JSON.parse(welcomeBaseline.text);
    const welcome = { path: welcomeBaseline.path, sections: raw.nodes.filter(node => node.type === "group" && /^\d+\./u.test(node.label ?? "")).length,
      route: raw.nodes.find(node => typeof node.text === "string" && node.text.includes("1.") && node.text.includes("6.") && node.text.includes("8."))?.text };
    assert.equal(welcome.sections, 12);
    assert.ok(welcome.route, "tutorial keeps its short route");
    await verifyBytes(saved.snapshot, "prior-board-before-export");
    report.checks.freshWelcome = { path: welcome.path, sections: welcome.sections, shortRoute: true, newFile: true };
    await shot(mainTarget.send, "welcome");
    await checked(mainTarget.send, "app.plugins.plugins['miro-canvas'].activeM1Session().openExport();return true;");
    await wait(300);
    const help = await checked(mainTarget.send, "const e=document.querySelector('.miro-canvas-export__layout-hint');const panel=document.querySelector('.miro-canvas-export');return {text:e?.textContent,width:panel?.clientWidth,scrollWidth:panel?.scrollWidth};");
    assert.ok(help.text);
    assert.ok(help.scrollWidth <= help.width + 1, "export panel must not overflow horizontally");
    report.checks.exportHelp = help;
    await shot(mainTarget.send, "export");
    await verifyBytes(welcomeBaseline, "fresh-welcome-after-export");
    report.passed = true;
  } catch (error) {
    report.error = error.message;
    process.exitCode = 1;
  } finally {
    if (saved && mainTarget) {
      report.restoration.attempted = true;
      try {
        await checked(mainTarget.send, "window.__l20SettingsCreationProbe?.restore();app.setting.close();app.plugins.plugins['miro-canvas']?.activeM1Session()?.closeExport();return true;");
        if (welcomeBaseline) await verifyBytes(welcomeBaseline, "fresh-welcome-after-close");
        await checked(mainTarget.send, `const file=app.vault.getAbstractFileByPath(${JSON.stringify(saved.file)});if(!file)throw Error('original file missing');
          const leaf=app.workspace.getLeaf(false);await leaf.openFile(file,{active:${!background}});
          ${background ? "app.workspace.setActiveLeaf(leaf,{focus:false});" : ""}
          app.changeTheme(${JSON.stringify(saved.theme)});app.updateTheme();return true;`);
        await settleBeforeBaseline(saved.file, "original-after-restoration");
        await verifyBytes(saved.snapshot, "prior-board-after-restoration");
        const assets = await checked(mainTarget.send, `const directory=app.vault.configDir+'/plugins/miro-canvas/';
          return await Promise.all(['main.js','manifest.json','styles.css'].map(async name=>({name,text:await app.vault.adapter.read(directory+name)})));`);
        assert.deepEqual(Object.fromEntries(assets.map(asset => [asset.name, hash(asset.text)])), report.pluginAssets, "installed plugin asset bytes changed during test");
        report.checks.pluginAssetBytes = { unchanged: true, fingerprints: report.pluginAssets };
        report.restoration.passed = true;
      } catch (error) {
        report.restoration.error = error.message;
        report.passed = false;
        process.exitCode = 1;
      }
    }
    if (settings && settings !== mainTarget) settings.close();
    mainTarget?.close();
    writeFileSync(`${out}settings-navigation-${label}.json`, JSON.stringify(report, null, 2).replace(/\n/g, "\r\n") + "\r\n", "utf8");
    console.log(JSON.stringify({ label, passed: report.passed, background, screenshotStatus: background ? "skipped" : report.screenshots.length,
      runtime: report.runtime, report: `${out}settings-navigation-${label}.json`, error: report.error, restoration: report.restoration }, null, 2));
  }
}

function guardRuntime(options) {
  if (typeof app === "undefined" || !app.vault) throw new Error("ready Obsidian test vault required");
  let base = app.vault.adapter.getBasePath?.()?.split(String.fromCharCode(92)).join("/") ?? "";
  if (app.isMobile ? !options.mobile || app.vault.getName() !== "MiroCanvasTest" : options.mobile || !base.includes("/tools/obsidian_cdp/.out/")) throw new Error("isolated Windows test vault or supported MiroCanvasTest device required");
  if (options.expectedVault && base.replace(/\/$/u, "").toLowerCase() !== options.expectedVault.split(String.fromCharCode(92)).join("/").replace(/\/$/u, "").toLowerCase()) throw new Error("exact expected vault mismatch");
  const sdk = window.__l20NativeSdk;
  if (!sdk) throw new Error("parent must capture the real Obsidian SDK from the isolated plugin loader before this probe");
  const version = sdk.apiVersion;
  if (typeof version !== "string" || typeof sdk.requireApiVersion !== "function") throw new Error("cannot verify supported Obsidian API runtime");
  if (!sdk.requireApiVersion(options.minimum)) throw new Error(`Obsidian API ${version} is below minimum ${options.minimum}; SettingDefinition settings are unsupported, test refused`);
  if (typeof sdk.PluginSettingTab?.prototype?.getSettingDefinitions !== "function") throw new Error(`SettingDefinition API unavailable on reported API ${version}; supported-runtime settings test refused`);
  let windowId = null;
  if (options.background) {
    if (app.isMobile || !navigator.userAgent.includes("Windows")) throw new Error("--background requires Windows");
    const window = require("@electron/remote").getCurrentWindow();
    if (window.isDestroyed() || window.isVisible()) throw new Error("--background requires a parent-prepared already-hidden window");
    windowId = window.id;
  }
  return { apiVersion: version, minimum: options.minimum, settingDefinitionAvailable: true, vault: app.vault.getName(), base,
    platform: app.isMobile ? "Android" : "Windows", windowId, installedPluginVersion: app.plugins?.plugins?.["miro-canvas"]?.manifest?.version ?? null };
}
