import {board,checked,click,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s){
  await board(s,s.lang==='ru'?'Связи при перемещении.canvas':'Moving connected cards.canvas',{nodes:[{id:'a100000000000001',type:'text',text:s.lang==='ru'?'Идея':'Idea',x:-360,y:-100,width:240,height:160,color:'3'},{id:'a100000000000002',type:'text',text:s.lang==='ru'?'План':'Plan',x:120,y:-100,width:240,height:160,color:'4'}],edges:[{id:'a200000000000001',fromNode:'a100000000000001',fromSide:'right',toNode:'a100000000000002',toSide:'left'}]});
  await s.caption({ru:'1. Переместим карточку — стрелка последует за ней',en:'1. Move a card; its arrow follows'});
}
export default async function(s){
  await s.wait(1100);
  const card=await s.find({selector:'[data-demo-id="a100000000000001"]'});
  await s.move(card,{duration:650});
  await s.drag(card,{x:card.x+70,y:card.y+130},{duration:1600});
  await s.wait(650);
  await checked(s,`const n=app.workspace.activeLeaf.view.canvas.getData().nodes[0]; if(n.y===-100) throw new Error('card did not move'); return true;`);
  await s.caption({ru:'2. Одно нажатие отмены вернёт всё на место',en:'2. Undo puts the card and arrow back'});
  await click(s,{selector:'.miro-canvas-dock button:has(.lucide-undo-2)'});
  await checked(s,`if(app.workspace.activeLeaf.view.canvas.getData().nodes[0].y!==-100) throw new Error('undo did not restore card'); return true;`);
  await finish(s,{ru:'Связь сохраняется при перемещении и отмене',en:'Connections stay attached when you move or undo'});
}
