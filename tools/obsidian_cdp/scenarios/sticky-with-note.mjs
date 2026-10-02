// A quick idea beside a real Obsidian note. Setup is excluded from the recording.
const copy = {
  ru: {
    note: "Встреча команды.md",
    body: "В пятницу, после 18:00.\n\nЧто обсудим:\n- Идеи на следующую неделю\n- Кто чем займётся\n\nПодробности: [[План проекта]]",
    project: "План проекта.md",
    projectBody: "# План проекта\n\nЗдесь будут задачи после встречи.\n",
    board: "Стикер и заметка.canvas",
    sticky: "Выбрать место",
  },
  en: {
    note: "Team meeting.md",
    body: "Friday, after 6 pm.\n\nWhat to discuss:\n- Ideas for next week\n- Who will do what\n\nDetails: [[Project plan]]",
    project: "Project plan.md",
    projectBody: "# Project plan\n\nTasks from the meeting will go here.\n",
    board: "Sticky note and note.canvas",
    sticky: "Choose a place",
  },
};

async function checked(s, code) {
  const result = await s.eval(code);
  if (result?.error) throw new Error(result.error);
  return result;
}

export async function prepare(s) {
  const text = copy[s.lang];
  await checked(s, `
    const text = ${JSON.stringify(text)};
    const window = require('@electron/remote').getCurrentWindow();
    window.setAlwaysOnTop(true);
    window.show();
    window.focus();
    for (const [path, body] of [[text.note, text.body], [text.project, text.projectBody]]) {
      const existing = app.vault.getAbstractFileByPath(path);
      if (!existing) await app.vault.create(path, body);
      else await app.vault.modify(existing, body);
    }
    const board = { nodes: [{ id: "f100000000000001", type: "file", file: text.note, x: 200, y: -180, width: 390, height: 350 }], edges: [] };
    let file = app.vault.getAbstractFileByPath(text.board);
    if (file) await app.vault.modify(file, JSON.stringify(board));
    else file = await app.vault.create(text.board, JSON.stringify(board));
    await app.workspace.getLeaf(false).openFile(file, { active: true });
    app.workspace.leftSplit.collapse();
    app.workspace.rightSplit.collapse();
    return true;
  `);
  await s.wait(700);
  await checked(s, `
    const canvas = app.workspace.activeLeaf.view.canvas;
    canvas.zoomToBbox({ minX: -400, minY: -260, maxX: 730, maxY: 300 });
    canvas.setViewport(canvas.tx, canvas.ty, canvas.tZoom);
    canvas.nodes.get("f100000000000001").nodeEl.dataset.demoNote = "true";
    return true;
  `);
  await s.wait(700);
  await s.caption({ en: "1. Add a quick idea beside your note", ru: "1. Добавим стикер рядом с заметкой" });
  await s.move({ x: 550, y: 620 });
}

export async function cleanup(s) {
  await checked(s, "require('@electron/remote').getCurrentWindow().setAlwaysOnTop(false); return true;");
}

export default async function (s) {
  const text = copy[s.lang];
  const note = await s.find({ selector: '.canvas-node[data-demo-note="true"]' });
  if (!note) throw new Error("the note card is not on the page");
  const place = { x: note.x - note.width / 2 - 290, y: note.y - 10 };
  await s.wait(1100);
  await s.move({ selector: '[data-tool="sticky"]' }, { duration: 650 });
  await s.wait(200);
  await s.click({ selector: '[data-tool="sticky"]' });
  await s.move(place, { duration: 900 });
  await s.wait(250);
  await s.click(place);
  await s.wait(350);
  await s.click(place, { count: 2 });
  await s.wait(300);
  await s.type(text.sticky, { interval: 95 });
  await s.wait(450);
  await s.key("Escape");
  await s.wait(250);
  const endpoints = await checked(s, `
    const canvas = app.workspace.activeLeaf.view.canvas;
    const data = canvas.getData();
    const sticky = data.nodes.find(node => node.type === "text");
    if (!sticky || sticky.text !== ${JSON.stringify(text.sticky)}) throw new Error("the sticky note text was not entered");
    const rect = id => {
      const element = canvas.nodes.get(id)?.nodeEl;
      if (!element) throw new Error("a card is not drawn");
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, y: box.top + box.height / 2 };
    };
    const from = rect(sticky.id);
    const to = rect("f100000000000001");
    return { from: {x: from.right - 4, y: from.y}, to: {x: to.left + 4, y: to.y} };
  `);
  await s.key("L");
  await s.move(endpoints.from, { duration: 600 });
  await s.wait(250);
  await s.drag(endpoints.from, endpoints.to, { duration: 1000 });
  await s.wait(350);
  await s.key("Escape");
  await checked(s, `
    const data = app.workspace.activeLeaf.view.canvas.getData();
    if (data.nodes.length !== 2 || data.edges.length !== 1) throw new Error("expected two cards and one native edge");
    return { cards: data.nodes.length, edges: data.edges.length };
  `);
  await s.caption({ en: "2. Quick ideas on sticky notes. Details in Obsidian.", ru: "2. Короткая мысль — на стикере. Подробности — в заметке." });
  await s.move({ x: place.x - 110, y: note.y + note.height / 2 + 65 }, { duration: 650 });
  await s.wait(2300);
}
