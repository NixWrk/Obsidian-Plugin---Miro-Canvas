import {board, checked, click, finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s) {
  await board(s,s.lang==='ru'?'Фигуры для схемы.canvas':'Diagram shapes.canvas',{nodes:[],edges:[]});
  await s.caption({ru:'1. Откройте фигуры (S) и выберите ромб',en:'1. Open shapes (S) and choose a diamond'});
}
export default async function(s) {
  await s.wait(1200);
  await click(s,{selector:'.miro-canvas-tools [data-tool="shape"]'});
  await s.wait(650);
  await click(s,{selector:'.miro-canvas-tools [data-shape="rhombus"]'});
  await s.move({x:455,y:240},{duration:650});
  await s.drag({x:455,y:240},{x:825,y:470},{duration:1400});
  await s.click({x:640,y:355},{count:2});
  const text=s.lang==='ru'?'Все готовы?':'Everyone ready?';
  await s.type(text,{interval:95});
  await s.key('Escape');
  await s.wait(650);
  await s.caption({ru:'2. Фигуру можно менять, сохраняя текст',en:'2. Change the shape and keep its text'});
  await click(s,{x:640,y:355});
  await s.wait(650);
  await click(s,{selector:'.miro-canvas-toolbar:not(.miro-canvas-tools) .miro-canvas-toolbar__button--shape'});
  await click(s,{selector:'.miro-canvas-toolbar:not(.miro-canvas-tools) [data-value="round_rectangle"]'});
  await click(s,{selector:'.miro-canvas-toolbar:not(.miro-canvas-tools) input[aria-label="'+(s.lang==='ru'?'Размер шрифта':'Font size')+'"]'});
  await s.key('A',{modifiers:2});
  await s.type('32');
  await s.key('Tab');
  await checked(s,`if(!app.workspace.activeLeaf.view.canvas.getData().nodes.some(node=>node.text===${JSON.stringify(text)}))throw Error('shape lost its text');return true;`);
  await s.key('Escape');
  await click(s,{x:90,y:650});
  await finish(s,{ru:'Нужная форма и подпись — для каждого шага схемы',en:'Choose a shape and label for each diagram step'});
}
