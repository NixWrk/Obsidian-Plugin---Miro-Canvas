import {board,checked,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s){
  const ru=s.lang==='ru';
  await board(s,ru?'Фрейм с задачами.canvas':'Frame with tasks.canvas',{nodes:[{id:'a100000000000003',type:'group',label:ru?'Подготовка встречи':'Meeting preparation',x:-420,y:-200,width:840,height:350},{id:'a100000000000001',type:'text',text:ru?'Выбрать место':'Choose a place',x:-350,y:-120,width:270,height:180,color:'3'},{id:'a100000000000002',type:'text',text:ru?'Пригласить команду':'Invite the team',x:80,y:-120,width:270,height:180,color:'4'}],edges:[]});
  await s.caption({ru:'1. Фрейм объединяет задачи на доске',en:'1. A frame keeps related tasks together'});
}
export default async function(s){
  await s.wait(1400);
  const title=await s.find({selector:'[data-demo-id="a100000000000003"] .canvas-group-label'});
  if(!title) throw new Error('frame title missing');
  await s.caption({ru:'2. Потянем за название — задачи переместятся вместе',en:'2. Drag the title to move the frame and its tasks'});
  await s.move(title,{duration:650});
  await s.drag(title,{x:title.x+65,y:title.y+95},{duration:1600});
  await s.wait(600);
  await checked(s,`const ns=app.workspace.activeLeaf.view.canvas.getData().nodes; if(ns.filter(n=>n.type==='text').some(n=>n.y===-120)) throw new Error('frame contents did not move'); return true;`);
  await finish(s,{ru:'Весь раздел доски перемещается за один раз',en:'Move a whole section of the board in one gesture'});
}
