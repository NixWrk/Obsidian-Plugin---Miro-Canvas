import {board,checked,click,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s){
  await board(s,s.lang==='ru'?'Рисование.canvas':'Drawing.canvas',{nodes:[{id:'a100000000000001',type:'text',text:s.lang==='ru'?'Обсудить на встрече':'Discuss at the meeting',x:-220,y:-70,width:440,height:140,color:'3'}],edges:[]});
  await s.caption({ru:'1. Подчеркнём важное пером',en:'1. Underline something important with the pen'});
}
export default async function(s){
  await s.wait(1100);
  await click(s,{selector:'[data-tool-group="drawing"]'});
  await click(s,{selector:'[data-pen-color="#f24726"]'});
  await s.move({x:490,y:490},{duration:650});
  await s.drag({x:490,y:490},{x:790,y:505},{duration:1400});
  await s.wait(700);
  await checked(s,`const m=app.workspace.activeLeaf.view.canvas.getData().miroCanvas; if(!m) throw new Error('drawing was not saved'); return m;`);
  await s.caption({ru:'2. Ластик уберёт штрих, карточка останется',en:'2. Erase the stroke and keep the card'});
  await click(s,{selector:'[data-tool="eraser"]'});
  await s.move({x:580,y:495},{duration:650});
  await s.drag({x:580,y:495},{x:680,y:500},{duration:900});
  await s.key('Escape');
  await finish(s,{ru:'Рисуйте и исправляйте прямо на доске',en:'Draw and make corrections directly on the board'});
}
