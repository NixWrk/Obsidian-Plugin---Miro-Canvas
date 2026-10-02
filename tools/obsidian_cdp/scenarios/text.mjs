// Text tool - T, click, type; font, size, bold, italic from selection toolbar.
//
//   node record.mjs --scenario scenarios/text.mjs --out ../../docs/media/en/text.gif --port 9336 --fps 7 --width 760
//   node record.mjs --scenario scenarios/text.mjs --out ../../docs/media/ru/text.gif --port 9336 --fps 7 --width 760
export default async function (s) {
  await s.wait(800);

  // 1. Pick Text tool (T) and click to create
  await s.caption({
    en: "1. Press T for Text tool, click the board, and start typing",
    ru: "1. Нажмите T для инструмента Текст, кликните по доске и начните печатать",
  });
  await s.wait(800);

  await s.key("T");
  await s.wait(400);
  await s.move({ x: 500, y: 300 });
  await s.wait(300);
  await s.click({ x: 500, y: 300 });
  await s.wait(400);
  await s.type("Hello Miro Canvas");
  await s.wait(500);
  await s.key("Escape");
  await s.wait(600);

  // 2. Select the text to show the selection toolbar
  await s.caption({
    en: "2. Select the text — the toolbar appears with font, size, style, colors",
    ru: "2. Выделите текст — появится панель со шрифтом, размером, стилями, цветами",
  });
  await s.wait(800);

  await s.move({ x: 500, y: 300 });
  await s.wait(300);
  await s.click({ x: 500, y: 300 });
  await s.wait(600);

  // 3. Change font family
  await s.caption({
    en: "3. Open font menu and pick a different font family",
    ru: "3. Откройте меню шрифтов и выберите другой шрифт",
  });
  await s.wait(800);

  const fontBtn = await s.find({ selector: '[data-tool="font-family"]' });
  if (fontBtn) {
    await s.move(fontBtn);
    await s.wait(300);
    await s.click(fontBtn);
    await s.wait(500);
    const fontOption = await s.find({ selector: '.miro-canvas-font-family-option:nth-child(2)' });
    if (fontOption) {
      await s.move(fontOption);
      await s.wait(200);
      await s.click(fontOption);
    }
    await s.wait(500);
  }

  // 4. Change font size
  await s.caption({
    en: "4. Adjust font size with the stepper or type a value",
    ru: "4. Измените размер шрифта стрелочками или введите значение",
  });
  await s.wait(800);

  const sizeInc = await s.find({ selector: '[data-tool="font-size-increase"]' });
  if (sizeInc) {
    await s.move(sizeInc);
    await s.wait(300);
    await s.click(sizeInc);
    await s.wait(400);
    await s.click(sizeInc);
    await s.wait(400);
  }

  // 5. Bold and Italic
  await s.caption({
    en: "5. Toggle Bold and Italic — they apply to the whole selection",
    ru: "5. Включите Жирный и Курсив — они применяются ко всему выделению",
  });
  await s.wait(800);

  const boldBtn = await s.find({ selector: '[data-tool="bold"]' });
  if (boldBtn) {
    await s.move(boldBtn);
    await s.wait(300);
    await s.click(boldBtn);
    await s.wait(500);
  }
  const italicBtn = await s.find({ selector: '[data-tool="italic"]' });
  if (italicBtn) {
    await s.move(italicBtn);
    await s.wait(300);
    await s.click(italicBtn);
    await s.wait(500);
  }

  // 6. Text color and highlight
  await s.caption({
    en: "6. Change text color and highlight — pick from palette or recent colors",
    ru: "6. Смените цвет текста и маркер — выберите из палитры или недавних цветов",
  });
  await s.wait(800);

  const textColorBtn = await s.find({ selector: '[data-tool="text-color"]' });
  if (textColorBtn) {
    await s.move(textColorBtn);
    await s.wait(300);
    await s.click(textColorBtn);
    await s.wait(500);
    const colorSwatch = await s.find({ selector: '.miro-canvas-color-swatch:nth-child(3)' });
    if (colorSwatch) {
      await s.move(colorSwatch);
      await s.wait(200);
      await s.click(colorSwatch);
    }
    await s.wait(500);
  }

  const highlightBtn = await s.find({ selector: '[data-tool="highlight"]' });
  if (highlightBtn) {
    await s.move(highlightBtn);
    await s.wait(300);
    await s.click(highlightBtn);
    await s.wait(500);
    const highlightSwatch = await s.find({ selector: '.miro-canvas-color-swatch:nth-child(5)' });
    if (highlightSwatch) {
      await s.move(highlightSwatch);
      await s.wait(200);
      await s.click(highlightSwatch);
    }
    await s.wait(500);
  }

  // 7. Alignment
  await s.caption({
    en: "7. Change alignment — left, center, right, justify; and vertical alignment",
    ru: "7. Смените выравнивание — по левому краю, по центру, по правому, по ширине; и вертикальное",
  });
  await s.wait(800)

  const alignBtn = await s.find({ selector: '[data-tool="align-center"]' });
  if (alignBtn) {
    await s.move(alignBtn);
    await s.wait(300);
    await s.click(alignBtn);
    await s.wait(500);
  }

  // 8. Bullet list and Link
  await s.caption({
    en: "8. Add a bullet list or turn text into a Markdown link",
    ru: "8. Добавьте маркированный список или сделайте текст ссылкой",
  });
  await s.wait(800);

  const listBtn = await s.find({ selector: '[data-tool="bullet-list"]' });
  if (listBtn) {
    await s.move(listBtn);
    await s.wait(300);
    await s.click(listBtn);
    await s.wait(600);
  }

  // Deselect to show final result
  await s.key("Escape");
  await s.wait(600);

  await s.caption({ en: "2. Result", ru: "2. Результат" });
  await s.wait(2000);
}