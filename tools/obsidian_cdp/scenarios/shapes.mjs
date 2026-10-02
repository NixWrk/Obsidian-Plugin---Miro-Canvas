// Shapes tool - S, picker with basic shapes and flowchart set, hint meaning, text inside; turning a card into another shape.
//
//   node record.mjs --scenario scenarios/shapes.mjs --out ../../docs/media/en/shapes.gif --port 9336 --fps 7 --width 760
//   node record.mjs --scenario scenarios/shapes.mjs --out ../../docs/media/ru/shapes.gif --port 9336 --fps 7 --width 760
export default async function (s) {
  await s.wait(800);

  // 1. Initial state - empty area on welcome board
  await s.caption({
    en: "1. Press S for Shapes tool — the picker opens with basic shapes and flowcharts",
    ru: "1. Нажмите S для инструмента Фигура — откроется пикер с базовыми фигурами и блок-схемами",
  });
  await s.wait(800);

  await s.key("S");
  await s.wait(600);

  // Hover over a few shapes to show tooltips (hints)
  const rectBtn = await s.find({ selector: '[data-shape="rectangle"]' });
  if (rectBtn) {
    await s.move(rectBtn);
    await s.wait(800); // Show tooltip
  }

  const diamondBtn = await s.find({ selector: '[data-shape="diamond"]' });
  if (diamondBtn) {
    await s.move(diamondBtn);
    await s.wait(800); // Show tooltip
  }

  // 2. Create a rectangle shape by clicking on board
  await s.caption({
    en: "2. Click a shape in the picker, then click the board — the shape appears with text inside",
    ru: "2. Кликните по фигуре в пикере, потом по доске — фигура появится с текстом внутри",
  });
  await s.wait(800);

  if (rectBtn) {
    await s.move(rectBtn);
    await s.wait(300);
    await s.click(rectBtn);
  }
  await s.wait(500);
  await s.move({ x: 400, y: 300 });
  await s.wait(300);
  await s.click({ x: 400, y: 300 });
  await s.wait(600);

  // Type text inside the shape
  await s.type("Process Step");
  await s.wait(500);
  await s.key("Escape");
  await s.wait(600);

  // 3. Select the shape to show selection toolbar, change to another shape
  await s.caption({
    en: "3. Select the shape — toolbar appears. Click Shape button to change it to a different shape",
    ru: "3. Выделите фигуру — появится панель. Нажмите кнопку Фигура, чтобы сменить на другую",
  });
  await s.wait(800);

  await s.move({ x: 400, y: 300 });
  await s.wait(300);
  await s.click({ x: 400, y: 300 });
  await s.wait(600);

  const shapeToolbarBtn = await s.find({ selector: '[data-tool="shape"]' });
  if (shapeToolbarBtn) {
    await s.move(shapeToolbarBtn);
    await s.wait(300);
    await s.click(shapeToolbarBtn);
    await s.wait(500);
    // Pick a different shape (e.g., rounded rectangle)
    const roundedBtn = await s.find({ selector: '[data-shape="round_rectangle"]' });
    if (roundedBtn) {
      await s.move(roundedBtn);
      await s.wait(300);
      await s.click(roundedBtn);
    }
    await s.wait(600);
  }

  // 4. Create a flowchart shape (diamond = decision)
  await s.caption({
    en: "4. Flowchart shapes have meaning — diamond is Decision, rectangle is Process",
    ru: "4. Фигуры блок-схемы имеют смысл — ромб это Решение, прямоугольник это Процесс",
  });
  await s.wait(800);

  await s.key("S");
  await s.wait(500);
  if (diamondBtn) {
    await s.move(diamondBtn);
    await s.wait(300);
    await s.click(diamondBtn);
  }
  await s.wait(500);
  await s.move({ x: 700, y: 300 });
  await s.wait(300);
  await s.click({ x: 700, y: 300 });
  await s.wait(500);
  await s.type("Decision?");
  await s.wait(500);
  await s.key("Escape");
  await s.wait(600);

  // 5. Show the result - both shapes on board
  await s.caption({ en: "2. Result", ru: "2. Результат" });
  await s.wait(2000);
}