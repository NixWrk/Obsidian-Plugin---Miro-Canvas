import {board, checked, finish} from './_guide.mjs';
export {cleanup} from './_guide.mjs';
export async function prepare(s) {
  const ru=s.lang==='ru';
  await board(s,ru?'Создание фрейма.canvas':'Create a frame.canvas',{nodes:[
    {id:'a100000000000001',type:'text',text:ru?'Выбрать место':'Choose a place',x:-320,y:-80,width:250,height:170,color:'3'},
    {id:'a100000000000002',type:'text',text:ru?'Пригласить команду':'Invite the team',x:70,y:-80,width:250,height:170,color:'4'}],edges:[]});
  await s.caption({ru:'1. Нажмите F и обведите связанные задачи',en:'1. Press F and frame related tasks'});
}
export default async function(s) {
  await s.wait(1200);
  const a=await s.find({selector:'[data-demo-id="a100000000000001"]'});
  const b=await s.find({selector:'[data-demo-id="a100000000000002"]'});
  await s.key('F');
  await s.move({x:a.x-a.width/2-30,y:a.y-a.height/2-45},{duration:650});
  await s.drag({x:a.x-a.width/2-30,y:a.y-a.height/2-45},{x:b.x+b.width/2+30,y:b.y+b.height/2+45},{duration:1400});
  await s.key('Escape');
  await s.caption({ru:'2. Переместите фрейм за его название',en:'2. Move the frame by its title'});
  const title=await s.find({selector:'.canvas-group-label'});
  if(!title)throw Error('created frame is missing');
  await s.move(title,{duration:650});
  await s.drag(title,{x:title.x+45,y:title.y+65},{duration:1400});
  await checked(s,`const data=app.workspace.activeLeaf.view.canvas.getData();if(data.nodes.filter(node=>node.type==='group').length!==1||data.nodes.filter(node=>node.type==='text').some(node=>node.y===-80))throw Error('frame did not move its cards');return true;`);
  await s.key('Escape');
  await s.wait(400);
  await finish(s,{ru:'Один фрейм объединяет целый раздел доски',en:'One frame keeps a whole section together'});
}
