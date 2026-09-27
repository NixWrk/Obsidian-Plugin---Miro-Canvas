// Settings -> Miro Canvas -> Interface -> "Show the minimap by default".
// Runs unchanged in English and Russian: the settings tab is opened by id
// (language-independent), and the toggle itself is found by its text in
// *either* language (`s.find`'s textEn/textRu fallback) since Obsidian's
// generic Setting component gives it no selector of its own to hook.
//
//   node record.mjs --scenario scenarios/setting-minimap-default.mjs --out ../../docs/media/en/setting-minimap-default.gif --port 9336
//   node record.mjs --scenario scenarios/setting-minimap-default.mjs --out ../../docs/media/ru/setting-minimap-default.gif --port 9336 --lang ru
export default async function (s) {
  await s.caption({
    en: "1. Settings → Miro Canvas → Interface",
    ru: "1. Настройки → Miro Canvas → Интерфейс",
  });
  await s.openSettingsTab("miro-canvas");
  await s.wait(500);

  const toggle = await s.find({
    selector: ".setting-item",
    textEn: "Show the minimap by default",
    textRu: "Показывать миникарту по умолчанию",
    controlSelector: ".checkbox-container",
  });
  if (!toggle) throw new Error('the "Show the minimap by default" setting was not found');
  await s.click(toggle);
  await s.wait(600);

  await s.caption({ en: "2. Result", ru: "2. Результат" });
  await s.wait(300);
  await s.closeSettings();
  await s.wait(400);
  // The toggled default only affects the next board opened, or a reload of
  // the current one - reopen the active file so the minimap's new default
  // state is what the "Result" half of the GIF actually shows.
  await s.eval(`
    const active = app.workspace.getActiveFile();
    if (active) await app.workspace.getLeaf().openFile(active, { active: true });
    return "reopened";
  `);
  await s.wait(800);
}
