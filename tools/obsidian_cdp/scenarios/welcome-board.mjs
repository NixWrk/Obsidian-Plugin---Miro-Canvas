import {checked, click, finish, cleanup} from './_guide.mjs';
export {cleanup};
export async function prepare(s) {
  await s.key('Escape');
  await checked(s,`if(app.workspace.activeLeaf.view.getViewType()!=='canvas')throw Error('fresh welcome board is required');app.changeTheme(${JSON.stringify(s.theme==='dark'?'obsidian':'moonstone')});app.updateTheme();app.plugins.plugins['miro-canvas'].m1Session.setTheme(${JSON.stringify(s.theme)});app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();return true;`);
  await s.wait(1000);
  await checked(s,"const c=app.workspace.activeLeaf.view.canvas;const d=c.getData();const intro=d.nodes.find(n=>n.type==='group'&&n.x===0&&n.y===0);if(!intro||intro.width!==1880||intro.height!==600||!d.nodes.some(n=>n.type==='group'&&n.label.startsWith('12.'))||!d.miroCanvas.localComments.some(n=>n.resolved))throw Error('Stale welcome board: record in a fresh vault');const first=d.nodes.find(n=>n.type==='group'&&n.label.startsWith('1.'));c.zoomToBbox({minX:first.x-25,minY:first.y-40,maxX:first.x+first.width+25,maxY:first.y+first.height+25});c.setViewport(c.tx,c.ty,c.tZoom);return true;");
  await s.wait(700);
  await s.caption({ru:'1. Попробуйте инструменты на доске знакомства',en:'1. Try the tools on the welcome board'});
}
export default async function(s) {
  await s.wait(2200);
  for (const [prefix,caption] of [
    ['3.',{ru:'Заметки, вложения и файлы с устройства',en:'Notes, attachments and files from your device'}],
    ['6.',{ru:'Открытое обсуждение и завершённый комментарий с галочкой',en:'An open thread and a resolved comment with a checkmark'}],
    ['8.',{ru:'Настоящие PDF и PowerPoint после экспорта',en:'Actual exported PDF and PowerPoint files'}],
  ]) {
    await s.caption(caption);
    await checked(s,`const c=app.workspace.activeLeaf.view.canvas;const n=c.getData().nodes.find(n=>n.type==='group'&&n.label.startsWith(${JSON.stringify(prefix)}));if(!n)throw Error('welcome frame missing');c.zoomToBbox({minX:n.x-20,minY:n.y-30,maxX:n.x+n.width+20,maxY:n.y+n.height+20});c.setViewport(c.tx,c.ty,c.tZoom);return true;`);
    await s.wait(2500);
    if (prefix === '8.') {
      await checked(s,"const nodes=app.workspace.activeLeaf.view.canvas.getData().nodes;if(!nodes.some(n=>n.file?.endsWith('/Board-export.pdf'))||!nodes.some(n=>n.file?.endsWith('/Board-export.pptx')))throw Error('export examples missing');return true;");
    }
  }
  await finish(s,{ru:'Справка остаётся в хранилище вместе с вашими заметками',en:'The guide stays in your vault beside your notes'});
}
