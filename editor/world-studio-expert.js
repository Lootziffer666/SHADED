function attachExpertToggle(){
  const head=document.querySelector('#world-studio .world-studio-head');
  if(!head||head.querySelector('.world-studio-expert'))return;
  const toggle=head.querySelector('.world-studio-toggle');
  const button=document.createElement('button');
  button.type='button';
  button.className='world-studio-expert';
  button.textContent='ERWEITERT';
  button.title='Einzelwerkzeuge nur bei Bedarf einblenden';
  button.addEventListener('click',()=>{
    const open=document.body.classList.toggle('world-expert-open');
    button.classList.toggle('active',open);
    button.textContent=open?'BASIS':'ERWEITERT';
    if(!open){
      document.body.classList.remove('inspector-open');
      document.body.classList.add('inspector-collapsed');
    }
  });
  head.insertBefore(button,toggle);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attachExpertToggle,{once:true});
else attachExpertToggle();
requestAnimationFrame(attachExpertToggle);
