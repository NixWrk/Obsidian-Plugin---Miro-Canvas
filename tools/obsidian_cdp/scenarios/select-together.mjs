import {board,checked,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s){
  const ru=s.lang==='ru';
  await board(s,ru?'Выделение нескольких карточек.canvas':'Select several cards.canvas',{nodes:[{id:'a100000000000001',type:'text',text:ru?'Выбрать место':'Choose a place',x:-360,y:-100,width:260,height:180,color:'3'},{id:'a100000000000002',type:'text',text:ru?'Пригласить команду':'Invite the team',x:100,y:-100,width:260,height:180,color:'4'}],edges:[{id:'a200000000000001',fromNode:'a100000000000001',fromSide:'right',toNode:'a100000000000002',toSide:'left'}]});
  await s.caption({ru:'1. Обведём карточки рамкой выделения',en:'1. Drag a selection rectangle around the cards'});
}
export default async function(s){
  await s.wait(1100);
  const a=await s.find({selector:'[data-demo-id="a100000000000001"]'});
  const b=await s.find({selector:'[data-demo-id="a100000000000002"]'});
  const from={x:a.x-a.width/2-30,y:a.y-a.height/2-30};
  const to={x:b.x+b.width/2+30,y:b.y+b.height/2+30};
  await s.move(from,{duration:650});
  await s.drag(from,to,{duration:1400});
  await s.wait(500);
  await checked(s,`if(app.workspace.activeLeaf.view.canvas.selection.size<2) throw new Error('cards were not selected'); return true;`);
  await s.caption({ru:'2. Переместим обе карточки вместе',en:'2. Move both cards together'});
  await s.move(a,{duration:650});
  await s.drag(a,{x:a.x+40,y:a.y+90},{duration:1400});
  await s.wait(600);
  await checked(s,`const ns=app.workspace.activeLeaf.view.canvas.getData().nodes; if(ns.some(n=>n.y===-100)||ns[0].y!==ns[1].y) throw new Error('selection did not move together'); return true;`);
  await finish(s,{ru:'Карточки и связь двигаются вместе',en:'The cards and connection move together'});
}
