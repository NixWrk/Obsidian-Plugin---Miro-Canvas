import {board, checked, click, finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';

export async function prepare(s) {
  const ru = s.lang === 'ru';
  await board(s, ru ? 'Тема доски.canvas' : 'Board theme.canvas', {
    nodes: [
      {id:'theme-default',type:'text',text:ru?'План встречи':'Meeting plan',x:-340,y:-110,width:280,height:220},
      {id:'theme-sticky',type:'text',text:ru?'Важная идея':'An important idea',x:80,y:-100,width:240,height:220},
    ],
    edges: [{id:'theme-line',fromNode:'theme-default',fromSide:'right',toNode:'theme-sticky',toSide:'left'}],
    miroCanvas:{schemaVersion:1,localOverrides:{'theme-sticky':{colors:{fill:'#fff2a6',text:'#302b20'},typography:{fontSize:28,alignment:'center',verticalAlign:'center'}}}},
  });
  await checked(s, "window.__themeOriginal=JSON.stringify(app.workspace.activeLeaf.view.canvas.getData().nodes);return true;");
  await s.caption({ru:'1. Меню доски → тёмная тема',en:'1. Board menu → Dark theme'});
}

async function chooseTheme(s, theme) {
  const choice={selector:'.miro-canvas-dock__menu--board [data-value="'+theme+'"]'};
  if(!await s.find(choice))await click(s,{selector:'.miro-canvas-dock button:has(.lucide-settings-2)'});
  await click(s,choice);
  if(await s.find(choice))await click(s,{selector:'.miro-canvas-dock button:has(.lucide-settings-2)'});
  await checked(s, `
    const root=app.plugins.plugins['miro-canvas'].m1Session.root;
    if(root.getAttribute('data-miro-canvas-resolved-theme')!==${JSON.stringify(theme)})throw Error('board theme did not change');
    if(document.body.classList.contains('theme-dark'))throw Error('application theme was changed');
    const data=app.workspace.activeLeaf.view.canvas.getData();
    if(JSON.stringify(data.nodes)!==window.__themeOriginal)throw Error('switching theme changed the cards');
    if(data.miroCanvas.localOverrides['theme-sticky'].colors.fill!=='#fff2a6')throw Error('explicit sticky colour changed');
    const surface=document.querySelector('.miro-canvas-tools > .miro-canvas-toolbar__bar');
    const probe=document.createElement('canvas');probe.width=1;probe.height=1;
    const context=probe.getContext('2d');
    let channels;
    for(let element=surface;element;element=element.parentElement){
      context.clearRect(0,0,1,1);context.fillStyle=getComputedStyle(element).backgroundColor;context.fillRect(0,0,1,1);
      const pixel=context.getImageData(0,0,1,1).data;
      if(pixel[3]>0){channels=[...pixel].slice(0,3);break;}
    }
    if(!channels)throw Error('toolbar paint could not be checked');
    if(${JSON.stringify(theme)}==='dark'?Math.max(...channels)>100:Math.min(...channels)<180)throw Error('controls did not follow the board theme');
    return true;
  `);
}

export default async function(s) {
  await s.wait(1400);
  await chooseTheme(s,'dark');
  await s.caption({ru:'2. Панели и обычные карточки становятся тёмными',en:'2. Controls and default cards follow the dark theme'});
  await s.wait(3000);
  await s.caption({ru:'3. Верните светлую тему в том же меню',en:'3. Switch back to Light in the same menu'});
  await chooseTheme(s,'light');
  await finish(s,{ru:'Цвет стикера и ваши данные сохраняются',en:'Your sticky colour and board content stay the same'});
}
