if (app.isMobile) {
  if (app.vault.getName() !== "MiroCanvasTest") throw Error("test vault required");
} else {
  if (!app.vault.adapter.basePath.replaceAll("\\", "/").includes("/tools/obsidian_cdp/.out/l20-windows/vault")) throw Error("test vault required");
  const windowOwner = require("@electron/remote").getCurrentWindow();
  if (windowOwner.isVisible() || windowOwner.isFocused()) throw Error("background window required");
}
const plugin = app.plugins.plugins["miro-canvas"];
globalThis.featurePrior ??= { path: app.workspace.getActiveFile()?.path, settings: structuredClone(plugin.canvasSettings) };
const name = "Canvas enhancements " + Date.now() + ".canvas";
const board = {
  nodes: [
    { id: "group", type: "group", label: "Collapsed group", x: 0, y: 0, width: 900, height: 500 },
    { id: "a", type: "text", text: "[[Feature Reference]] Launch card", x: 350, y: 200, width: 160, height: 110 },
    { id: "b", type: "text", text: "Second card", x: 580, y: 200, width: 160, height: 110 },
    { id: "outside", type: "text", text: "Outside", x: 1100, y: 0, width: 180, height: 110 },
  ],
  edges: [
    { id: "external", fromNode: "a", toNode: "outside", fromSide: "right", toSide: "left", label: "External" },
    { id: "internal", fromNode: "a", toNode: "b", fromSide: "right", toSide: "left" },
  ],
  miroCanvas: {
    schemaVersion: 1,
    properties: { tags: ["featureboard"], aliases: ["Feature Alias"], related: "[[Feature Reference]]" },
    connectors: {
      inner: { id: "inner", from: { type: "free", x: 100, y: 100 }, to: { type: "free", x: 700, y: 400 }, route: "straight", color: "#123456", width: 2, startCap: "none", endCap: "none" },
      chain: { id: "chain", from: { type: "edge", edgeId: "inner", t: 0.5 }, to: { type: "node", nodeId: "outside", u: 0, v: 0.5 }, route: "straight", color: "#123456", width: 2, startCap: "none", endCap: "arrow" },
    },
    localComments: [{ id: "pin", text: "Inside comment", anchor: { type: "free", x: 450, y: 250 }, replies: [] }],
  },
  miroSource: { future: { evidence: "exact" } },
  future: { keep: true },
};
if (!app.vault.getAbstractFileByPath("Feature Reference.md")) await app.vault.create("Feature Reference.md", "---\nrelated: '[[Feature Other]]'\n---\nNeedle inside linked note #featuretag");
const file = await app.vault.create(name, JSON.stringify(board));
await app.workspace.getLeaf(false).openFile(file, { active: true });
globalThis.featureFixture = { name, board };
await new Promise(resolve => setTimeout(resolve, 500));
const session = plugin.m1Session;
const canvas = session?.view.canvas;
canvas.selectOnly(canvas.nodes.get("group"));
session.refresh();
return {
  name, status: session?.status,
  buttons: [...session.toolbar.element.querySelectorAll("button")].filter(element => element.getBoundingClientRect().width > 0).map(element => ({ title: element.getAttribute("aria-label") })),
  group: canvas.nodes.get("group").nodeEl.outerHTML.slice(0, 1500),
};
