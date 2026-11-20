'use strict';
const element = id => document.getElementById(id);
const cameraState = {scenario:element('scenario').value,label:'all',index:0,token:0,controller:null};

async function loadCameras(){
  const token=++cameraState.token;
  cameraState.controller?.abort();cameraState.controller=new AbortController();
  element('earlier').disabled=true;element('later').disabled=true;
  element('camera-grid').setAttribute('aria-busy','true');element('camera-grid').classList.add('loading');
  element('camera-error').hidden=true;
  // Hide previous links immediately so a changed scenario cannot open stale images.
  element('camera-grid').replaceChildren();element('camera-status').textContent='Đang tải các góc nhìn…';
  try{
    const query=new URLSearchParams({scenario:cameraState.scenario,label:cameraState.label,index:String(cameraState.index)});
    const response=await fetch('/api/datasets/cameras?'+query,{signal:cameraState.controller.signal});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Không tải được ảnh camera.');
    if(token!==cameraState.token)return;
    cameraState.index=data.index;
    element('camera-status').textContent=data.caption;
    element('moment-position').textContent=data.count?`${data.index+1} / ${data.count}`:'0 / 0';
    Array.from(element('camera-posture').options).forEach(option=>{option.disabled=option.value!=='all'&&!data.label_counts[Number(option.value)];});
    const fragment=document.createDocumentFragment();
    data.views.forEach(view=>{
      const card=document.createElement(view.demo_url?'a':'div');card.className='camera-card';
      if(view.demo_url){
        card.href=view.demo_url;
        const image=document.createElement('img');image.src=view.image_url;image.alt=`Camera ${view.camera} · ${data.caption}`;image.width=image.height=128;
        card.append(image);
      }
      const caption=document.createElement('span'),name=document.createElement('strong'),action=document.createElement('small');
      name.textContent=`Camera ${view.camera}`;action.textContent=view.demo_url?'Thử ảnh này →':'Chưa có ảnh trên máy';
      caption.append(name,action);card.append(caption);fragment.append(card);
    });
    if(!data.count){const empty=document.createElement('p');empty.className='gallery-empty';empty.textContent='Không có ảnh validation ở nhóm này. Hãy chọn tư thế khác.';fragment.append(empty);}
    element('camera-grid').replaceChildren(fragment);
    element('earlier').disabled=!data.count||data.index===0;
    element('later').disabled=!data.count||data.index>=data.count-1;
  }catch(error){
    if(token!==cameraState.token||error.name==='AbortError')return;
    element('camera-error').textContent=error.message;element('camera-error').hidden=false;
    element('camera-status').textContent='Chưa tải được ảnh.';element('moment-position').textContent='—';
  }finally{if(token===cameraState.token){element('camera-grid').setAttribute('aria-busy','false');element('camera-grid').classList.remove('loading');}}
}

element('scenario').addEventListener('change',()=>{cameraState.scenario=element('scenario').value;cameraState.label='all';element('camera-posture').value='all';cameraState.index=0;loadCameras();});
element('camera-posture').addEventListener('change',()=>{cameraState.label=element('camera-posture').value;cameraState.index=0;loadCameras();});
element('earlier').addEventListener('click',()=>{cameraState.index--;loadCameras();});
element('later').addEventListener('click',()=>{cameraState.index++;loadCameras();});
// The initial eight images are server rendered; do not request them twice on load.
