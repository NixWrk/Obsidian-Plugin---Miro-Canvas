import {describe,it,expect} from "vitest";
import {commentSelectionId, pointInSelectionBox, previewBoardSelection, rectIntersectsBox, routeContainedInBox, routeEndsInBox, selectedComment, selectionMovesLineData, translateBoardSelection} from "../src/board-selection";
import { buildCanvasAnchorGeometry } from "../src/connector-endpoints";
describe("connector marquee hit testing",()=>{
  const a={x:10,y:10},b={x:20,y:20};
  it("does not select a long connector just because it crosses the box",()=>{
    expect(routeContainedInBox([{x:0,y:15},{x:30,y:15}],a,b)).toBe(false);
    expect(routeContainedInBox([{x:15,y:0},{x:15,y:30}],b,a)).toBe(false);
  });
  it("selects a whole route in either drag direction",()=>{
    const route=[{x:10,y:15},{x:15,y:18},{x:20,y:15}];
    expect(routeContainedInBox(route,a,b)).toBe(true);
    expect(routeContainedInBox(route,b,a)).toBe(true);
  });
  it("rejects a curved route that bows outside and invalid routes",()=>{
    expect(routeContainedInBox([{x:11,y:15},{x:15,y:25},{x:19,y:15}],a,b)).toBe(false);
    expect(routeContainedInBox([{x:15,y:15},{x:15,y:15}],a,b)).toBe(true);
    expect(routeContainedInBox([{x:15,y:15},{x:NaN,y:15}],a,b)).toBe(false);
    expect(routeContainedInBox([],a,b)).toBe(false);
  });
  it("records only the endpoint caught by a small marquee",()=>{
    expect(routeEndsInBox([{x:15,y:15},{x:30,y:15}],a,b)).toEqual({from:true,to:false,wholeRoute:false});
    expect(routeEndsInBox([{x:0,y:15},{x:30,y:15}],a,b)).toBeUndefined();
  });
});

describe("endpoint-aware group movement",()=>{
  const document=()=>({nodes:[],edges:[],miroCanvas:{schemaVersion:1,connectors:{
    long:{id:"long",from:{type:"free",x:15,y:15},to:{type:"free",x:300,y:15},route:"straight",color:"#123456",width:2,startCap:"none",endCap:"arrow"}
  }}});
  it("moves the captured free end, never the far end",()=>{
    const before=document();
    const after=translateBoardSelection(before,["long"],20,10,{long:{from:true,to:false,wholeRoute:false}}) as any;
    expect(after.miroCanvas.connectors.long.from).toMatchObject({x:35,y:25});
    expect(after.miroCanvas.connectors.long.to).toMatchObject({x:300,y:15});
    expect(before.miroCanvas.connectors.long.from.x).toBe(15);
  });
  it("keeps an attached selected end attached to a node moved in the same group",()=>{
    const before=document() as any;
    before.nodes=[{id:"n",type:"text",x:0,y:0,width:30,height:30}];
    before.miroCanvas.connectors.long.from={type:"node",nodeId:"n",u:1,v:0.5};
    const after=translateBoardSelection(before,["n","long"],20,10,{long:{from:true,to:false,wholeRoute:false}}) as any;
    expect(after.nodes[0]).toMatchObject({x:20,y:10});
    expect(after.miroCanvas.connectors.long.from).toEqual(before.miroCanvas.connectors.long.from);
    expect(after.miroCanvas.connectors.long.to).toMatchObject({x:300,y:15});
  });
  it("moves just the selected native edge end through a free-anchor override",()=>{
    const before={nodes:[
      {id:"a",type:"text",x:0,y:0,width:30,height:30},
      {id:"b",type:"text",x:300,y:0,width:30,height:30}],
      edges:[{id:"e",fromNode:"a",toNode:"b"}],miroCanvas:{schemaVersion:1,localOverrides:{}}};
    const after=translateBoardSelection(before,["e"],20,10,{e:{from:true,to:false,wholeRoute:false}}) as any;
    expect(after.miroCanvas.localOverrides.e.connectorAnchors.from).toMatchObject({type:"free",x:35,y:25});
    expect(after.miroCanvas.localOverrides.e.connectorAnchors.to).toBeUndefined();
    expect(after.nodes).toEqual(before.nodes);
  });
  it("keeps a native end attached when its node is inside the same selection",()=>{
    const before={nodes:[
      {id:"a",type:"text",x:0,y:0,width:30,height:30},
      {id:"b",type:"text",x:300,y:0,width:30,height:30}],
      edges:[{id:"e",fromNode:"a",toNode:"b"}],miroCanvas:{schemaVersion:1,localOverrides:{}}};
    const after=translateBoardSelection(before,["a","e"],20,10,{e:{from:true,to:false,wholeRoute:false}}) as any;
    expect(after.nodes[0]).toMatchObject({x:20,y:10});
    expect(after.nodes[1]).toEqual(before.nodes[1]);
    expect(after.miroCanvas.localOverrides.e).toBeUndefined();
  });
});

