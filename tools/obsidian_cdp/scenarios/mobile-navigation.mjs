import {board,checked,finish} from './_mobile.mjs';

export async function prepare(s) {
  await board(s, s.lang==='ru' ? 'Касания — приближение.canvas' : 'Touch — zoom.canvas');
  await s.caption({ru:'На пустом месте можно двигать доску',en:'Pan the board from an empty area'});
}

export default async function(s) {
  const initial=await checked(s,`const c=app.workspace.activeLeaf.view.canvas; return {x:c.tx,y:c.ty,zoom:c.tZoom};`);
  const viewport=await checked(s,'return {w:innerWidth,h:innerHeight};');
  await s.wait(1400);
  await s.touchDrag({x:viewport.w*.5,y:viewport.h*.35},{x:viewport.w*.48,y:viewport.h*.31},{duration:1000});
  await checked(s,`const c=app.workspace.activeLeaf.view.canvas; if(Math.abs(c.tx-${initial.x})<5 && Math.abs(c.ty-${initial.y})<5)throw Error('touch pan failed'); return true;`);
  await s.wait(1400);
  await s.caption({ru:'Разведите два пальца, чтобы приблизить',en:'Spread two fingers to zoom in'});
  const phone = viewport.w < 500;
  await s.touchPinch({x:viewport.w*(phone ? .57 : .5),y:viewport.h*(phone ? .63 : .48)},80,phone ? 120 : 105);
  await checked(s,`if(app.workspace.activeLeaf.view.canvas.tZoom <= ${initial.zoom}+.05) throw Error('touch zoom failed'); return true;`);
  await finish(s,{ru:'Панели остаются доступны при приближении',en:'The controls remain available as you zoom'});
}
