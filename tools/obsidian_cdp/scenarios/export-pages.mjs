import {board,checked,click,finish,cleanup as releaseWindow} from './_guide.mjs';
export async function prepare(s){
  const ru=s.lang==='ru';
  await board(s,ru?'Встреча команды.canvas':'Team meeting.canvas',{nodes:[{id:'a100000000000003',type:'group',label:ru?'Идеи':'Ideas',x:-460,y:-230,width:420,height:410},{id:'a100000000000004',type:'group',label:ru?'Следующие шаги':'Next steps',x:40,y:-230,width:420,height:410},{id:'a100000000000001',type:'text',text:ru?'Встреча команды\n\nПятница, 18:00\nВыбрать место':'Team meeting\n\nFriday, 6 pm\nChoose a place',x:-420,y:-160,width:340,height:240,color:'3'},{id:'a100000000000002',type:'text',text:ru?'Подготовка\n\nПригласить команду\nСобрать вопросы':'Preparation\n\nInvite the team\nCollect questions',x:80,y:-160,width:340,height:240,color:'4'}],edges:[]});
  // Only the OS save location is predetermined. Capture and both encoders are real.
  await checked(s,`
    const remote=require('@electron/remote');
    window.__guideSaveDialog=remote.dialog.showSaveDialog;
    remote.dialog.showSaveDialog=async options=>({canceled:false,filePath:require('path').join(app.vault.adapter.getBasePath(),'guide-export.'+options.filters[0].extensions[0])});
    return true;
  `);
  await s.caption({ru:'1. Откроем экспорт и добавим страницы по фреймам',en:'1. Open export and add a page for each frame'});
}
export async function cleanup(s){
  await checked(s,`const remote=require('@electron/remote'); if(window.__guideSaveDialog) remote.dialog.showSaveDialog=window.__guideSaveDialog; delete window.__guideSaveDialog; return true;`);
  await releaseWindow(s);
}
export default async function(s){
  await s.wait(1100);
  await click(s,{selector:'.miro-canvas-dock button:has(.lucide-settings-2)'});
  await click(s,{selector:'.miro-canvas-dock__menu--board [role="menuitem"]',textRu:'Экспорт в PDF или PowerPoint',textEn:'Export to PDF or PowerPoint'});
  await click(s,{selector:'.miro-canvas-export__segment',textRu:'Книжная',textEn:'Portrait'});
  await click(s,{selector:'.miro-canvas-export__actions button',textRu:'Страница на каждый фрейм',textEn:'A page per frame'});
  await click(s,{selector:'.miro-canvas-export__page .miro-canvas-export__page-action:last-child'});
  await checked(s,`if(document.querySelectorAll('.miro-canvas-export__page').length!==2) throw new Error('expected two pages'); return true;`);
  await s.caption({ru:'2. Сохраним две страницы в PDF и PowerPoint',en:'2. Save both pages as PDF and PowerPoint'});
  for(const index of [1,2]){
    await click(s,{selector:`.miro-canvas-export__out button:nth-child(${index})`});
    for(let attempt=0;attempt<50;attempt++){
      await s.wait(250);
      if(await checked(s,`return !document.querySelector('.miro-canvas-export__out button').disabled;`)) break;
    }
    await checked(s,`const fs=require('original-fs'); const p=require('path').join(app.vault.adapter.getBasePath(),'guide-export.${index===1?'pdf':'pptx'}'); if(!fs.existsSync(p)||fs.statSync(p).size<1000) throw new Error('export file missing'); return true;`);
    await s.wait(700);
  }
  await click(s,{selector:'.miro-canvas-export__close'});
  await s.caption({ru:'3. Проверим готовый PDF',en:'3. Open the finished PDF'});
  await checked(s,`const p='guide-export.pdf'; for(let n=0;n<30&&!app.vault.getAbstractFileByPath(p);n++) await new Promise(r=>setTimeout(r,100)); await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(p)); return true;`);
  await s.wait(1500);
  await checked(s,`if(app.workspace.activeLeaf.view.getViewType()!=='pdf') throw new Error('PDF did not open'); return true;`);
  await click(s,{selector:'.pdf-toolbar-left > .clickable-icon:nth-of-type(7)'});
  await click(s,{selector:'.menu-item',textRu:'Подогнать по высоте',textEn:'height'});
  await s.wait(500);
  await finish(s,{ru:'Готово: две страницы PDF и два слайда PowerPoint',en:'Done: two PDF pages and two PowerPoint slides'});
}