describe("painted rectangle hit testing",()=>{
  const rect={left:100,top:100,right:140,bottom:140};
  it("uses the node or pin center, not any overlapping corner",()=>{
    const center={x:120,y:120};
    expect(pointInSelectionBox(center,{x:110,y:110},{x:150,y:150})).toBe(true);
    expect(pointInSelectionBox(center,{x:150,y:150},{x:110,y:110})).toBe(true);
    expect(pointInSelectionBox(center,{x:130,y:130},{x:180,y:180})).toBe(false);
  });
  it("requires full containment for frame groups",()=>{
    expect(rectIntersectsBox(rect,{x:110,y:110},{x:150,y:150},true)).toBe(false);
    expect(rectIntersectsBox(rect,{x:90,y:90},{x:150,y:150},true)).toBe(true);
  });
  it("rejects invalid painted bounds",()=>{
    expect(rectIntersectsBox({...rect,left:NaN},{x:90,y:90},{x:150,y:150})).toBe(false);
  });
});

describe("comment-inclusive selection movement",()=>{
  const document=()=>({nodes:[{id:"n",type:"text",x:0,y:0,width:100,height:100}],edges:[],miroCanvas:{
    schemaVersion:1,localComments:[
      {id:"free",text:"Free",anchor:{type:"free",x:200,y:50},replies:[]},
      {id:"attached",text:"Attached",anchor:{type:"node",nodeId:"n",u:0.5,v:0.5},replies:[]}
    ],commentPlaces:{}}});
  it("moves a free comment and node in one detached preview",()=>{
    const before=document();const id=commentSelectionId("local","free");
    expect(selectedComment(id)).toEqual({origin:"local",id:"free",key:"local:free"});
    const after=translateBoardSelection(before,["n",id],30,20) as any;
    expect(after.nodes[0]).toMatchObject({x:30,y:20});
    expect(after.miroCanvas.commentPlaces["local:free"]).toEqual({type:"free",x:230,y:70});
    expect(before.nodes[0].x).toBe(0);expect(before.miroCanvas.commentPlaces).toEqual({});
  });
  it("retains a selected comment's attachment when its parent moves too",()=>{
    const before=document(),id=commentSelectionId("local","attached");
    const together=translateBoardSelection(before,["n",id],30,20) as any;
    expect(together.miroCanvas.commentPlaces["local:attached"]).toBeUndefined();
    const alone=translateBoardSelection(before,[id],30,20) as any;
    expect(alone.miroCanvas.commentPlaces["local:attached"]).toEqual({type:"free",x:80,y:70});
  });
});

