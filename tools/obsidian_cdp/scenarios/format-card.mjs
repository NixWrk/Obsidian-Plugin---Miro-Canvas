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
  await s.caption({ru:'3. Выделим одно слово и сделаем его жирным',en:'3. Select one word and make it bold'});
  await s.click({selector:'[data-demo-id="a100000000000001"]'}, {count:2});
  await s.wait(600);
  const word = await checked(s, `
    const node=app.workspace.activeLeaf.view.canvas.nodes.get('a100000000000001');
    const frame=node.nodeEl.querySelector('iframe.embed-iframe');
    const line=frame?.contentDocument?.querySelector('.cm-line');
    if(!line) throw Error('native text editor did not open');
    const walker=frame.contentDocument.createTreeWalker(line,NodeFilter.SHOW_TEXT);
    const text=walker.nextNode();
    const range=frame.contentDocument.createRange();
    range.setStart(text,${s.lang==='ru'?8:5}); range.setEnd(text,${s.lang==='ru'?15:12});
    const r=range.getBoundingClientRect(), f=frame.getBoundingClientRect();
    return {x:f.left+r.left+r.width/2,y:f.top+r.top+r.height/2};
  `);
  await s.move(word,{duration:600});
  await s.click(word,{count:2});
  await s.wait(450);
  await click(s,{selector:`.miro-canvas-toolbar:not(.miro-canvas-tools) button[aria-label="${s.lang==='ru'?'Начертание':'Text style'}"]`});
  await click(s,{selector:`.miro-canvas-toolbar:not(.miro-canvas-tools) button[aria-label="${s.lang==='ru'?'Полужирный':'Bold'}"]`});
  await checked(s,`const n=app.workspace.activeLeaf.view.canvas.nodes.get('a100000000000001'); const text=n.child.editor.getValue(); if(!text.includes(${JSON.stringify(s.lang==='ru'?'Встреча **команды**':'Team **meeting**')})) throw Error('selected word formatting missing: '+text);return true;`);
  await s.key('Escape');
  await finish(s,{ru:'Можно оформить всю карточку или только выделенные слова',en:'Style the whole card or just the selected words'});
}
