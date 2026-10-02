export async function checked(s, code) {
  const value = await s.eval(code);
  if (value?.error) throw new Error(value.error);
  return value;
}

export async function board(s, name, data, files = []) {
  await checked(s, `
    const window = require('@electron/remote').getCurrentWindow();
    window.setAlwaysOnTop(true);
    window.show();
    window.focus();
    await app.plugins.plugins['miro-canvas'].saveCanvasSettings({panelLayout:{}});
    const files = ${JSON.stringify([...files, [name, JSON.stringify(data)]])};
    for (const [path, body] of files) {
      const file = app.vault.getAbstractFileByPath(path);
      if (file) await app.vault.modify(file, body);
      else await app.vault.create(path, body);
    }
    await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(name)}), {active:true});
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
}

export async function cleanup(s) {
  await checked(s, "require('@electron/remote').getCurrentWindow().setAlwaysOnTop(false); return true;");
}

export async function click(s, target) {
  await s.move(target, {duration:650});
  await s.wait(180);
  await s.click(target);
  await s.wait(350);
}

export async function finish(s, caption) {
  await s.caption(caption);
  await s.move({x:90,y:650}, {duration:550});
  await s.wait(2500);
}
