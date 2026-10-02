import {board,checked,click,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s){
  await board(s,s.lang==='ru'?'Обсуждение.canvas':'Discussion.canvas',{nodes:[{id:'a100000000000001',type:'text',text:s.lang==='ru'?'Встреча команды\nПятница, 18:00':'Team meeting\nFriday, 6 pm',x:-350,y:-100,width:330,height:220,color:'3'}],edges:[]});
  await s.caption({ru:'1. Оставим вопрос рядом с карточкой',en:'1. Leave a question beside a card'});
}
export default async function(s){
  await s.wait(1100);
  await click(s,{selector:'[data-tool="comment"]'});
  await click(s,{x:640,y:330});
  await click(s,{selector:'.miro-canvas-thread__input'});
  await s.type(s.lang==='ru'?'Где встречаемся?':'Where shall we meet?',{interval:75});
  await click(s,{selector:'.miro-canvas-thread__send'});
  await s.caption({ru:'2. Ответим и отметим вопрос решённым',en:'2. Reply and mark the question resolved'});
  await click(s,{selector:'.miro-canvas-thread__input'});
  await s.type(s.lang==='ru'?'В кафе у офиса':'At the café near the office',{interval:65});
  await click(s,{selector:'.miro-canvas-thread__send'});
  await click(s,{selector:'.miro-canvas-thread__resolve'});
  await checked(s,`if(!document.querySelector('[data-comment-state="resolved"]')) throw new Error('comment was not resolved'); return true;`);
  await finish(s,{ru:'Вопрос, ответ и решение остаются на доске',en:'Keep the question, reply and resolution on the board'});
}