describe("the preview of a dragged selection", () => {
  const board = () => ({
    nodes: [
      { id: "a", type: "text", x: 0, y: 0, width: 30, height: 30 },
      { id: "b", type: "text", x: 300, y: 0, width: 30, height: 30 },
      { id: "c", type: "text", x: 600, y: 0, width: 30, height: 30 },
    ],
    edges: [{ id: "ab", fromNode: "a", toNode: "b" }, { id: "bc", fromNode: "b", toNode: "c" }],
    miroSource: { items: [{ id: "a", data: { deep: [1, 2, 3] } }] },
    miroCanvas: {
      schemaVersion: 1,
      localOverrides: { ab: { connector: { waypoints: [{ x: 100, y: 5 }] }, connectorAnchors: { from: { type: "free", x: 40, y: 10 } } } },
      connectors: {
        long: { id: "long", from: { type: "free", x: 15, y: 15 }, to: { type: "free", x: 300, y: 15 }, route: "straight", color: "#123456", width: 2, startCap: "none", endCap: "arrow" },
      },
    },
  });
  const written = (value: unknown) => JSON.parse(JSON.stringify(value));

  it("is the board the write makes, to the last field, in every kind of move", () => {
    for (const [ids, ends] of [
      [["a"], {}],
      [["a", "b"], {}],
      [["a", "b", "c"], {}],
      [["long"], {}],
      [["a", "long"], {}],
      [["ab"], { ab: { from: true, to: false, wholeRoute: true } }],
      [["long"], { long: { from: true, to: false, wholeRoute: false } }],
    ] as const) {
      const before = board();
      expect(written(previewBoardSelection(before, ids, 20, 10, ends))).toEqual(written(translateBoardSelection(before, ids, 20, 10, ends)));
    }
  });

  it("never writes into the board it was made from", () => {
    const before = board();
    const untouched = written(before);
    for (const ids of [["a", "b"], ["long"], ["a", "b", "c", "long"]]) previewBoardSelection(before, ids, 20, 10);
    previewBoardSelection(before, ["ab"], 20, 10, { ab: { from: true, to: true, wholeRoute: true } });
    expect(written(before)).toEqual(untouched);
  });

  it("shares what the move does not change, so a board of thousands costs what moved", () => {
    const before = board();
    const preview = previewBoardSelection(before, ["a"], 20, 10) as any;
    expect(preview.miroSource).toBe(before.miroSource);
    expect(preview.edges).toBe(before.edges);
    expect(preview.miroCanvas).toBe(before.miroCanvas);
    expect(preview.nodes[1]).toBe(before.nodes[1]);
    expect(preview.nodes[2]).toBe(before.nodes[2]);
    expect(preview.nodes[0]).not.toBe(before.nodes[0]);
    expect(preview.nodes[0]).toMatchObject({ x: 20, y: 10 });
    // The connectors stay one record while none of them is carried, so what is read from them stays known.
    expect(preview.miroCanvas.connectors).toBe(before.miroCanvas.connectors);
    // A selected connector is carried in a copy of what the plugin keeps; the board's own stays as it was.
    const carried = previewBoardSelection(before, ["long"], 20, 10) as any;
    expect(carried.miroCanvas).not.toBe(before.miroCanvas);
    expect(carried.miroCanvas.connectors.long.from).toMatchObject({ x: 35, y: 25 });
    expect(before.miroCanvas.connectors.long.from.x).toBe(15);
    expect(carried.miroSource).toBe(before.miroSource);
  });

  it("copies what a line holds only when both its cards move with free ends or waypoints", () => {
    const before = board();
    const moved = previewBoardSelection(before, ["a", "b"], 20, 10) as any;
    expect(moved.miroCanvas.localOverrides.ab.connector.waypoints[0]).toMatchObject({ x: 120, y: 15 });
    expect(moved.miroCanvas.localOverrides.ab.connectorAnchors.from).toMatchObject({ x: 60, y: 20 });
    expect(before.miroCanvas.localOverrides.ab.connector.waypoints[0]).toMatchObject({ x: 100, y: 5 });
    expect(selectionMovesLineData(before, ["a", "b"])).toBe(true);
    expect(selectionMovesLineData(before, ["a"])).toBe(false);
    expect(selectionMovesLineData(before, ["b", "c"])).toBe(false);
    expect(selectionMovesLineData(before, ["ab"])).toBe(true);
    expect(selectionMovesLineData({ nodes: [], edges: [] }, ["a"])).toBe(false);
  });
});

