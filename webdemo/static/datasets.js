'use strict';
const element = id => document.getElementById(id);
const cameraState = {scenario:element('scenario').value,label:'all',index:0,token:0,controller:null,
  count:Number(element('random-moment').dataset.count),
  comparison:null,hasViews:element('camera-grid').querySelector('.camera-card')!==null};

function updateComparisonButton(){
  const button=element('compare-cameras');
  button.disabled=!cameraState.hasViews||element('camera-model').disabled||cameraState.comparison!==null;
  button.textContent=cameraState.comparison?'Đang so sánh…':'So sánh dự đoán';
}

function clearComparison(){
  cameraState.comparison?.abort();cameraState.comparison=null;
  const status=element('camera-comparison-status');
  status.textContent='';delete status.dataset.result;
  element('camera-prediction-error').hidden=true;
  element('camera-grid').querySelectorAll('.camera-card').forEach(card=>{
    card.querySelector('.camera-prediction')?.remove();
    card.querySelector('.camera-action').hidden=false;
    card.href=card.dataset.demoUrl;
  });
  updateComparisonButton();
}

async function compareCameras(){
  if(element('compare-cameras').disabled)return;
  clearComparison();
  const controller=new AbortController();cameraState.comparison=controller;
  updateComparisonButton();
  try{
    const response=await fetch('/api/datasets/cameras/predict',{
      method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({scenario:Number(cameraState.scenario),label:cameraState.label,index:cameraState.index,
        model:element('camera-model').value}),
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Chưa so sánh được dự đoán.');
    if(cameraState.comparison!==controller)return;

    for(const result of data.results){
      const card=element('camera-grid').querySelector(`[data-camera="${result.camera}"]`);
      const line=document.createElement('span');line.className='camera-prediction';
      const posture=document.createElement('span');posture.textContent=`${result.code} · ${result.label}`;
      const badge=document.createElement('span');badge.className=`match-badge ${result.correct?'correct':'incorrect'}`;
      badge.textContent=result.correct?'✓ Đúng':'✕ Sai';
      line.append(posture,badge);card.append(line);
      card.querySelector('.camera-action').hidden=true;
      card.href=result.demo_url+'#result';
    }
    const correct=data.results.filter(result=>result.correct).length;
    const total=data.results.length;
    const status=element('camera-comparison-status');
    status.dataset.result=correct===total?'all':correct===0?'none':'partial';
    status.textContent=`${correct}/${total} góc dự đoán đúng`;
  }catch(error){
    if(cameraState.comparison!==controller||error.name==='AbortError')return;
    element('camera-prediction-error').textContent=error.message;element('camera-prediction-error').hidden=false;
  }finally{
    if(cameraState.comparison===controller){cameraState.comparison=null;updateComparisonButton();}
  }
}

async function loadCameras(){
  const token=++cameraState.token;
  cameraState.controller?.abort();cameraState.controller=new AbortController();
  cameraState.hasViews=false;clearComparison();
  element('earlier').disabled=true;element('later').disabled=true;element('random-moment').disabled=true;
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
    cameraState.count=data.count;
    element('camera-status').textContent=data.caption;
    element('moment-position').textContent=data.count?`${data.index+1} / ${data.count}`:'0 / 0';
    Array.from(element('camera-posture').options).forEach(option=>{option.disabled=option.value!=='all'&&!data.label_counts[Number(option.value)];});
    const fragment=document.createDocumentFragment();
    data.views.forEach(view=>{
      const title='Camera '+view.camera+' · '+data.caption;
      const tile=document.createElement('div');tile.className='zoom-frame';
      const card=document.createElement('a');card.className='camera-card';card.href=view.demo_url;
      card.dataset.camera=view.camera;card.dataset.demoUrl=view.demo_url;
      const image=document.createElement('img');image.src=view.image_url;image.alt=title;image.width=image.height=128;
      card.append(image);
      const caption=document.createElement('span'),name=document.createElement('strong'),action=document.createElement('small');
      name.textContent='Camera '+view.camera;action.textContent='Thử ảnh này →';action.className='camera-action';
      caption.append(name,action);card.append(caption);
      tile.append(card,makeZoomControl(view.image_url,title));fragment.append(tile);
    });
    if(!data.count){const empty=document.createElement('p');empty.className='gallery-empty';empty.textContent='Không có ảnh validation ở nhóm này. Hãy chọn tư thế khác.';fragment.append(empty);}
    element('camera-grid').replaceChildren(fragment);
    cameraState.hasViews=data.views.length>0;updateComparisonButton();
    element('earlier').disabled=!data.count||data.index===0;
    element('later').disabled=!data.count||data.index>=data.count-1;
    element('random-moment').disabled=data.count<2;
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
element('random-moment').addEventListener('click',()=>{
  const index=Math.floor(Math.random()*(cameraState.count-1));
  cameraState.index=index>=cameraState.index?index+1:index;
  loadCameras();
});
element('camera-model').addEventListener('change',clearComparison);
element('compare-cameras').addEventListener('click',compareCameras);

element('shuffle-postures').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const examples = element('posture-examples');
  const error = element('posture-error');
  const status = element('posture-status');
  const params = new URLSearchParams();
  examples.querySelectorAll('[data-posture-sample]').forEach((item) => {
    params.append('exclude', item.dataset.postureSample);
  });
  button.disabled = true;
  examples.setAttribute('aria-busy', 'true');
  error.hidden = true;
  status.textContent = '';
  try {
    const response = await fetch(button.dataset.url + '?' + params, {cache: 'no-store'});
    if (!response.ok) throw new Error('Chưa tải được ảnh mới. Hãy thử lại.');
    examples.innerHTML = await response.text();
    status.textContent = 'Đã đổi ảnh minh họa P1–P4.';
  } catch {
    error.textContent = 'Chưa tải được ảnh mới. Hãy thử lại.';
    error.hidden = false;
  } finally {
    button.disabled = false;
    examples.setAttribute('aria-busy', 'false');
  }
});
