import {board, checked, click, finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s) {
  await board(s,s.lang==='ru'?'Текст на доске.canvas':'Text on the board.canvas',{nodes:[],edges:[]});
  await s.caption({ru:'1. Нажмите T и добавьте заголовок',en:'1. Press T and add a heading'});
}
export default async function(s) {
  await s.wait(1200);
  await s.key('T');
  await click(s,{x:550,y:340});
  const text=s.lang==='ru'?'План встречи':'Meeting plan';
  await s.type(text,{interval:100});
  await s.key('Escape');
  await s.wait(650);
  const card=await checked(s,`const c=app.workspace.activeLeaf.view.canvas;const n=c.getData().nodes.find(node=>node.text===${JSON.stringify(text)});if(!n)throw Error('text missing');c.nodes.get(n.id).nodeEl.dataset.demoText='true';return n.id;`);
  await s.caption({ru:'2. Настройте шрифт и размер текста',en:'2. Choose the font and text size'});
  await click(s,{selector:'[data-demo-text]'});
  await s.wait(650);
  await click(s,{selector:'.miro-canvas-toolbar__button--font'});
  await click(s,{selector:'.miro-canvas-toolbar__button--font-option[data-value="serif"]'});
  await click(s,{selector:'.miro-canvas-toolbar:not(.miro-canvas-tools) input[aria-label="'+(s.lang==='ru'?'Размер шрифта':'Font size')+'"]'});
  await s.key('A',{modifiers:2});
  await s.type('28');
  await s.key('Enter');
  await s.key('Tab');
  await checked(s,`const o=app.workspace.activeLeaf.view.canvas.getData().miroCanvas.localOverrides[${JSON.stringify(card)}];if(o.typography.fontFamily!=='serif'||o.typography.fontSize!==28)throw Error('text styling missing');return true;`);
  await click(s,{selector:'[data-demo-text]'});
  await s.key('Escape');
  await s.wait(500);
  await click(s,{x:90,y:650});
  await finish(s,{ru:'Заголовки и подписи прямо на доске',en:'Add headings and labels directly to the board'});
}