describe("captured ends shared by repeated mixed selection moves", () => {
  const board = () => ({
    extension: { deep: ["root"] },
    miroSource: { items: [{ id: "a", evidence: { deep: ["source"] } }] },
    nodes: [
      { id: "frame", type: "group", x: -10, y: -10, width: 60, height: 60, extension: { deep: ["frame"] } },
      { id: "a", type: "text", x: 0, y: 0, width: 30, height: 30, extension: { deep: ["card"] } },
      { id: "b", type: "text", x: 300, y: 0, width: 30, height: 30, extension: { deep: ["far card"] } },
    ],
    edges: [{ id: "native", fromNode: "a", toNode: "b", extension: { deep: ["native"] } }],
    miroCanvas: {
      schemaVersion: 1,
      extension: { deep: ["metadata"] },
      localOverrides: { native: { extension: { deep: ["override"] }, connectorAnchors: {
        from: { type: "node", nodeId: "a", u: 0.5, v: 0.5, extension: { deep: ["attached"] } },
        to: { type: "free", x: 315, y: 15, extension: { deep: ["far native end"] } },
        extension: { deep: ["anchor record"] },
      } } },
      connectors: {
        chain: { id: "chain", from: { type: "edge", edgeId: "native", t: 0, extension: { deep: ["chain attachment"] } },
          to: { type: "free", x: 400, y: 15, extension: { deep: ["far chain end"] } }, route: "straight",
          color: "#123456", width: 2, startCap: "none", endCap: "arrow", extension: { deep: ["chain"] } },
        long: { id: "long", from: { type: "edge", edgeId: "chain", t: 0 },
          to: { type: "free", x: 500, y: 15, extension: { deep: ["far independent end"] } }, route: "straight",
          color: "#123456", width: 2, startCap: "none", endCap: "arrow", extension: { deep: ["long"] } },
      },
      localComments: [{ id: "pin", text: "Free", anchor: { type: "free", x: 15, y: 35 }, replies: [], extension: { deep: ["comment"] } }],
      commentPlaces: { "local:untouched": { type: "free", x: 900, y: 900, extension: { deep: ["pin"] } } },
    },
  });
  const ids = ["frame", "a", "native", "chain", "long", commentSelectionId("local", "pin")];
  const ends = {
    native: { from: true, to: false, wholeRoute: false },
    chain: { from: true, to: false, wholeRoute: false },
    long: { from: true, to: false, wholeRoute: false },
  };

  it("uses the same captured mask for preview, commit and the next drag through two chained lines", () => {
    let before = board();
    const source = structuredClone(before.miroSource);
    const mask = structuredClone(ends);
    for (const [dx, dy] of [[20, 10], [-5, 7]]) {
      const original = structuredClone(before);
      const preview = previewBoardSelection(before, ids, dx, dy, ends) as typeof before;
      const committed = translateBoardSelection(before, ids, dx, dy, ends) as typeof before;
      expect(preview).toEqual(committed);
      expect(before).toEqual(original);
      expect(preview.miroSource).toBe(before.miroSource);
      expect(committed.miroSource).toEqual(source);
      expect(committed.nodes[2]).toEqual(original.nodes[2]);
      expect(committed.miroCanvas.localOverrides.native.connectorAnchors).toEqual(original.miroCanvas.localOverrides.native.connectorAnchors);
      expect(committed.miroCanvas.connectors.chain.from).toEqual(original.miroCanvas.connectors.chain.from);
      expect(committed.miroCanvas.connectors.long.from).toEqual(original.miroCanvas.connectors.long.from);
      expect(committed.miroCanvas.connectors.chain.to).toEqual(original.miroCanvas.connectors.chain.to);
      expect(committed.miroCanvas.connectors.long.to).toEqual(original.miroCanvas.connectors.long.to);
      for (const value of ["native", "chain", "long"]) {
        const originalGeometry = buildCanvasAnchorGeometry(original).edges?.[value];
        const previewGeometry = buildCanvasAnchorGeometry(preview).edges?.[value];
        expect(originalGeometry?.start).toBeDefined();
        expect(previewGeometry?.start).toMatchObject({
          x: originalGeometry!.start!.x + dx,
          y: originalGeometry!.start!.y + dy,
        });
        expect(previewGeometry?.end).toEqual(originalGeometry?.end);
        expect(previewGeometry).toEqual(buildCanvasAnchorGeometry(committed).edges?.[value]);
      }
      expect(committed.extension).toEqual(original.extension);
      expect(committed.nodes[0].extension).toEqual(original.nodes[0].extension);
      expect(committed.nodes[1].extension).toEqual(original.nodes[1].extension);
      expect(committed.edges).toEqual(original.edges);
      expect(committed.miroCanvas.extension).toEqual(original.miroCanvas.extension);
      expect(committed.miroCanvas.localOverrides.native.extension).toEqual(original.miroCanvas.localOverrides.native.extension);
      expect(committed.miroCanvas.connectors.chain.extension).toEqual(original.miroCanvas.connectors.chain.extension);
      expect(committed.miroCanvas.connectors.long.extension).toEqual(original.miroCanvas.connectors.long.extension);
      expect(committed.miroCanvas.localComments).toEqual(original.miroCanvas.localComments);
      const pin = buildCanvasAnchorGeometry(original).comments?.["local:pin"];
      expect(pin).toBeDefined();
      expect(committed.miroCanvas.commentPlaces).toMatchObject({ "local:pin": { type: "free", x: pin!.x + dx, y: pin!.y + dy } });
      expect(committed.miroCanvas.commentPlaces["local:untouched"]).toEqual(original.miroCanvas.commentPlaces["local:untouched"]);
      expect(ends).toEqual(mask);
      before = committed;
    }
  });

  it("does not move uncaught waypoints and far ends when moving just the native from end", () => {
    const before = {
      nodes: board().nodes,
      edges: board().edges,
      miroCanvas: { schemaVersion: 1, localOverrides: { native: {
        connector: { waypoints: [{ x: 100, y: 60, extension: { deep: ["waypoint"] } }], extension: { deep: ["route"] } },
        connectorAnchors: { from: { type: "free", x: 15, y: 15, extension: { deep: ["caught"] } },
          to: { type: "free", x: 315, y: 15, extension: { deep: ["far"] } } },
      } } },
    };
    const original = structuredClone(before);
    const preview = previewBoardSelection(before, ["native"], 20, 10, { native: ends.native }) as typeof before;
    expect(preview).toEqual(translateBoardSelection(before, ["native"], 20, 10, { native: ends.native }));
    expect(preview.miroCanvas.localOverrides.native.connector).toEqual(original.miroCanvas.localOverrides.native.connector);
    expect(preview.miroCanvas.localOverrides.native.connectorAnchors.to).toEqual(original.miroCanvas.localOverrides.native.connectorAnchors.to);
    expect(preview.miroCanvas.localOverrides.native.connectorAnchors.from).toMatchObject({ type: "free", x: 35, y: 25 });
    expect(before).toEqual(original);
  });
});
