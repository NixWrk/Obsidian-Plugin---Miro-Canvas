import {board,checked,click,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s){
  const ru=s.lang==='ru';
  await board(s,ru?'Поиск.canvas':'Search.canvas',{nodes:[{id:'a100000000000001',type:'text',text:ru?'Встреча команды':'Team meeting',x:-400,y:-100,width:260,height:160,color:'3'},{id:'a100000000000002',type:'text',text:ru?'Покупки':'Shopping',x:0,y:100,width:260,height:160},{id:'a100000000000003',type:'text',text:ru?'Следующая встреча':'Next meeting',x:1400,y:300,width:260,height:160,color:'4'}],edges:[]});
  await s.caption({ru:'1. Найдём нужное слово на доске',en:'1. Find a word on the board'});
}
export default async function(s){
  await s.wait(1100);
  await click(s,{selector:'.miro-canvas-dock__button:has(.lucide-search)'});
  await s.type(s.lang==='ru'?'встреча':'meeting',{interval:120});
  await s.wait(1100);
  await checked(s,`if(document.querySelector('.miro-canvas-search')?.dataset.searchState!=='found') throw new Error('search found no matches'); return true;`);
  await s.caption({ru:'2. Перейдём к следующему совпадению',en:'2. Jump to the next match'});
  await click(s,{selector:'.miro-canvas-search button:has(.lucide-chevron-down)'});
  await finish(s,{ru:'Поиск найдёт карточку, даже если её сейчас не видно',en:'Search reaches cards that are outside the current view'});
}
