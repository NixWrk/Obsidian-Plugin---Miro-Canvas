// Frames tool - F, dragging a frame out, naming it, moving it with what it holds.
//
//   node record.mjs --scenario scenarios/frames.mjs --out ../../docs/media/en/frames.gif --port 9336 --fps 8 --width 800
//   node record.mjs --scenario scenarios/frames.mjs --out ../../docs/media/ru/frames.gif --port 9336 --fps 8 --width 800
export default async function (s) {
  await s.wait(800);

  // 1. Initial state - press F for Frame tool
  await s.caption({
    en: "1. Press F for Frame tool — drag on the board to create a frame",
    ru: "1. Нажмите F для инструмента Фрейм — перетащите на доске, чтобы создать фрейм",
  });
  await s.wait(800);

  await s.key("F");
  await s.wait(500);

  // Drag to create frame - slower, more steps, like a human
  await s.drag({ x: 300, y: 200 }, { x: 700, y: 450 }, { steps: 28 });
  await s.wait(800);

  // 2. Name the frame
  await s.caption({
    en: "2. Click the frame title to name it — frames hold and move items together",
    ru: "2. Кликните по заголовку фрейма, чтобы назвать его — фреймы держат и двигают элементы вместе",
  });
  await s.wait(800);

  // Move to title area first (human-like approach)
  await s.move({ x: 330, y: 220 });
  await s.wait(300);
  await s.click({ x: 330, y: 220 });
  await s.wait(400);
  await s.type("My Project");
  await s.wait(400);
  await s.key("Escape");
  await s.wait(600);

  // 3. Create some items inside the frame
  await s.caption({
    en: "3. Create items inside the frame — they become part of it",
    ru: "3. Создайте элементы внутри фрейма — они станут его частью",
  });
  await s.wait(800);

  await s.key("N"); // Sticky note
  await s.wait(400);
  await s.move({ x: 400, y: 280 });
  await s.wait(200);
  await s.click({ x: 400, y: 280 });
  await s.wait(300);
  await s.type("Task 1");
  await s.wait(300);
  await s.key("Escape");
  await s.wait(500);

  await s.key("T"); // Text
  await s.wait(400);
  await s.move({ x: 500, y: 350 });
  await s.wait(200);
  await s.click({ x: 500, y: 350 });
  await s.wait(300);
  await s.type("Notes");
  await s.wait(300);
  await s.key("Escape");
  await s.wait(500);

  // 4. Move the frame - everything inside moves with it
  await s.caption({
    en: "4. Drag the frame by its title — everything inside moves together",
    ru: "4. Перетащите фрейм за заголовок — всё внутри двигается вместе",
  });
  await s.wait(800);

  // Approach title, pause, then drag smoothly
  await s.move({ x: 340, y: 225 });
  await s.wait(400);
  await s.drag({ x: 340, y: 225 }, { x: 500, y: 300 }, { steps: 32 });
  await s.wait(1000);

  // 5. Resize frame
  await s.caption({
    en: "5. Drag a corner to resize — items inside stay positioned relative to frame",
    ru: "5. Перетащите угол, чтобы изменить размер — элементы внутри остаются относительно фрейма",
  });
  await s.wait(800);

  // Move to corner, pause, drag
  await s.move({ x: 860, y: 560 });
  await s.wait(400);
  await s.drag({ x: 860, y: 560 }, { x: 960, y: 630 }, { steps: 24 });
  await s.wait(800);

  await s.caption({ en: "2. Result", ru: "2. Результат" });
  await s.wait(2000);
}