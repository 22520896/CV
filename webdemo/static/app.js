'use strict';
const $ = id => document.getElementById(id);
const state = {dataset:'mix',camera:1,model:'hog_svm_rbf',source:'real',label:'all',page:1,pages:1,total:0,items:[],selected:null,available:false,busy:false,listToken:0,configToken:0,runToken:0,controller:null};

async function api(url, options={}) {
  const response=await fetch(url,options);
  let data;
  try {data=await response.json();} catch {throw new Error('Không kết nối được với web. Hãy thử lại.');}
  if(!response.ok) throw new Error(data.error || 'Chưa xử lý được yêu cầu.');
  return data;
}
function query(extra={}) {return new URLSearchParams({dataset:state.dataset,camera:String(state.camera),source:state.source,label:state.label,page:String(state.page),...extra});}
function errorAt(id,message='') {$(id).textContent=message;$(id).hidden=!message;}
function updateButton(){ $('predict').disabled=!state.selected||!state.available||state.busy; }
function clearResult(){
  state.runToken++;state.controller?.abort();state.controller=null;state.busy=false;
  $('button-spinner').hidden=true;$('button-label').textContent='Phân loại ảnh';
  $('result-content').hidden=true;$('result-empty').hidden=false;$('result-empty').textContent='Kết quả sẽ hiển thị ở đây.';
  errorAt('prediction-error');updateButton();
}
function clearSelection(){clearResult();state.selected=null;$('preview-image').hidden=true;$('preview-empty').hidden=false;$('selected-title').textContent='Chưa có ảnh';$('source-caption').textContent='';updateButton();}
function selectedBorders(){
  document.querySelectorAll('.sample').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.id===state.selected?.id&&state.selected?.source===state.source)));
}
function selectSample(item, scroll=true){
  clearResult();state.selected=item;
  $('preview-image').src=item.image_url;$('preview-image').alt=item.title;$('preview-image').hidden=false;$('preview-empty').hidden=true;
  $('selected-title').textContent=item.title;
  $('source-caption').textContent={real:'Ảnh real',validation:'Ảnh validation',upload:'Ảnh tải lên'}[item.source];
  selectedBorders();updateButton();
  if(scroll&&window.matchMedia('(max-width:900px)').matches)$('viewer').scrollIntoView({behavior:'smooth',block:'start'});
}
function fillFilter(labels){
  const previous=state.label;$('posture-filter').replaceChildren(new Option('Tất cả tư thế','all'));
  labels.forEach((label,i)=>$('posture-filter').add(new Option(`P${i+1} · ${label}`,String(i))));
  $('posture-filter').value=previous;
}
async function loadGallery(){
  if(state.source==='upload')return;
  const token=++state.listToken;errorAt('gallery-error');$('gallery').classList.add('loading');$('gallery').setAttribute('aria-busy','true');
  $('random').disabled=true;$('previous-page').disabled=true;$('next-page').disabled=true;
  if(!state.items.length){const placeholder=document.createElement('div');placeholder.className='gallery-loading';placeholder.textContent='Đang tải ảnh…';$('gallery').replaceChildren(placeholder);}
  try{
    const data=await api('/api/samples?'+query());if(token!==state.listToken)return;
    state.items=data.items;state.total=data.total;state.page=data.page;state.pages=data.pages;fillFilter(data.labels);
    const fragment=document.createDocumentFragment();
    data.items.forEach(item=>{
      const button=document.createElement('button');button.type='button';button.className='sample';button.dataset.id=item.id;button.dataset.testid=`sample-${item.id}`;
      button.setAttribute('aria-label',`${item.title} · ${item.reference.label}`);button.setAttribute('aria-pressed',String(state.selected?.id===item.id&&state.selected?.source===state.source));
      const image=document.createElement('img');image.src=item.thumbnail_url;image.alt='';image.loading='lazy';
      const caption=document.createElement('span');caption.className='sample-label';
      const number=document.createElement('span');number.className='sample-number';number.textContent=String(item.order).padStart(2,'0');
      const label=document.createElement('span');label.className='sample-posture';label.textContent=item.reference.label;
      caption.append(number,label);button.append(image,caption);button.addEventListener('click',()=>selectSample(item));fragment.append(button);
    });
    if(!data.items.length){const empty=document.createElement('p');empty.className='gallery-empty';empty.textContent='Chưa có ảnh phù hợp.';fragment.append(empty);}
    $('gallery').replaceChildren(fragment);
    const first=data.total?((data.page-1)*data.page_size+1):0,last=Math.min(data.page*data.page_size,data.total);
    $('page-info').textContent=`${first}–${last} / ${data.total}`;
    $('previous-page').disabled=data.page<=1;$('next-page').disabled=data.page>=data.pages;$('random').disabled=!data.total;
  }catch(error){if(token===state.listToken){errorAt('gallery-error',error.message);$('page-info').textContent='Không tải được ảnh';}}
  finally{if(token===state.listToken){$('gallery').classList.remove('loading');$('gallery').setAttribute('aria-busy','false');}}
}
async function configure(){
  const token=++state.configToken;state.available=false;updateButton();$('model').disabled=true;errorAt('prediction-error');
  try{
    const data=await api('/api/config?'+query());if(token!==state.configToken)return;
    const model=$('model');model.replaceChildren();
    data.models.forEach(item=>{const option=new Option(item.name+(item.available?'':' · Chưa có'),item.id);option.disabled=!item.available;model.add(option);});
    const chosen=data.models.find(item=>item.id===state.model&&item.available)||data.models.find(item=>item.available);
    if(chosen){state.model=chosen.id;model.value=chosen.id;state.available=true;}else errorAt('prediction-error','Chưa có model trên máy này.');
    model.disabled=!chosen;updateButton();
  }catch(error){if(token===state.configToken)errorAt('prediction-error',error.message);}
}
function setSource(source){
  if(source===state.source)return;
  state.listToken++;state.source=source;state.label='all';state.page=1;state.items=[];clearSelection();
  document.querySelectorAll('[data-source]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.source===source)));
  $('library-panel').hidden=source==='upload';$('upload-panel').hidden=source!=='upload';
  $('library-panel').setAttribute('aria-labelledby',`tab-${source}`);
  $('source-note').textContent=source==='real'?'Ảnh ngoài dataset, có nhãn tham chiếu.':'Ảnh thuộc phần validation giữ riêng của bộ đã chọn.';
  if(source!=='upload')loadGallery();
}
async function changeContext(){
  clearResult();state.dataset=$('dataset').value;state.camera=state.dataset==='mcf'?Number($('camera').value):1;
  $('camera').value=String(state.camera);$('camera-field').hidden=state.dataset!=='mcf';
  if(state.source==='validation')clearSelection();
  state.page=1;state.label='all';await Promise.all([configure(),loadGallery()]);
}
async function uploadFile(file){
  if(!file)return;clearSelection();errorAt('gallery-error');$('upload-name').textContent='Đang tải ảnh…';
  if(file.size>8*1024*1024){errorAt('gallery-error','Ảnh vượt quá 8 MB. Hãy chọn ảnh nhỏ hơn.');$('upload-name').textContent='';return;}
  const token=++state.listToken;const body=new FormData();body.append('image',file);
  try{
    const item=await api('/api/upload',{method:'POST',body});if(token!==state.listToken||state.source!=='upload')return;
    $('upload-name').textContent=item.title;$('change-upload').hidden=false;selectSample(item);
  }catch(error){if(token===state.listToken){errorAt('gallery-error',error.message);$('upload-name').textContent='';}}
}
async function predict(){
  if(!state.selected||!state.available||state.busy)return;
  clearResult();const token=state.runToken,selected=state.selected;state.busy=true;state.controller=new AbortController();updateButton();
  $('button-spinner').hidden=false;$('button-label').textContent='Đang phân loại…';$('result-empty').textContent='Đang xử lý ảnh. Lần tải model đầu tiên có thể lâu hơn.';
  try{
    const data=await api('/api/predict',{method:'POST',headers:{'Content-Type':'application/json'},signal:state.controller.signal,
      body:JSON.stringify({source:selected.source,id:selected.id,dataset:state.dataset,camera:state.camera,model:state.model})});
    if(token!==state.runToken)return;
    $('prediction-code').textContent=data.prediction.code;$('prediction-label').textContent=data.prediction.label;
    $('result-model').textContent=data.prediction.model_name;
    $('result-time').textContent=data.prediction.elapsed_ms<10?'<0,01 giây':(data.prediction.elapsed_ms/1000).toLocaleString('vi-VN',{maximumFractionDigits:2})+' giây';
    $('reference').hidden=!data.reference;
    if(data.reference){
      const name=data.reference.kind==='manual'?'Tham chiếu':'Nhãn gốc';
      $('reference').textContent=`${name}: ${data.reference.code} · ${data.reference.label}`;
    }
    const credit=data.reference?.credit;
    $('image-credit').hidden=!credit;
    if(credit){
      $('image-credit').href=credit.source;
      $('image-credit').textContent=`${credit.title} · ${credit.author} · ${credit.license}`;
    }
    const badge=$('match-badge');badge.hidden=data.correct===null;
    if(data.correct!==null){badge.className='match-badge '+(data.correct?'correct':'incorrect');badge.textContent=data.correct?'✓ Đúng':'✕ Sai';}
    $('result-empty').hidden=true;$('result-content').hidden=false;
  }catch(error){if(token===state.runToken&&error.name!=='AbortError'){errorAt('prediction-error',error.message);$('result-empty').textContent='Chưa có kết quả.';}}
  finally{if(token===state.runToken){state.busy=false;state.controller=null;$('button-spinner').hidden=true;$('button-label').textContent='Phân loại ảnh';updateButton();}}
}

document.querySelectorAll('[data-source]').forEach(button=>button.addEventListener('click',()=>setSource(button.dataset.source)));
$('dataset').addEventListener('change',changeContext);$('camera').addEventListener('change',changeContext);
$('model').addEventListener('change',()=>{state.model=$('model').value;clearResult();});
$('posture-filter').addEventListener('change',()=>{state.label=$('posture-filter').value;state.page=1;clearSelection();loadGallery();});
$('previous-page').addEventListener('click',()=>{state.page--;loadGallery();});$('next-page').addEventListener('click',()=>{state.page++;loadGallery();});
$('random').addEventListener('click',async()=>{
  const signature=[state.dataset,state.camera,state.source,state.label].join('|');
  const stillCurrent=()=>signature===[state.dataset,state.camera,state.source,state.label].join('|');
  $('random').disabled=true;
  try{const data=await api('/api/samples/random?'+query());if(!stillCurrent())return;state.page=data.page;await loadGallery();if(stillCurrent())selectSample(data.sample);}
  catch(error){if(stillCurrent())errorAt('gallery-error',error.message);}finally{if(stillCurrent())$('random').disabled=!state.total;}
});
$('image').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';uploadFile(file);});
$('change-upload').addEventListener('click',()=>$('image').click());
['dragenter','dragover'].forEach(name=>$('upload-zone').addEventListener(name,event=>{event.preventDefault();$('upload-zone').classList.add('dragging');}));
['dragleave','drop'].forEach(name=>$('upload-zone').addEventListener(name,event=>{event.preventDefault();$('upload-zone').classList.remove('dragging');}));
$('upload-zone').addEventListener('drop',event=>uploadFile(event.dataTransfer.files[0]));
$('predict').addEventListener('click',predict);$('choose-another').addEventListener('click',()=>$('picker').scrollIntoView({behavior:'smooth'}));
document.querySelectorAll('[data-source]').forEach(button=>button.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();const sources=['real','validation','upload'];const step=event.key==='ArrowRight'?1:-1;
  const next=sources[(sources.indexOf(button.dataset.source)+step+3)%3];setSource(next);$('tab-'+next).focus();
}));
async function initialize(){
  const initial=JSON.parse($('demo-initial')?.textContent||'null');
  if(initial){
    state.dataset=initial.dataset;state.camera=initial.camera;state.source='validation';state.page=initial.page;
    $('dataset').value=state.dataset;$('camera').value=String(state.camera);$('camera-field').hidden=state.dataset!=='mcf';
    document.querySelectorAll('[data-source]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.source==='validation')));
    $('library-panel').setAttribute('aria-labelledby','tab-validation');
    $('source-note').textContent='Ảnh thuộc phần validation giữ riêng của bộ đã chọn.';
    selectSample(initial.sample,false);
  }
  await Promise.all([configure(),loadGallery()]);
}
initialize();
