import {checked, finish, cleanup} from './_guide.mjs';
export {cleanup};
export async function prepare(s) {
  await checked(s,"await app.plugins.plugins['miro-canvas'].openWelcomeBoard();app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();return true;");
  await s.wait(1000);
  await s.caption({ru:'Приветственная доска: примеры можно менять',en:'Welcome board: try the examples yourself'});
}
export default async function(s) {
  await s.wait(2200);
  for (const [prefix,caption] of [
    ['4.',{ru:'Перо с нажимом, маркер и рисование пальцем',en:'Pressure pen, highlighter and finger drawing'}],
    ['6.',{ru:'Настройте панели и размер миникарты под себя',en:'Choose panel positions and minimap size'}]
  ]) {
    await s.caption(caption);
    await checked(s,`const c=app.workspace.activeLeaf.view.canvas;const n=c.getData().nodes.find(n=>n.type==='group'&&n.label.startsWith(${JSON.stringify(prefix)}));if(!n)throw Error('welcome frame missing');c.zoomToBbox({minX:n.x-20,minY:n.y-30,maxX:n.x+n.width+20,maxY:n.y+n.height+20});return true;`);
    await s.wait(4000);
  }
  await finish(s,{ru:'Справка остаётся в хранилище вместе с вашими заметками',en:'The guide stays in your vault beside your notes'});
}
