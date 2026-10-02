import {board,checked,click,finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
const copy={ru:{name:'Доска внутри доски.canvas',nested:'Подготовка встречи.canvas',a:'Выбрать место',b:'Пригласить команду'},en:{name:'Board inside a board.canvas',nested:'Meeting preparation.canvas',a:'Choose a place',b:'Invite the team'}};
export async function prepare(s){
  const t=copy[s.lang];
  const nested={nodes:[{id:'b100000000000001',type:'text',text:t.a,x:0,y:0,width:220,height:140,color:'3'},{id:'b100000000000002',type:'text',text:t.b,x:330,y:0,width:220,height:140,color:'4'}],edges:[{id:'b200000000000001',fromNode:'b100000000000001',fromSide:'right',toNode:'b100000000000002',toSide:'left'}]};
  await board(s,t.name,{nodes:[{id:'a100000000000001',type:'text',text:`![[${t.nested}]]`,x:-360,y:-200,width:720,height:400}],edges:[]},[[t.nested,JSON.stringify(nested)]]);
  await s.caption({ru:'1. Другой Canvas можно показать внутри карточки',en:'1. Embed another Canvas inside a card'});
}
export default async function(s){
  const t=copy[s.lang];
  await s.wait(2000);
  await checked(s,`if(!document.querySelector('.internal-embed .canvas-minimap')) throw new Error('nested canvas missing'); return true;`);
  await s.caption({ru:'2. Откроем вложенную доску, чтобы продолжить работу',en:'2. Open the embedded board to continue working'});
  await click(s,{selector:'.internal-embed .embed-title'});
  await click(s,{selector:'.internal-embed .embed-title'});
  await s.wait(600);
  await checked(s,`if(app.workspace.getActiveFile()?.path!==${JSON.stringify(t.nested)}) throw new Error('nested board did not open'); return true;`);
  await finish(s,{ru:'Общий план и подробная схема — на связанных досках',en:'Keep the overview and detailed plan on connected boards'});
}
