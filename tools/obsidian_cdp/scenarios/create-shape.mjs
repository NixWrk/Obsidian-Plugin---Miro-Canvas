import {board,checked,click,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s){
  await board(s,s.lang==='ru'?'Фигура с текстом.canvas':'Shape with text.canvas',{nodes:[],edges:[]});
  await s.caption({ru:'1. Выберем ромб для вопроса в схеме',en:'1. Choose a diamond for a decision in a flowchart'});
}
export default async function(s){
  await s.wait(1100);
  await click(s,{selector:'.miro-canvas-tools [data-tool="shape"]'});
  await click(s,{selector:'.miro-canvas-tools [data-shape="rhombus"]'});
  await s.move({x:480,y:240},{duration:650});
  await s.drag({x:480,y:240},{x:800,y:460},{duration:1200});
  await s.wait(350);
  await s.click({x:640,y:350},{count:2});
  await s.wait(300);
  await s.type(s.lang==='ru'?'Все готовы?':'Everyone ready?',{interval:100});
  await s.key('Escape');
  await checked(s,`if(!app.workspace.activeLeaf.view.canvas.getData().nodes.some(n=>n.text===${JSON.stringify(s.lang==='ru'?'Все готовы?':'Everyone ready?')})) throw new Error('shape text missing'); return true;`);
  await finish(s,{ru:'Фигура и подпись готовы — можно строить схему дальше',en:'The shape and label are ready for the next step'});
}
