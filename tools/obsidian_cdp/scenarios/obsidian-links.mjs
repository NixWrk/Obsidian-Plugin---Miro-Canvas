import {board, checked, click, finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
const copy = {
  ru: {board:'Ссылки и заметки.canvas', note:'План встречи', body:'В пятницу, после 18:00.\n\n- Выбрать место\n- Пригласить команду', link:'Открыть заметку'},
  en: {board:'Links and notes.canvas', note:'Meeting plan', body:'Friday, after 6 pm.\n\n- Choose a place\n- Invite the team', link:'Open note'},
};
export async function prepare(s) {
  const t=copy[s.lang];
  await board(s,t.board,{nodes:[{id:'a100000000000001',type:'text',text:s.lang==='ru'?'План встречи':'Meeting plan',x:-280,y:-180,width:560,height:360}],edges:[]},[[t.note+'.md',t.body]]);
  await s.caption({ru:'1. Ссылка и содержимое заметки прямо на доске',en:'1. Link to a note and show its contents on the board'});
}
export default async function(s) {
  const t=copy[s.lang];
  const card={selector:'[data-demo-id="a100000000000001"]'};
  await s.wait(1100);
  await s.move(card,{duration:650});
  await s.click(card,{count:2});
  await s.wait(350);
  await s.key('A',{modifiers:2});
  await s.type(`[[${t.note}|${t.link}]]\n\n![[${t.note}]]`,{interval:45});
  await s.wait(600);
  await s.key('Escape');
  await s.wait(1600);
  await checked(s,`if(!document.querySelector('[data-demo-id] .internal-embed')) throw new Error('note embed missing'); return true;`);
  await s.caption({ru:'2. Выделите карточку, затем нажмите ссылку',en:'2. Select the card, then follow its link'});
  await click(s,card);
  await click(s,{selector:'[data-demo-id] a.internal-link'});
  await checked(s,`if(app.workspace.getActiveFile()?.path!==${JSON.stringify(t.note+'.md')}) throw new Error('link did not open the note'); return true;`);
  await finish(s,{ru:'Заметка хранится в Obsidian и доступна с доски',en:'The note stays in Obsidian and is accessible from the board'});
}
