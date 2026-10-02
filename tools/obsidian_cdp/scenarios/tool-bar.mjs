// Tool bar at the bottom - letters V T N S P L C F arm their tools.
// Shows the bar, each tool's letter, and that picking a tool arms it (accent colour).
//
//   node record.mjs --scenario scenarios/tool-bar.mjs --out ../../docs/media/en/tool-bar.gif --port 9336 --fps 7 --width 760
//   node record.mjs --scenario scenarios/tool-bar.mjs --out ../../docs/media/ru/tool-bar.gif --port 9336 --fps 7 --width 760
export default async function (s) {
  await s.wait(800);

  // 1. Show the tool bar and its letters
  await s.caption({
    en: "1. The bottom tool bar — each tool has a letter (V T N S P L C F)",
    ru: "1. Нижняя панель инструментов — у каждого есть буква (V T N S P L C F)",
  });
  await s.wait(1200);

  // Highlight each tool button in sequence by hovering (human pace)
  const tools = [
    '[data-tool="select"]',
    '[data-tool="text"]',
    '[data-tool="sticky"]',
    '[data-tool="shape"]',
    '[data-tool="pen"]',
    '[data-tool="line"]',
    '[data-tool="comment"]',
    '[data-tool="frame"]',
  ];

  for (const sel of tools) {
    const btn = await s.find({ selector: sel });
    if (btn) {
      await s.move(btn);
      await s.wait(400);
    }
  }

  // 2. Demonstrate arming tools by letter key
  await s.caption({
    en: "2. Press a letter to arm a tool — it highlights in accent colour",
    ru: "2. Нажмите букву, чтобы выбрать инструмент — он подсветится акцентным цветом",
  });
  await s.wait(800);

  for (const key of ["N", "T", "S", "P", "L", "C", "F", "V"]) {
    await s.key(key);
    await s.wait(500);
  }

  // 3. Click a button to arm (sticky note), then click board to create
  await s.caption({
    en: "3. Click a button, then click the board — the item appears where you clicked",
    ru: "3. Кликните по кнопке, потом по доске — элемент появится в точке клика",
  });
  await s.wait(800);

  await s.click({ selector: '[data-tool="sticky"]' });
  await s.wait(400);
  await s.move({ x: 800, y: 400 });
  await s.wait(200);
  await s.click({ x: 800, y: 400 });
  await s.wait(400);
  await s.type("Created by clicking");
  await s.wait(400);
  await s.key("Escape");
  await s.wait(500);

  // 4. Drag a tool button onto the board (drag-to-create)
  await s.caption({
    en: "4. Drag a tool button onto the board — a ghost follows, release to create",
    ru: "4. Перетащите кнопку инструмента на доску — призрак следует за курсором, отпустите, чтобы создать",
  });
  await s.wait(800);

  const shapeBtn = await s.find({ selector: '[data-tool="shape"]' });
  if (shapeBtn) {
    await s.move(shapeBtn);
    await s.wait(300);
    await s.drag(shapeBtn, { x: 600, y: 300 }, { steps: 24 });
    await s.wait(600);
    await s.key("Escape");
    await s.wait(500);
  }

  // 5. The More menu (+) holds additional tools
  await s.caption({
    en: "5. The + menu holds Code block, Table, Web link, and Canvas's Card, Note, File",
    ru: "5. Меню + содержит Блок кода, Таблицу, Веб-ссылку, и Карточку, Заметку, Файл Canvas",
  });
  await s.wait(800);

  const moreBtn = await s.find({ selector: '[data-tool="more"]' });
  if (moreBtn) {
    await s.move(moreBtn);
    await s.wait(300);
    await s.click(moreBtn);
    await s.wait(500);
    const menuItems = [
      '[data-tool="code"]',
      '[data-tool="table"]',
      '[data-tool="link"]',
      '[data-tool="card"]',
      '[data-tool="note"]',
      '[data-tool="file"]',
    ];
    for (const sel of menuItems) {
      const item = await s.find({ selector: sel });
      if (item) {
        await s.move(item);
        await s.wait(300);
      }
    }
    await s.click({ x: 100, y: 100 });
    await s.wait(400);
  }

  await s.caption({ en: "2. Result", ru: "2. Результат" });
  await s.wait(2000);
}