import {board, checked, click, finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s) {
  await board(s, s.lang === 'ru' ? 'Инструменты.canvas' : 'Tools.canvas', {nodes:[],edges:[]});
  await s.caption({ru:'1. Выберите стикер клавишей N',en:'1. Choose the sticky note tool with N'});
}
export default async function(s) {
  await s.wait(1200);
  await s.key('N');
  await s.wait(700);
  await click(s,{x:640,y:350});
  await s.wait(350);
  await s.click({x:640,y:350},{count:2});
  await s.wait(350);
  await s.type(s.lang === 'ru' ? 'Начать с идеи' : 'Start with an idea',{interval:80});
  await s.key('Escape');
  await checked(s,`if(!app.workspace.activeLeaf.view.canvas.getData().nodes.some(node=>node.text===${JSON.stringify(s.lang === 'ru' ? 'Начать с идеи' : 'Start with an idea')}))throw Error('sticky text missing');return true;`);
  await s.caption({ru:'2. Дополнительные инструменты — в меню «+»',en:'2. Find additional tools in the + menu'});
  await click(s,{selector:'.miro-canvas-tools__more > button'});
  await checked(s,`if(!document.querySelector('.miro-canvas-tools__more [data-tool="code"]'))throw Error('extra tools missing');return true;`);
  await finish(s,{ru:'Клавиши выбирают инструмент; «+» открывает остальные',en:'Use a shortcut or choose a tool from +'});
}
