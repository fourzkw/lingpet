const scene=document.querySelector('.companion-scene');
const speech=document.getElementById('petSpeech'),status=document.getElementById('sceneStatus'),pet=document.getElementById('greetPet');
const states={idle:['准备好啦，今天也一起加油！','陪你待着'],thinking:['让我想想，灵感马上就来…','陪你思考'],working:['专注时间！我在这里陪你。','一起努力中'],done:['做得好！这一步值得庆祝。','为你开心']};
let greeting=0;
for(const button of document.querySelectorAll('[data-demo]'))button.addEventListener('click',()=>{
 const key=button.dataset.demo;scene.dataset.state=key;speech.textContent=states[key][0];status.replaceChildren();const dot=document.createElement('i');dot.className='live-dot';status.append(dot,document.createTextNode(' '+states[key][1]));
 for(const item of document.querySelectorAll('[data-demo]')){const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));}
});
pet?.addEventListener('click',()=>{speech.textContent=['收到摸摸头，能量 +1 ♡','你来啦！休息一下再出发吧。','今天也很高兴见到你。'][greeting++%3];pet.classList.remove('greet');void pet.offsetWidth;pet.classList.add('greet');});
