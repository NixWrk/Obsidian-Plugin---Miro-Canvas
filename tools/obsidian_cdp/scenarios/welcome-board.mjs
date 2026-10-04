import {checked, click, finish, cleanup} from './_guide.mjs';
export {cleanup};
export async function prepare(s) {
  await s.key('Escape');
  await checked(s,"await app.plugins.plugins['miro-canvas'].openWelcomeBoard();app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();return true;");
  await s.wait(1000);
  await checked(s,"const c=app.workspace.activeLeaf.view.canvas;const d=c.getData();const intro=d.nodes.find(n=>n.type==='group'&&n.x===0&&n.y===0);if(!intro||intro.width!==1880||intro.height!==600||!d.nodes.some(n=>n.type==='group'&&n.label.startsWith('12.'))||!d.miroCanvas.localComments.some(n=>n.resolved))throw Error('Stale welcome board: record in a fresh vault');const first=d.nodes.find(n=>n.type==='group'&&n.label.startsWith('1.'));c.zoomToBbox({minX:intro.x-40,minY:intro.y-40,maxX:intro.x+intro.width+40,maxY:first.y+first.height+40});c.setViewport(c.tx,c.ty,c.tZoom);return true;");
  await s.wait(700);
  await s.caption({ru:'Приветственная доска: примеры можно менять',en:'Welcome board: try the examples yourself'});
}
export default async function(s) {
  await s.wait(2200);
  for (const [prefix,caption] of [
    ['3.',{ru:'Заметки, вложения и файлы с устройства',en:'Notes, attachments and files from your device'}],
    ['6.',{ru:'Открытое обсуждение и завершённый комментарий с галочкой',en:'An open thread and a resolved comment with a checkmark'}],
    ['8.',{ru:'Настоящие PDF и PowerPoint после экспорта',en:'Actual exported PDF and PowerPoint files'}],
    ['9.',{ru:'Выделение, фреймы, слои и связанные карточки',en:'Selection, frames, layers and connected cards'}],
    ['10.',{ru:'Markdown, формулы, код и ссылки',en:'Markdown, formulas, code and links'}]
  ]) {
    await s.caption(caption);
    await checked(s,`const c=app.workspace.activeLeaf.view.canvas;const n=c.getData().nodes.find(n=>n.type==='group'&&n.label.startsWith(${JSON.stringify(prefix)}));if(!n)throw Error('welcome frame missing');c.zoomToBbox({minX:n.x-20,minY:n.y-30,maxX:n.x+n.width+20,maxY:n.y+n.height+20});c.setViewport(c.tx,c.ty,c.tZoom);return true;`);
    await s.wait(3000);
    if (prefix === '8.') {
      await checked(s,"window.__welcomeGuidePath=app.workspace.getActiveFile().path;const c=app.workspace.activeLeaf.view.canvas;const n=c.getData().nodes.find(n=>n.file?.endsWith('/Board-export.pdf'));if(!n)throw Error('export sample missing');c.nodes.get(n.id).nodeEl.setAttribute('data-welcome-export','');return true;");
      await click(s,{selector:'[data-welcome-export] .pdf-toolbar-right .clickable-icon:has(.lucide-more-vertical)'});
      if(await checked(s,"return !document.querySelector('.menu-item');")) await click(s,{selector:'[data-welcome-export] .pdf-toolbar-right .clickable-icon:has(.lucide-more-vertical)'});
      await click(s,{selector:'.menu-item',textRu:'Открыть в новой вкладке',textEn:'Open in new tab'});
      await s.wait(1000);
      await checked(s,"if(app.workspace.activeLeaf.view.getViewType()!=='pdf')throw Error('exported PDF did not open');return true;");
      await click(s,{selector:'.pdf-toolbar-left > .clickable-icon:nth-of-type(7)'});
      await click(s,{selector:'.menu-item',textRu:'Подогнать по высоте',textEn:'height'});
      await s.caption({ru:'Готовый PDF: две страницы, сохранённые плагином',en:'The finished PDF: two pages exported by the plugin'});
      await s.wait(1500);
      await checked(s,"await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(window.__welcomeGuidePath));delete window.__welcomeGuidePath;return true;");
      await s.wait(700);
    }
  }
  await finish(s,{ru:'Справка остаётся в хранилище вместе с вашими заметками',en:'The guide stays in your vault beside your notes'});
}
