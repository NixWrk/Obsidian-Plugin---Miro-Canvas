// "Pick the sticky note tool and click the board" - the shortest possible
// creation gesture, recorded for the README/docs.  Runs unchanged in English
// and Russian: the caption is a {en, ru} pair, and the only lookup that
// matters (the sticky-note tool button) is the `data-tool` attribute the
// bottom bar already sets (src/quick-tools.ts), which never changes with the
// interface language.
//
//   node record.mjs --scenario scenarios/sticky-note.mjs --out ../../docs/media/en/sticky-note.gif --port 9336
//   node record.mjs --scenario scenarios/sticky-note.mjs --out ../../docs/media/ru/sticky-note.gif --port 9336 --lang ru
export default async function (s) {
  // A dedicated, empty board rather than the crowded welcome board: any
  // fixed click point on the welcome board would depend on its zoom/pan on
  // open, which this tool does not control.
  await s.eval(`
    const path = "CDP Sticky Note Demo.canvas";
    let file = app.vault.getAbstractFileByPath(path);
    if (!file) file = await app.vault.create(path, JSON.stringify({ nodes: [], edges: [] }));
    const leaf = app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true });
    return "opened";
  `);
  await s.wait(500);

  await s.caption({
    en: "1. Pick the sticky note (N) and click the board",
    ru: "1. Выберите стикер (N) и щёлкните по доске",
  });
  await s.click({ selector: '[data-tool="sticky"]' });
  await s.wait(400);
  await s.click({ x: 500, y: 360 });
  await s.wait(400);
  await s.type("Hello from Miro Canvas");
  await s.wait(300);
  await s.key("Escape");
  await s.wait(500);

  await s.caption({ en: "2. Result", ru: "2. Результат" });
  await s.wait(1400);
}
