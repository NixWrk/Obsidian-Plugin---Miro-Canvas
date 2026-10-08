import { board, checked, click, finish, cleanup } from './_guide.mjs';
export { cleanup };
export async function prepare(s) {
    const ru = s.lang === 'ru';
    await board(s, ru ? 'Разметка экспорта.canvas' : 'Export page layout.canvas', { nodes: [{ id: 'layout-card-a', type: 'text', text: ru ? 'План встречи' : 'Meeting plan', x: -320, y: -150, width: 250, height: 160, color: '3' }, { id: 'layout-card-b', type: 'text', text: ru ? 'Следующие шаги' : 'Next steps', x: 80, y: -150, width: 250, height: 160, color: '4' }], edges: [] });
    await checked(s, `const c=app.workspace.activeLeaf.view.canvas;c.deselectAll();const session=app.plugins.plugins['miro-canvas'].m1Session;session.openExport();session.changeExport(state=>({...state,format:'free',pages:[{id:'layout-page',name:'1',x:-440,y:-210,width:500,height:360}]}));session.closeExport();return true;`);
    await s.caption({ ru: '1. Откроем экспорт и переместим страницу за название', en: '1. Open export and move the page by its label' });
}
async function moveControl(s, selector, dx, dy) {
    const p = await checked(s, `const e=document.querySelector('${selector}');const r=e.getBoundingClientRect();const p={x:r.x+r.width/2,y:r.y+r.height/2};if(document.elementFromPoint(p.x,p.y)!==e)throw Error('page control is obscured');return p;`);
    await s.drag({ x: p.x, y: p.y }, { x: p.x + dx, y: p.y + dy }, { duration: 1000 });
    await s.wait(450);
}
export default async function (s) {
    await click(s, { selector: '.miro-canvas-dock button:has(.lucide-settings-2)' });
    await click(s, { selector: '.miro-canvas-dock__menu--board [role="menuitem"]', textRu: 'Экспорт в PDF или PowerPoint', textEn: 'Export to PDF or PowerPoint' });
    await checked(s, `const s=app.plugins.plugins['miro-canvas'].m1Session;if(document.querySelector('.miro-canvas-export select')?.value!=='free')throw Error('prepared free-size page is missing');window.__layoutBefore={...s.exporting.state.pages[0]};return true;`);
    await moveControl(s, '.miro-canvas-export-page__tab', 65, 35);
    await checked(s, `const p=app.plugins.plugins['miro-canvas'].m1Session.exporting.state.pages[0];if(p.x<=window.__layoutBefore.x||p.y<=window.__layoutBefore.y)throw Error('page did not move');window.__layoutMoved={...p};return true;`);
    await s.caption({ ru: '2. Изменим размер за кружок в правом нижнем углу', en: '2. Resize using the dot at the bottom-right corner' });
    await moveControl(s, '.miro-canvas-export-page__corner', -70, -40);
    await checked(s, `const p=app.plugins.plugins['miro-canvas'].m1Session.exporting.state.pages[0];if(p.width>=window.__layoutMoved.width||p.height>=window.__layoutMoved.height)throw Error('page did not resize');return true;`);
    await finish(s, { ru: 'Готово: положение и размер сохраняются с доской', en: 'Done: page position and size are saved with the board' });
}
