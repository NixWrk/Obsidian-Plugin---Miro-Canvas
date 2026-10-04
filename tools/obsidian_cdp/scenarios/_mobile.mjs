export async function checked(s, code) {
  const result = await s.eval(code);
  if (result?.error) throw new Error(result.error);
  return result;
}

export async function board(s, name, { arrange = false } = {}) {
  await s.key('Escape');
  const text = s.lang === 'ru' ? ['Встреча в пятницу', 'Выбрать место'] : ['Meet on Friday', 'Choose a place'];
  const data = {nodes:[
    {id:'a100000000000001',type:'text',text:text[0],x:-160,y:-140,width:140,height:140,color:'3'},
    {id:'a100000000000002',type:'text',text:text[1],x:30,y:70,width:140,height:140,color:'4'},
  ],edges:[{id:'a200000000000001',fromNode:'a100000000000001',fromSide:'right',toNode:'a100000000000002',toSide:'top'}],miroCanvas:{schemaVersion:1,localOverrides:{
    a100000000000001:{colors:{fill:'#fff7a1',text:'#282820'},typography:{fontSize:22,alignment:'center',verticalAlign:'center'}},
    a100000000000002:{colors:{fill:'#d5f1a8',text:'#282820'},typography:{fontSize:22,alignment:'center',verticalAlign:'center'}},
  }}};
  await checked(s, `
    if (app.vault.getName() !== 'MiroCanvasTest') throw new Error('wrong vault');
    const plugin = app.plugins.plugins['miro-canvas'];
    if (!plugin) throw new Error('plugin is not loaded');
    const phone = innerWidth < 500;
    const toolbarItems = phone
      ? ['select','sticky','text','note','shape','pen','connector']
      : ['select','lasso','text','card','sticky','shape','pen','connector','comment','frame','note','media'];
    const panelLayout = ${arrange} ? {} : phone ? {
      dockBar: {anchor:'left-middle',dx:12,dy:80,orientation:'vertical'},
    } : {
      toolbar: {anchor:'left-middle',dx:16,dy:0,orientation:'vertical'},
      dockBar: {anchor:'bottom-right',dx:16,dy:20,orientation:'horizontal'},
    };
    await plugin.saveCanvasSettings({panelLayout,toolbarItems,hiddenPanelButtons:[],importQuestionAnswered:true,minimapVisible:false});
    document.querySelector('.modal-close-button')?.click();
    const name = ${JSON.stringify(name)};
    const data = ${JSON.stringify(JSON.stringify(data))};
    const existing = app.vault.getAbstractFileByPath(name);
    if (existing) await app.vault.modify(existing, data);
    else await app.vault.create(name, data);
    await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(name), {active:true});
    app.workspace.leftSplit?.collapse();
    app.workspace.rightSplit?.collapse();
    return true;
  `);
  await s.wait(1100);
  await checked(s, `
    document.querySelector('.modal-close-button')?.click();
    const canvas = app.workspace.activeLeaf.view.canvas;
    canvas.zoomToBbox({minX:-220,minY:-260,maxX:220,maxY:260});
    canvas.setViewport(canvas.tx,canvas.ty+120,canvas.tZoom);
    for(const [id,node] of canvas.nodes) node.nodeEl.dataset.demoId=id;
    document.getElementById('__cdp_cursor__').style.opacity='0';
    return true;
  `);
  await s.wait(1000);
}

export async function finish(s, copy) {
  await s.caption(copy);
  await checked(s, "document.getElementById('__cdp_cursor__').style.opacity='0'; return true;");
  await s.wait(2500);
}
