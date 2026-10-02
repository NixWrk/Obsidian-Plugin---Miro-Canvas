import {board,checked,click,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s){
  await board(s,s.lang==='ru'?'Оформление.canvas':'Formatting.canvas',{nodes:[{id:'a100000000000001',type:'text',text:s.lang==='ru'?'Встреча команды\nПятница, 18:00':'Team meeting\nFriday, 6 pm',x:-220,y:-110,width:440,height:220}],edges:[]});
  await s.caption({ru:'1. Выделим карточку и сменим шрифт',en:'1. Select a card and change its font'});
}
export default async function(s){
  await s.wait(1100);
  await click(s,{selector:'[data-demo-id="a100000000000001"]'});
  await click(s,{selector:'.miro-canvas-toolbar__button--font'});
  await click(s,{selector:'.miro-canvas-toolbar__button--font-option[data-value="serif"]'});
  await s.wait(600);
  await checked(s,`const m=app.workspace.activeLeaf.view.canvas.getData().miroCanvas; if(m?.localOverrides?.a100000000000001?.typography?.fontFamily!=='serif') throw new Error('font change missing'); return true;`);
  await s.caption({ru:'2. Выберем цвет карточки',en:'2. Choose a card colour'});
  await click(s,{selector:'.miro-canvas-toolbar__button--color-fill'});
  await click(s,{selector:'[data-color-palette="fill"] [data-color="#ffd02f"]'});
  await checked(s,`const m=app.workspace.activeLeaf.view.canvas.getData().miroCanvas; const o=m?.localOverrides?.a100000000000001; if(o?.colors?.fill!=='#ffd02f'||o?.typography?.fontFamily!=='serif') throw new Error('formatting was not saved'); return true;`);
  await s.key('Escape');
  await finish(s,{ru:'Оформление меняется с панели над карточкой',en:'Style a card from the toolbar above it'});
}
