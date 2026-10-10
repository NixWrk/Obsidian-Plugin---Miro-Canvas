// Native receipt/repair trace before code: docs/native-group-gesture-checks.md.
// Real session guard + preview + authoring + SVG renderers; only native host/UI
// shells are fixtures. Native drag deliberately moves only native nodes.
import { afterEach, describe, expect, it, vi } from "vitest";
import { M1CanvasSession } from "../src/m1-session";
import { MetadataWriter } from "../src/metadata-writer";
import { createObsidianMetadataStore } from "../src/obsidian-metadata-store";
import { SourceRenderer } from "../src/source-renderer";
import { ConnectorLayer } from "../src/connector-layer";
import { buildCanvasAnchorGeometry } from "../src/connector-endpoints";
import { collapsedGroupOwners } from "../src/board-groups";

vi.mock("../src/m1-controls", () => ({ M1Controls: class {
  element = new HostElement();
  minimapElement = new HostElement();
  update() {}
  dispose() { this.element.remove(); }
} }));

type Data = Record<string, any>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
// Node's EventTarget needs an options object to remove a capture listener;
// browsers normalize the boolean form used by the session.
class WindowEvents extends EventTarget {
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
    super.removeEventListener(type, callback, typeof options === 'boolean' ? {capture:options} : options);
  }
}
class HostElement extends EventTarget {
  nodeType = 1;
  parentElement?: HostElement;
  children: HostElement[] = [];
  attributes = new Map<string, string>();
  classes = new Set<string>();
  values = new Map<string, string>();
  ownerDocument?: unknown;
  clientWidth = 800;
  clientHeight = 600;
  classList = {
    add: (key: string) => { this.classes.add(key); }, remove: (key: string) => { this.classes.delete(key); },
    contains: (key: string) => this.classes.has(key), toggle: (key: string, on: boolean) => { if (on) this.classes.add(key); else this.classes.delete(key); },
  };
  style = {
    setProperty: (key: string, value: string) => { this.values.set(key, value); },
    removeProperty: (key: string) => { this.values.delete(key); },
    getPropertyValue: (key: string) => this.values.get(key) ?? "", getPropertyPriority: () => "",
  };
  constructor(public tagName = "div", classes = "") { super(); classes.split(" ").filter(Boolean).forEach(key=>this.classes.add(key)); }
  get parentNode() { return this.parentElement; }
  get isConnected() { return true; }
  appendChild(child: HostElement) { child.parentElement?.removeChild(child); child.parentElement = this; this.children.push(child); return child; }
  removeChild(child: HostElement) { this.children = this.children.filter(item=>item!==child); child.parentElement = undefined; return child; }
  replaceChild(next: HostElement, old: HostElement) { const at = this.children.indexOf(old); this.children[at] = next; next.parentElement = this; old.parentElement = undefined; }
  remove() { this.parentElement?.removeChild(this); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); if (key==='class') this.classes = new Set(value.split(' ')); }
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  hasAttribute(key: string) { return this.attributes.has(key); }
  removeAttribute(key: string) { this.attributes.delete(key); }
  contains(value: unknown): boolean { return value===this || this.children.some(child=>child.contains(value)); }
  closest(selector: string): HostElement | null {
    for (const part of selector.split(',').map(value=>value.trim())) {
      if (part[0]==='.' && this.classes.has(part.slice(1)) || part===this.tagName
        || part==='[contenteditable=true]' && this.attributes.get('contenteditable')==='true') return this;
    }
    return this.parentElement?.closest(selector) ?? null;
  }
  querySelectorAll(selector: string): HostElement[] {
    return this.children.flatMap(child=>[...(selector===child.tagName || selector[0]==='.' && child.classes.has(selector.slice(1)) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }; }
}

const sessions: M1CanvasSession[] = [];
afterEach(() => { sessions.splice(0).forEach(session=>session.dispose()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function fixture(scale = 0.5, locked?: string) {
  vi.stubGlobal("HTMLElement", HostElement);
  const root = new HostElement('div', 'canvas-wrapper');
  const window = new WindowEvents();
  const dom = { defaultView: window, createElement: (tag: string)=>new HostElement(tag), createElementNS: (_ns: string, tag: string)=>new HostElement(tag) } as unknown as Document;
  const initial: Data = {
    nodes: [{ id:'group',type:'group',x:0,y:0,width:900,height:500,label:'Frame' },
      {id:'a',type:'text',x:350,y:200,width:160,height:110,text:'A'},
      {id:'b',type:'text',x:580,y:200,width:160,height:110,text:'B'},
      {id:'outside',type:'text',x:1100,y:0,width:180,height:110,text:'Outside'}],
    edges: [{id:'external',fromNode:'a',fromSide:'right',toNode:'outside',toSide:'left'}],
    miroCanvas:{schemaVersion:1,localOverrides:{group:{groupCollapse:{width:900,height:500,children:['a','b']}}},
      connectors:{inner:{id:'inner',from:{type:'free',x:100,y:100,future:'from'},to:{type:'free',x:700,y:400},route:'straight',color:'#123456',width:2,startCap:'none',endCap:'none',future:'line'},
        chain:{id:'chain',from:{type:'edge',edgeId:'inner',t:0.5},to:{type:'node',nodeId:'outside',u:0,v:0.5},route:'straight',color:'#123456',width:2,startCap:'none',endCap:'arrow'},
        tail:{id:'tail',from:{type:'edge',edgeId:'chain',t:0},to:{type:'free',x:1400,y:0},route:'straight',color:'#123456',width:2,startCap:'none',endCap:'none'}},
      localComments:[{id:'pin',text:'Inside',anchor:{type:'free',x:450,y:250,future:'pin'},replies:[]}]},
    miroSource:{future:{evidence:'exact'}},future:{keep:true},
  };
  if (locked === 'pin') initial.miroCanvas.localComments[0].locked=true;
  else if (locked === 'review') initial.miroCanvas.settings={reviewMode:true};
  else if (locked) initial.miroCanvas.localOverrides[locked]={locked:true,...initial.miroCanvas.localOverrides[locked]};
  class NativeNode {
    nodeEl = root.appendChild(new HostElement('div','canvas-node'));
    constructor(public data: Data) { this.nodeEl.setAttribute('data-node-id',data.id); }
    get id() { return this.data.id; }
    get type() { return this.data.type; }
    get x() { return this.data.x; } get y() { return this.data.y; }
    get width() { return this.data.width; } get height() { return this.data.height; }
    getData() { return clone(this.data); }
    // Installed BaseNode.setData and moveAndResize round native geometry.
    setData(value: Data) { this.data={...clone(value),x:Math.round(value.x),y:Math.round(value.y),width:Math.round(value.width),height:Math.round(value.height)}; }
    moveAndResize(value: Data) { this.setData({...this.data,...value}); }
    moveTo(value: Data) { this.moveAndResize({width:this.width,height:this.height,...value}); }
  }
  const nodes = new Map<string, NativeNode>(initial.nodes.map((node: Data)=>[node.id,new NativeNode(clone(node))]));
  const label = nodes.get('group')!.nodeEl.appendChild(new HostElement('div','canvas-group-label'));
  const edges = new Map<string, Data>();
  for (const edge of initial.edges) {
    const lineGroupEl = root.appendChild(new HostElement('g'));
    const display = lineGroupEl.appendChild(new HostElement('path','canvas-display-path'));
    const hit = lineGroupEl.appendChild(new HostElement('path','canvas-interaction-path'));
    display.setAttribute('d','M 510 255 L 1100 55'); hit.setAttribute('d','M 510 255 L 1100 55');
    edges.set(edge.id,{...edge,lineGroupEl,getData:()=>clone(edge),setData() {}});
  }
  const selection = new Set<unknown>([nodes.get('group')]);
  const history = [clone(initial)];
  let current = 0;
  const nativeDrag = vi.fn((_event: unknown, _element: unknown, _node: unknown) => ({
    move: (event: {clientX:number;clientY:number})=>{ for(const id of ['group','a','b']) nodes.get(id)!.moveTo({x:initial.nodes.find((node:Data)=>node.id===id).x+event.clientX/scale,y:initial.nodes.find((node:Data)=>node.id===id).y+event.clientY/scale}); },
    end: ()=>canvas.requestSave(true), cancel: vi.fn(),
  }));
  const canvas = {
    wrapperEl:root,nodes,edges,selection,data:clone(initial),readonly:false,
    getData(): Data { return {...clone(this.data),nodes:[...nodes.values()].map(node=>node.getData())}; },
    setViewport() {},requestRender() {},setReadonly(value:boolean) { this.readonly=value; },
    selectOnly(node:unknown) { selection.clear();selection.add(node); },select(node:unknown) { selection.add(node); },deselectAll() { selection.clear(); },
    requestSave(addHistory:boolean) { this.data=this.getData();if(addHistory){history.splice(current+1);history.push(clone(this.data));current++;} },
    importData(document:Data) { this.data=clone(document);for(const node of document.nodes) nodes.get(node.id)!.setData(node); },
    undo() { if(current>0)this.importData(history[--current]!); },redo() { if(current+1<history.length)this.importData(history[++current]!); },
    handleSelectionDrag:nativeDrag,
  };
  const view={canvas},store=createObsidianMetadataStore(view).store;
  const session=new M1CanvasSession(view,new MetadataWriter(store!));sessions.push(session);
  expect(session.mount()).toBe(true);
  root.ownerDocument=dom;
  const internal=session as unknown as Data;
  // Presentation/layout is isolated; the gesture, policy and transaction stay real.
  internal.boardPoint=({x,y}:{x:number;y:number})=>({x:x/scale,y:y/scale});
  const document = ()=>internal.selectionMovePreview ?? canvas.getData();
  const geometry = ()=>buildCanvasAnchorGeometry(document(),undefined,undefined,undefined,collapsedGroupOwners(document()));
  const renderer=new SourceRenderer({getDocument:document,getNodes:()=>[],getEdges:()=>[...edges.values()],getCollapsedNodeOwners:()=>collapsedGroupOwners(document()),getAnchorGeometry:geometry,getSelectionMovePreviewIds:()=>internal.selectionMoveIds},dom);
  const layer=new ConnectorLayer(dom,{document,geometry,press:()=>undefined});
  internal.sourceRenderer=renderer;internal.connectorLayer=layer;
  const refresh=session.refresh.bind(session);
  internal.refresh=()=>{refresh();renderer.refresh();layer.render();};
  internal.refresh();
  const gesture=(pointerType='touch', target=label)=>({pointerId:7,pointerType,isPrimary:true,button:0,shiftKey:false,clientX:0,clientY:0,target,preventDefault(){},stopImmediatePropagation(){}});
  const dispatch=(type:string,x:number,y:number)=>{
    const event=new Event(type,{cancelable:true});
    for(const[key,value]of Object.entries({pointerId:7,button:0,shiftKey:false,clientX:x,clientY:y}))Object.defineProperty(event,key,{value});
    window.dispatchEvent(event);
  };
  return {session,internal,canvas,nodes,selection,nativeDrag,initial,history,label,gesture,dispatch,geometry,layer,renderer,root,get current(){return current;}};
}

describe('collapsed group drag through the native gesture entry',()=>{
  it.each([[0.5,'touch'],[1.25,'touch'],[0.5,'mouse'],[1.25,'mouse']] as const)('carries free connectors, pins and chains at scale %s through %s, then commits once and undoes exactly',(scale,type)=>{
    const f=fixture(scale),before=f.canvas.getData(),base=f.geometry();
    const gesture=f.canvas.handleSelectionDrag(f.gesture(type),f.label,f.nodes.get('group')) as any;
    f.dispatch('pointermove',240*scale,160*scale);gesture.move?.({clientX:240*scale,clientY:160*scale});
    const preview=f.geometry();
    expect(preview.edges!.chain!.start!.x).toBeCloseTo(base.edges!.chain!.start!.x+240,3);
    expect(preview.edges!.chain!.start!.y).toBeCloseTo(base.edges!.chain!.start!.y+160,3);
    expect(f.layer.routeOf('chain')!.start).toEqual(preview.edges!.chain!.start);
    expect(f.layer.routeOf('tail')!.start).toEqual(preview.edges!.tail!.start);
    expect(preview.comments!['local:pin']!.x).toBeCloseTo(base.comments!['local:pin']!.x+240,3);
    expect(preview.comments!['local:pin']!.y).toBeCloseTo(base.comments!['local:pin']!.y+160,3);
    expect(preview.edges!.chain!.end).toEqual(base.edges!.chain!.end);
    expect(preview.edges!.tail!.end).toEqual(base.edges!.tail!.end);
    const native=f.canvas.edges.get('external')!.lineGroupEl as HostElement;
    expect(native.querySelector('.canvas-display-path')!.getAttribute('d')).toMatch(/^M 520 192/);
    expect(native.querySelector('.canvas-interaction-path')!.getAttribute('d')).toBe(native.querySelector('.canvas-display-path')!.getAttribute('d'));
    expect(f.canvas.getData()).toEqual(before);expect(f.history).toHaveLength(1);
    f.dispatch('pointerup',240*scale,160*scale);gesture.end?.();
    const after=f.canvas.getData();
    expect(after.nodes[0]).toMatchObject({x:240,y:160,width:900,height:500});
    expect(after.miroCanvas.connectors.inner.from).toEqual({type:'free',x:340,y:260,future:'from'});
    expect(after.miroCanvas.commentPlaces['local:pin']).toEqual({type:'free',x:690,y:410,future:'pin'});
    expect(after.miroCanvas.connectors.chain).toEqual(before.miroCanvas.connectors.chain);
    expect(after.miroSource).toEqual(before.miroSource);expect(after.future).toEqual(before.future);
    expect(f.history).toHaveLength(2);expect(f.current).toBe(1);
    expect(f.geometry().edges!.chain!.start).toEqual(preview.edges!.chain!.start);
    f.canvas.undo();expect(f.canvas.getData()).toEqual(before);
    f.canvas.redo();expect(f.canvas.getData()).toEqual(after);
    expect(f.nativeDrag).not.toHaveBeenCalled();
  });

  it.each(['pointercancel','escape'])('restores the full preview on %s without a save or history step',ending=>{
    const f=fixture(),before=f.canvas.getData(),base=f.layer.routeOf('chain')!.path;
    const gesture=f.canvas.handleSelectionDrag(f.gesture(),f.label,f.nodes.get('group')) as any;
    f.dispatch('pointermove',120,80);gesture.move?.({clientX:120,clientY:80});
    expect(f.layer.routeOf('chain')!.path).not.toBe(base);
    if(ending==='pointercancel')f.dispatch('pointercancel',120,80);else f.session.resetTools();
    f.dispatch('pointerup',120,80);gesture.end?.();
    expect(f.canvas.getData()).toEqual(before);expect(f.history).toHaveLength(1);
    expect(f.layer.routeOf('chain')!.path).toBe(base);
    expect(f.internal.selectionMovePreview).toBeUndefined();
  });

  it.each(['group','a','inner','pin','review'])('refuses the whole collapsed drag when %s is locked/reviewed',locked=>{
    const f=fixture(0.5,locked),before=f.canvas.getData();
    const gesture=f.canvas.handleSelectionDrag(f.gesture(),f.label,f.nodes.get('group')) as any;
    if(locked==='review'){
      expect(gesture).toBeUndefined();
      expect(f.canvas.getData()).toEqual(before);
      expect(f.history).toHaveLength(1);
      expect(f.nativeDrag).not.toHaveBeenCalled();
      return;
    }
    f.dispatch('pointermove',120,80);gesture.move?.({clientX:120,clientY:80});
    f.dispatch('pointerup',120,80);gesture.end?.();
    expect(f.canvas.getData()).toEqual(before);expect(f.history).toHaveLength(1);
    expect(f.internal.selectionMovePreview).toBeUndefined();
    expect(f.nativeDrag).not.toHaveBeenCalled();
  });

  it('does not produce a preview for a locked carried comment',()=>{
    const f=fixture(0.5,'pin');
    f.canvas.handleSelectionDrag(f.gesture(),f.label,f.nodes.get('group'));
    f.dispatch('pointermove',120,80);
    expect(f.internal.selectionMovePreview).toBeUndefined();
    expect(f.history).toHaveLength(1);
  });

  it('selects a pressed collapsed group before carrying its internal dependencies',()=>{
    const f=fixture();f.canvas.deselectAll();f.internal.refresh();
    const gesture=f.canvas.handleSelectionDrag(f.gesture(),f.label,f.nodes.get('group')) as any;
    f.dispatch('pointermove',120,80);gesture.move?.({clientX:120,clientY:80});
    expect(f.selection.has(f.nodes.get('group'))).toBe(true);
    expect(f.internal.selectionMovePreview.miroCanvas.connectors.inner.from.x).toBe(340);
    f.dispatch('pointercancel',120,80);
  });

  it('preserves ordinary native drags and expanded group drags, including their original result',()=>{
    const f=fixture();
    f.canvas.data={...f.canvas.data,miroCanvas:{...f.canvas.data.miroCanvas,localOverrides:{...f.canvas.data.miroCanvas.localOverrides,group:{}}}};f.internal.refresh();
    const result=f.canvas.handleSelectionDrag(f.gesture('mouse'),f.label,f.nodes.get('group'));
    expect(result).toBe(f.nativeDrag.mock.results[0]!.value);
    expect(f.nativeDrag).toHaveBeenCalledWith(expect.objectContaining({pointerType:'mouse'}),f.label,f.nodes.get('group'));
    expect(f.internal.selectionMovePreview).toBeUndefined();
  });

  it.each(['mouse','touch'])('provides the full observed native %s lifecycle without duplicate commits',type=>{
    const f=fixture(),before=f.canvas.getData();
    const handler=f.canvas.handleSelectionDrag(f.gesture(type),f.label,f.nodes.get('group')) as any;
    for(const key of ['move','end','cancel','cleanup','keydown','keyup'])expect(typeof handler[key],key).toBe('function');
    f.dispatch('pointermove',120,80);
    handler.move({clientX:120,clientY:80});handler.keydown({key:'Control'});handler.keyup({key:'Control'});
    expect(f.canvas.getData()).toEqual(before);
    f.dispatch('pointerup',120,80);
    handler.cleanup();handler.end({clientX:120,clientY:80});
    expect(f.history).toHaveLength(2);
    const committed=f.canvas.getData();
    handler.cleanup();handler.end({});handler.cancel();
    expect(f.canvas.getData()).toEqual(committed);expect(f.history).toHaveLength(2);
  });

  it('honors native mouse cleanup-before-cancel while leaving no release commit',()=>{
    const f=fixture(),before=f.canvas.getData();
    const handler=f.canvas.handleSelectionDrag(f.gesture('mouse'),f.label,f.nodes.get('group')) as any;
    f.dispatch('pointermove',120,80);handler.move({clientX:120,clientY:80});
    handler.cleanup();handler.cancel();
    f.dispatch('pointerup',120,80);handler.end({});
    expect(f.canvas.getData()).toEqual(before);expect(f.history).toHaveLength(1);
  });

  it('delegates an unverifiable native event shape without changing its factory result',()=>{
    const f=fixture();
    const event={button:0,shiftKey:false,clientX:NaN,clientY:0,target:f.label};
    const handler=f.canvas.handleSelectionDrag(event,f.label,f.nodes.get('group'));
    expect(handler).toBe(f.nativeDrag.mock.results[0]!.value);
    expect(f.internal.selectionMovePreview).toBeUndefined();
  });

  it.each(['outside','different-child','absent'])('uses the original native press owner when the MOVE target is %s',kind=>{
    const f=fixture(),before=f.canvas.getData();
    const target=kind==='outside'?new HostElement('div'):kind==='different-child'?f.nodes.get('a')!.nodeEl:undefined;
    const move={...f.gesture('touch'),target,targetNode:target};
    const handler=f.canvas.handleSelectionDrag(move,f.label,f.nodes.get('group')) as any;
    f.dispatch('pointermove',120,80);handler.move({clientX:120,clientY:80});
    expect(f.internal.selectionMovePreview?.miroCanvas.connectors.inner.from.x).toBe(340);
    expect(f.geometry().edges!.chain!.start!.x).toBeCloseTo(364.444,3);
    expect(f.nativeDrag).not.toHaveBeenCalled();
    expect(move.target).toBe(target);expect(move.targetNode).toBe(target);
    f.dispatch('pointercancel',120,80);handler.cleanup();
    expect(f.canvas.getData()).toEqual(before);
  });

  it('preserves branded native getters/method receivers while normalizing only internal pointer ownership',()=>{
    const f=fixture(),move={...f.gesture('touch'),target:undefined} as any;
    Object.defineProperty(move,'clientX',{get(){expect(this).toBe(move);return 0;}});
    Object.defineProperty(move,'clientY',{get(){expect(this).toBe(move);return 0;}});
    move.preventDefault=vi.fn(function(this:unknown){expect(this).toBe(move);});
    move.stopImmediatePropagation=vi.fn(function(this:unknown){expect(this).toBe(move);});
    const handler=f.canvas.handleSelectionDrag(move,f.label,f.nodes.get('group')) as any;
    f.dispatch('pointermove',120,80);handler.move({clientX:120,clientY:80});
    expect(move.preventDefault).toHaveBeenCalled();expect(move.stopImmediatePropagation).toHaveBeenCalled();
    expect(f.internal.selectionMovePreview?.nodes[0].x).toBe(240);
    expect(move.target).toBeUndefined();
    handler.cancel();
  });

  it.each(['touch','mouse'])('normalizes verified active primary %s MOVE as an internal press without mutating the native event',type=>{
    const f=fixture();
    const move={...f.gesture(type),type:'pointermove',button:-1,buttons:1,target:undefined,targetNode:undefined};
    const handler=f.canvas.handleSelectionDrag(move,f.label,f.nodes.get('group')) as any;
    f.dispatch('pointermove',120,80);handler.move({clientX:120,clientY:80});
    expect(f.internal.selectionMovePreview?.miroCanvas.connectors.inner.from.x).toBe(340);
    expect(move.button).toBe(-1);expect(move.buttons).toBe(1);expect(move.pointerType).toBe(type);expect(move.target).toBeUndefined();
    handler.cancel();
  });

  it.each(['released','non-primary','secondary-buttons'])('delegates unverified MOVE button context %s unchanged',kind=>{
    const f=fixture();
    const move={...f.gesture('touch'),type:'pointermove',button:-1,buttons:kind==='released'?0:kind==='secondary-buttons'?3:1,isPrimary:kind!=='non-primary'};
    const handler=f.canvas.handleSelectionDrag(move,f.label,f.nodes.get('group'));
    expect(handler).toBe(f.nativeDrag.mock.results[0]!.value);
    expect(f.internal.selectionMovePreview).toBeUndefined();
  });

  it.each(['shiftKey','ctrlKey','altKey','metaKey'])('delegates modified MOVE %s unchanged',key=>{
    const f=fixture();
    const move={...f.gesture('touch'),type:'pointermove',button:-1,buttons:1,[key]:true};
    const handler=f.canvas.handleSelectionDrag(move,f.label,f.nodes.get('group'));
    expect(handler).toBe(f.nativeDrag.mock.results[0]!.value);
    expect(f.internal.selectionMovePreview).toBeUndefined();
  });

  it.each(['forged-node','wrong-owner','foreign-owner'])('delegates invalid native ownership %s unchanged',kind=>{
    const f=fixture(),move=f.gesture('touch');
    const node=kind==='forged-node'?{id:'group',nodeEl:f.nodes.get('group')!.nodeEl}:f.nodes.get('group');
    const owner=kind==='wrong-owner'?f.nodes.get('a')!.nodeEl:kind==='foreign-owner'?new HostElement('div'):f.label;
    const handler=f.canvas.handleSelectionDrag(move,owner,node);
    expect(handler).toBe(f.nativeDrag.mock.results[0]!.value);
    expect(f.internal.selectionMovePreview).toBeUndefined();
  });

  it.each([0.5,1.25])('commits the exact fractional preview through native rounding at scale %s, including chain and pin positions',scale=>{
    const f=fixture(scale),before=f.canvas.getData();
    const move={...f.gesture('touch'),type:'pointermove',button:-1,buttons:1,target:undefined,targetNode:undefined};
    const handler=f.canvas.handleSelectionDrag(move,f.label,f.nodes.get('group')) as any;
    const dx=220.23529052734375,dy=176.4;
    f.dispatch('pointermove',dx*scale,dy*scale);handler.move({clientX:dx*scale,clientY:dy*scale});
    const preview=clone(f.internal.selectionMovePreview);
    const chain=f.layer.routeOf('chain')!.path,tail=f.layer.routeOf('tail')!.path,pin=f.geometry().comments!['local:pin'];
    const native=f.canvas.edges.get('external')!.lineGroupEl as HostElement;
    const display=native.querySelector('.canvas-display-path')!.getAttribute('d'),hit=native.querySelector('.canvas-interaction-path')!.getAttribute('d');
    expect(f.canvas.getData()).toEqual(before);expect(f.history).toHaveLength(1);
    f.dispatch('pointerup',dx*scale,dy*scale);handler.cleanup();handler.end({});
    const after=f.canvas.getData();
    expect(after.nodes).toEqual(preview.nodes);
    expect(after.nodes[0]).toMatchObject({x:220,y:176,width:900,height:500});
    expect(preview.miroCanvas.connectors.inner.from).toMatchObject({x:320,y:276});
    expect(after.miroCanvas.connectors.inner).toEqual(preview.miroCanvas.connectors.inner);
    expect(after.miroCanvas.commentPlaces['local:pin']).toEqual(preview.miroCanvas.commentPlaces['local:pin']);
    expect(after.miroCanvas.commentPlaces['local:pin']).toMatchObject({x:670,y:426});
    expect(f.layer.routeOf('chain')!.path).toBe(chain);expect(f.layer.routeOf('tail')!.path).toBe(tail);
    expect(f.geometry().comments!['local:pin']).toEqual(pin);
    expect(native.querySelector('.canvas-display-path')!.getAttribute('d')).toBe(display);
    expect(native.querySelector('.canvas-interaction-path')!.getAttribute('d')).toBe(hit);expect(hit).toBe(display);
    expect(after.miroSource).toEqual(before.miroSource);expect(after.future).toEqual(before.future);
    expect(f.history).toHaveLength(2);f.canvas.undo();expect(f.canvas.getData()).toEqual(before);
    f.canvas.redo();expect(f.canvas.getData()).toEqual(after);
  });

  it('keeps a connector-only fractional preview and commit precise despite native-rounded host writes',()=>{
    const f=fixture(),before=f.canvas.getData();f.canvas.deselectAll();f.layer.select(['tail']);f.internal.refresh();
    expect(f.internal.startSelectionMove(f.gesture('mouse',f.layer.element as unknown as HostElement),{single:true})).toBe(true);
    const dx=220.23529052734375,dy=176.4;
    f.dispatch('pointermove',dx*0.5,dy*0.5);
    const preview=clone(f.internal.selectionMovePreview),path=f.layer.routeOf('tail')!.path;
    expect(preview.miroCanvas.connectors.tail.to.x).toBe(1400+dx);
    expect(preview.miroCanvas.connectors.tail.to.y).toBe(dy);
    f.dispatch('pointerup',dx*0.5,dy*0.5);
    const after=f.canvas.getData();
    expect(after.nodes).toEqual(before.nodes);
    expect(after.miroCanvas.connectors.tail.to).toEqual(preview.miroCanvas.connectors.tail.to);
    expect(f.layer.routeOf('tail')!.path).toBe(path);expect(f.history).toHaveLength(2);
    f.canvas.undo();expect(f.canvas.getData()).toEqual(before);
  });
});
