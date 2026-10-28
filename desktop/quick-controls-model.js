// Keep callbacks in the main process; expose only display data to the popup.
export function quickControlsModel(template){
  const actions=new Map();
  function items(nodes,parent='menu'){
    return nodes.filter(item=>item.id!=='scale').map((item,index)=>{
      const id=item.id??`${parent}-${index}`;
      if(item.click&&item.enabled!==false)actions.set(id,item.click);
      return {id,label:item.label??'',type:item.type??'normal',enabled:item.enabled!==false,checked:Boolean(item.checked),...(item.submenu?{children:items(item.submenu,id)}:{})};
    });
  }
  return {items:items(template),actions};
}
