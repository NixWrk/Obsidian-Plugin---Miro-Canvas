import {board,checked,finish} from './_mobile.mjs';

export async function prepare(s) {
  await board(s, s.lang==='ru' ? 'Касания — план встречи.canvas' : 'Touch — meeting plan.canvas');
  await s.caption({ru:'Нажмите на карточку, затем передвиньте её',en:'Tap a card, then move it'});
}

export default async function(s) {
  await s.wait(1400);
  const card={selector:'[data-demo-id="a100000000000001"]'};
  await s.touchTap(card);
  await s.wait(700);
  const point=await s.find(card);
  await s.touchDrag(card,{x:point.x+55,y:point.y-60},{duration:1200});
  await checked(s, `
    const c=app.workspace.activeLeaf.view.canvas;
    const n=c.getData().nodes.find(n=>n.id==='a100000000000001');
    if(n.x <= -150 || n.y >= -150) throw new Error('touch drag did not move the card');
    if(c.getData().edges.length !== 1) throw new Error('connected line missing');
    return {x:n.x,y:n.y};
  `);
  await finish(s,{ru:'Стрелка остаётся связана с карточками',en:'The arrow stays connected to both cards'});
}
