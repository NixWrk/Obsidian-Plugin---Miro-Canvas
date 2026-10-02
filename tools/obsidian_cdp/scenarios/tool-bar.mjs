// "Show the tool bar at the bottom and press V T N S P L C F to arm each tool" - demonstrates
// the creation bar and its letter shortcuts. Runs unchanged in English and Russian: the only
// lookups are the `data-tool` attributes the bottom bar already sets (src/quick-tools.ts), which
// never change with the interface language.
//
//   node record.mjs --scenario scenarios/tool-bar.mjs --out ../../docs/media/en/tool-bar.gif --port 9336
//   node record.mjs --scenario scenarios/tool-bar.mjs --out ../../docs/media/ru/tool-bar.gif --port 9336 --lang ru
export default async function (s) {
  // A dedicated, empty board rather than the crowded welcome board: any
  // fixed click point on the welcome board would depend on its zoom/pan on
  // open, which this tool does not control.
  await s.eval(`
    const path = "CDP Tool Bar Demo.canvas";
    let file = app.vault.getAbstractFileByPath(path);
    if (!file) file = await app.vault.create(path, JSON.stringify({ nodes: [], edges: [] }));
    const leaf = app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true });
    return "opened";
  `);
  await s.wait(500);

  await s.caption({
    en: "1. The tool bar at the bottom; press V T N S P L C F to arm each tool",
    ru: "1. Нижняя панель инструментов; нажмите V T N S P L C F, чтобы выбрать каждый инструмент",
  });

  // The tool bar is at the bottom. We'll click each tool button to show it gets armed,
  // then press its letter shortcut to show the same effect.
  // Order: select (V), text (T), sticky (N), shape (S), pen (P), connector (L), comment (C), frame (F)
  const tools = [
    { tool: "select", key: "V" },
    { tool: "text", key: "T" },
    { tool: "sticky", key: "N" },
    { tool: "shape", key: "S" },
    { tool: "pen", key: "P" },
    { tool: "connector", key: "L" },
    { tool: "comment", key: "C" },
    { tool: "frame", key: "F" },
  ];

  for (const { tool, key } of tools) {
    // Click the tool button
    await s.click({ selector: `[data-tool="${tool}"]` });
    await s.wait(300);
    // Press the letter key
    await s.key(key);
    await s.wait(300);
  }

  await s.caption({ en: "2. Result", ru: "2. Результат" });
  await s.wait(1400);
}