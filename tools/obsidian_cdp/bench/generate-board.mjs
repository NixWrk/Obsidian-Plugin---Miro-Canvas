// Writes a large synthetic board for the drag benchmark (see ../README.md,
// "Benchmarking a drag").  The board is the same every time for the same
// size: N cards on a grid (every tenth a sticky note, one in fifty of those
// turned a little, every tenth a shape), about N/2 native edges between
// neighbouring cards, about N/4 of the plugin's own connectors from a card to
// the one below it, and one frame for every 400 cards, listed after the cards
// so "the first K cards" of the board are cards.  Its `miroCanvas` record is
// schema/v1-valid.
//
//   node tools/obsidian_cdp/bench/generate-board.mjs --cards 5000
//   node tools/obsidian_cdp/bench/generate-board.mjs --cards 2000 --out some/dir/board-2000.canvas
//
// Default output: tools/obsidian_cdp/.out/bench/board-<N>.canvas (ignored by git).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CARD_WIDTH = 240;
const CARD_HEIGHT = 120;
const GAP_X = 60;
const GAP_Y = 60;
const CARDS_PER_FRAME = 400;
const SHAPES = ["rectangle", "ellipse", "diamond"];

function parseArgs(argv) {
  const options = { cards: 2000, out: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === "--cards") {
      options.cards = Number.parseInt(value, 10);
      index += 1;
    } else if (name === "--out") {
      options.out = value;
      index += 1;
    } else {
      throw new Error(`unknown option ${name}`);
    }
  }
  if (!Number.isSafeInteger(options.cards) || options.cards < 2) throw new Error("--cards takes a whole number of at least 2");
  return options;
}

/** The board for `cardCount` cards, as a plain object ready for JSON. */
export function generateBoard(cardCount) {
  const columns = Math.ceil(Math.sqrt(cardCount));
  const nodes = [];
  const edges = [];
  const localOverrides = {};
  const connectors = {};
  const place = (index) => ({
    x: (index % columns) * (CARD_WIDTH + GAP_X),
    y: Math.floor(index / columns) * (CARD_HEIGHT + GAP_Y),
  });
  for (let index = 0; index < cardCount; index += 1) {
    const id = `card-${index}`;
    const { x, y } = place(index);
    if (index % 10 === 5) {
      nodes.push({ id, type: "text", text: `Sticky ${index}`, x, y, width: 200, height: 200 });
      const override = { item: { type: "sticky_note", color: "yellow" } };
      // One sticky in fifty is turned, so a selection holds rotated items too.
      if (index % 500 === 5) override.rotation = 8;
      localOverrides[id] = override;
    } else if (index % 10 === 8) {
      nodes.push({ id, type: "text", text: `Shape ${index}`, x, y, width: CARD_WIDTH, height: CARD_HEIGHT });
      localOverrides[id] = { shape: { kind: SHAPES[index % SHAPES.length], fallback: "text" } };
    } else {
      nodes.push({ id, type: "text", text: `Card ${index}\n\nSome text on it.`, x, y, width: CARD_WIDTH, height: CARD_HEIGHT });
    }
  }
  // A native edge from every other card to its right-hand neighbour.
  for (let index = 0; index + 1 < cardCount; index += 2) {
    if ((index + 1) % columns === 0) continue;
    edges.push({ id: `edge-${index}`, fromNode: `card-${index}`, toNode: `card-${index + 1}`, fromSide: "right", toSide: "left" });
  }
  // One of the plugin's own connectors from every fourth card to the card below.
  for (let index = 0; index + columns < cardCount; index += 4) {
    const id = `connector-${index}`;
    connectors[id] = {
      id,
      from: { type: "node", nodeId: `card-${index}`, u: 0.5, v: 1 },
      to: { type: "node", nodeId: `card-${index + columns}`, u: 0.5, v: 0 },
      route: "straight",
      color: "#1e1e1e",
      width: 2,
      startCap: "none",
      endCap: "stealth",
    };
  }
  // Frames last: each surrounds a block of cards, and none is among "the first K cards".
  const frameCount = Math.ceil(cardCount / CARDS_PER_FRAME);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const first = place(frame * CARDS_PER_FRAME);
    nodes.push({
      id: `frame-${frame}`,
      type: "group",
      label: `Frame ${frame}`,
      x: first.x - 20,
      y: first.y - 20,
      width: CARD_WIDTH * 3 + GAP_X * 2 + 40,
      height: CARD_HEIGHT * 2 + GAP_Y + 40,
    });
  }
  return {
    nodes,
    edges,
    miroCanvas: {
      schemaVersion: 1,
      localOverrides,
      connectors,
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const out = resolve(options.out ?? join(TOOL_DIR, ".out", "bench", `board-${options.cards}.canvas`));
  const board = generateBoard(options.cards);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(board, null, "\t")}\n`);
  const connectorCount = Object.keys(board.miroCanvas.connectors).length;
  console.log(`${out}: ${board.nodes.length} nodes, ${board.edges.length} native edges, ${connectorCount} connectors`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
