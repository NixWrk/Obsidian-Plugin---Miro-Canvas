export async function checked(s, code) {
  const value = await s.eval(code);
  if (value?.error) throw new Error(value.error);
  return value;
}

export async function board(s, name, data, files = []) {
  data = {
    ...data,
    miroCanvas: { schemaVersion: 1, ...data.miroCanvas, settings: { minimapVisible: false, ...data.miroCanvas?.settings }, localOverrides: { ...data.miroCanvas?.localOverrides } },
  };
  for (const node of data.nodes) {
    if (node.type !== 'text') continue;
    const appearance = data.miroCanvas.localOverrides[node.id] ?? {};
    data.miroCanvas.localOverrides[node.id] = {
      ...appearance,
      typography: { fontSize: 26, ...appearance.typography },
    };
  }
  await checked(s, `
    const window = require('@electron/remote').getCurrentWindow();
    window.setAlwaysOnTop(true);
    window.show();
    window.focus();
    app.changeTheme(${JSON.stringify(s.theme==='dark'?'obsidian':'moonstone')});
    app.updateTheme();
    await app.plugins.plugins['miro-canvas'].saveCanvasSettings({panelLayout:{},minimapVisible:false,toolbarItems:['select','lasso','text','card','sticky','shape','pen','connector','comment','frame','note','media']});
    const files = ${JSON.stringify([...files, [name, JSON.stringify(data)]])};
    for (const [path, body] of files) {
      const file = app.vault.getAbstractFileByPath(path);
      if (file) await app.vault.modify(file, body);
      else await app.vault.create(path, body);
    }
    await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(name)}), {active:true});
    app.plugins.plugins['miro-canvas'].m1Session.resetTools();
    app.plugins.plugins['miro-canvas'].m1Session.setTheme(${JSON.stringify(s.theme)});
    app.workspace.leftSplit.collapse();
    app.workspace.rightSplit.collapse();
    return true;
  `);
  await s.wait(800);
  await checked(s, `
    const canvas = app.workspace.activeLeaf.view.canvas;
    canvas.zoomToBbox({minX:-500,minY:-280,maxX:500,maxY:280});
    canvas.setViewport(canvas.tx,canvas.ty,canvas.tZoom);
    for (const [id,node] of canvas.nodes) node.nodeEl.dataset.demoId = id;
    return true;
  `);
  await s.wait(600);
  await s.move({x:90,y:650});
  await s.click({x:90,y:650});
}

export async function cleanup(s) {
  await checked(s, "require('@electron/remote').getCurrentWindow().setAlwaysOnTop(false); return true;");
}

export async function click(s, target) {
  if (target.selector) {
    let ready = await s.find(target);
    for (let attempt = 0; !ready && attempt < 25; attempt += 1) {
      await s.wait(100);
      ready = await s.find(target);
    }
    if (!ready) throw new Error('The recording control did not become visible: ' + target.selector);
  }
  await s.move(target, {duration:650});
  await s.wait(180);
  await s.click(target);
  await s.wait(350);
}

export async function finish(s, caption) {
  await s.caption(typeof caption === 'string' ? '✓ ' + caption : Object.fromEntries(Object.entries(caption).map(([language, text]) => [language, '✓ ' + text])));
  await s.move({x:90,y:650}, {duration:550});
  await s.wait(3000);
}
