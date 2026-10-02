import {board,checked,click,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
const copy={ru:{name:'Заметка на доске.canvas',note:'План встречи',body:'В пятницу, после 18:00.\n\n- Выбрать место\n- Пригласить команду'},en:{name:'Note on the board.canvas',note:'Meeting plan',body:'Friday, after 6 pm.\n\n- Choose a place\n- Invite the team'}};
export async function prepare(s){
  const t=copy[s.lang];
  await board(s,t.name,{nodes:[],edges:[]},[[t.note+'.md',t.body]]);
  await s.caption({ru:'1. Добавим существующую заметку из Obsidian',en:'1. Add an existing Obsidian note'});
}
export default async function(s){
  const t=copy[s.lang];
  await s.wait(1100);
  await click(s,{selector:'[data-native="note"] .canvas-card-menu-button'});
  await click(s,{x:550,y:340});
  await s.type(t.note,{interval:85});
  await s.wait(1100);
  await s.key('Enter');
  await s.wait(800);
  await s.key('Escape');
  await checked(s,`const nodes=app.workspace.activeLeaf.view.canvas.getData().nodes; if(!nodes.some(n=>n.file===${JSON.stringify(t.note+'.md')})) throw new Error('note was not inserted'); return true;`);
  await finish(s,{ru:'Это та же заметка из хранилища, без лишних копий',en:'The original note from your vault, without duplicate files'});
}
