'use strict';
const $ = id => document.getElementById(id);
const state = {dataset:'mix',camera:1,models:['resnet50_softmax'],source:'real',validationDataset:'all',label:'all',page:1,pages:1,total:0,items:[],selected:null,available:false,busy:false,listToken:0,configToken:0,runToken:0,controller:null};
const scoreHeadings = {
  probability: 'Xác suất theo model',
  neighbor_votes: 'Tỷ lệ phiếu có trọng số',
  pairwise_votes: 'Tỷ lệ phiếu theo từng cặp lớp',
  relative_score: 'Điểm tương đối',
};
const percentFormat = new Intl.NumberFormat('vi-VN', {style:'percent', maximumFractionDigits:1});

async function api(url, options={}) {
  const response=await fetch(url,options);
  let data;
  try {data=await response.json();} catch {throw new Error('Không kết nối được với web. Hãy thử lại.');}
  if(!response.ok) throw new Error(data.error || 'Chưa xử lý được yêu cầu.');
  return data;
}
function query(extra={}) {return new URLSearchParams({dataset:state.dataset,camera:String(state.camera),source:state.source,validation_dataset:state.validationDataset,label:state.label,page:String(state.page),...extra});}
function errorAt(id,message='') {$(id).textContent=message;$(id).hidden=!message;}
function updateButton(){ $('predict').disabled=!state.selected||!state.available||!state.models.length||state.busy; }
function clearResult(){
  state.runToken++;state.controller?.abort();state.controller=null;state.busy=false;
  $('button-spinner').hidden=true;$('button-label').textContent='Phân loại ảnh';
  $('result-content').hidden=true;$('result-empty').hidden=false;$('result-empty').textContent='Kết quả sẽ hiển thị ở đây.';
  errorAt('prediction-error');updateButton();
}
function clearSelection(){
  clearResult();state.selected=null;
  $('preview-image').hidden=true;$('preview-empty').hidden=false;$('zoom-preview').hidden=true;
  $('selected-title').textContent='Chưa có ảnh';$('source-caption').textContent='';updateButton();
}
function selectedBorders(){
  document.querySelectorAll('.sample').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.id===state.selected?.id&&state.selected?.source===state.source)));
}
function selectSample(item, scroll=true){
  clearResult();state.selected=item;
  $('preview-image').src=item.image_url;$('preview-image').alt=item.title;$('preview-image').hidden=false;$('preview-empty').hidden=true;
  const zoom=$('zoom-preview');
  zoom.dataset.zoomSrc=item.image_url;
  zoom.dataset.zoomLabel=item.title;
  zoom.hidden=false;
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
function syncValidationFilters(){
  const showingValidation=state.source==='validation';
  const filter=$('validation-dataset-filter');
  filter.hidden=!showingValidation||state.dataset!=='mix';
  filter.value=state.validationDataset;
  const camera=$('camera');
  camera.hidden=!showingValidation||state.dataset!=='mcf';
  camera.value=String(state.camera);
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
      if(item.width&&item.height){image.width=item.width;image.height=item.height;}
      const caption=document.createElement('span');caption.className='sample-label';
      const marker=document.createElement('span');
      if(item.dataset_name){
        caption.classList.add('sample-label--validation');
        marker.className='sample-dataset';marker.dataset.dataset=item.dataset;marker.textContent=item.dataset_name;
      }else{
        marker.className='sample-number';marker.textContent=String(item.order).padStart(2,'0');
      }
      const label=document.createElement('span');label.className='sample-posture';label.textContent=item.reference.label;
      caption.append(marker,label);button.append(image,caption);button.addEventListener('click',()=>selectSample(item));
      const tile = document.createElement('div');
      tile.className = 'zoom-frame';
      tile.append(button, makeZoomControl(item.image_url, item.title + ' · ' + item.reference.label));
      fragment.append(tile);
    });
    if(!data.items.length){const empty=document.createElement('p');empty.className='gallery-empty';empty.textContent='Chưa có ảnh phù hợp.';fragment.append(empty);}
    $('gallery').replaceChildren(fragment);
    const first=data.total?((data.page-1)*data.page_size+1):0,last=Math.min(data.page*data.page_size,data.total);
    $('page-info').textContent=`${first}–${last} / ${data.total}`;
    $('previous-page').disabled=data.page<=1;$('next-page').disabled=data.page>=data.pages;$('random').disabled=!data.total;
  }catch(error){if(token===state.listToken){errorAt('gallery-error',error.message);$('page-info').textContent='Không tải được ảnh';}}
  finally{if(token===state.listToken){$('gallery').classList.remove('loading');$('gallery').setAttribute('aria-busy','false');}}
}
function updateModelSelection(){
  const options=[...$('model-options').querySelectorAll('input[data-name]:enabled')];
  const checked=options.filter(option=>option.checked);
  const selectAll=$('select-all-models');
  selectAll.checked=checked.length>0&&checked.length===options.length;
  selectAll.indeterminate=checked.length>0&&!selectAll.checked;
  state.models=checked.map(option=>option.value);
  let caption='Chọn model';
  if(checked.length===1)caption=checked[0].dataset.name;
  if(checked.length>1)caption=`${checked.length} model đã chọn`;
  $('model-summary-text').textContent=caption;
}
async function configure(){
  const token=++state.configToken;
  const options=$('model-options');
  state.available=false;updateButton();errorAt('prediction-error');
  $('model-menu').open=false;
  $('model-summary').setAttribute('aria-disabled','true');
  $('model-summary-text').textContent='Đang tải danh sách…';
  options.replaceChildren();
  try{
    const data=await api('/api/config?'+query());if(token!==state.configToken)return;
    const available=data.models.filter(item=>item.available);
    const chosen=available.filter(item=>state.models.includes(item.id));
    if(!chosen.length&&available.length)chosen.push(available[0]);
    const allLabel=document.createElement('label');allLabel.className='model-option model-option--all';
    const selectAll=document.createElement('input');selectAll.type='checkbox';selectAll.id='select-all-models';selectAll.disabled=!available.length;
    allLabel.append(selectAll,'Chọn tất cả');options.append(allLabel);
    data.models.forEach(item=>{
      const label=document.createElement('label');label.className='model-option';
      const input=document.createElement('input');input.type='checkbox';input.value=item.id;input.dataset.name=item.name;
      input.checked=chosen.includes(item);input.disabled=!item.available;
      label.append(input,item.name+(item.available?'':' · Chưa có'));options.append(label);
    });
    state.available=available.length>0;
    $('model-summary').setAttribute('aria-disabled',String(!state.available));
    updateModelSelection();updateButton();
    if(!state.available)errorAt('prediction-error','Chưa có model trên máy này.');
  }catch(error){if(token===state.configToken){$('model-summary-text').textContent='Không tải được danh sách';errorAt('prediction-error',error.message);}}
}
function setSource(source){
  if(source===state.source)return;
  state.listToken++;state.source=source;state.label='all';state.page=1;state.items=[];clearSelection();
  document.querySelectorAll('[data-source]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.source===source)));
  $('library-panel').hidden=source==='upload';$('upload-panel').hidden=source!=='upload';
  $('library-panel').setAttribute('aria-labelledby',`tab-${source}`);
  $('source-note').textContent=source==='real'?'Ảnh ngoài MCF và UP-Fall, được tuyển chọn để demo.':'Ảnh từ phần validation 20%.';
  syncValidationFilters();
  if(source!=='upload')loadGallery();
}
async function changeContext(){
  clearResult();state.dataset=$('dataset').value;state.camera=1;
  if(state.source==='validation')clearSelection();
  state.validationDataset='all';syncValidationFilters();
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
function renderPredictions(results){
  const list=document.createDocumentFragment();
  for(const result of results){
    const card=$('model-result-template').content.firstElementChild.cloneNode(true);
    const prediction=result.prediction;
    card.querySelector('.result-model-name').textContent=prediction?.pipeline_name||result.pipeline_name;
    if(result.error){
      card.querySelector('.posture-code').hidden=true;
      card.querySelector('.result-posture').textContent='Lỗi';
      card.querySelector('.model-score-details').hidden=true;
      const message=card.querySelector('.model-result-error');message.hidden=false;message.textContent=result.error;
    }else{
      card.querySelector('.posture-code').textContent=prediction.code;
      card.querySelector('.result-posture').textContent=prediction.label;
      card.querySelector('.score-kind').textContent=scoreHeadings[prediction.scores.kind];
      card.querySelector('.score-model').textContent=prediction.pipeline_name;
      card.querySelectorAll('.score-row').forEach(row=>{
        const value=prediction.scores.by_class[row.dataset.classId];
        row.querySelector('.score-fill').style.width=`${value*100}%`;
        row.querySelector('.score-percent').textContent=value>0&&value<0.001?'<0,1%':percentFormat.format(value);
      });
      card.querySelector('.result-time').textContent=prediction.elapsed_ms<10?'<0,01 giây':(prediction.elapsed_ms/1000).toLocaleString('vi-VN',{maximumFractionDigits:2})+' giây';
      const badge=card.querySelector('.match-badge');
      if(result.correct!==null){
        badge.hidden=false;badge.classList.add(result.correct?'correct':'incorrect');badge.textContent=result.correct?'✓ Đúng':'✕ Sai';
      }
    }
    list.append(card);
  }
  $('model-results').replaceChildren(list);
}
async function predict({expand=false}={}){
  if($('predict').disabled)return;
  clearResult();const token=state.runToken,selected=state.selected;state.busy=true;state.controller=new AbortController();updateButton();
  $('button-spinner').hidden=false;$('button-label').textContent='Đang phân loại…';$('result-empty').textContent='Đang xử lý ảnh. Lần tải model đầu tiên có thể lâu hơn.';
  try{
    const data=await api('/api/predict',{method:'POST',headers:{'Content-Type':'application/json'},signal:state.controller.signal,
      body:JSON.stringify({source:selected.source,id:selected.id,dataset:state.dataset,camera:state.camera,models:state.models})});
    if(token!==state.runToken)return;
    renderPredictions(data.results);
    if(expand)$('model-results').querySelector('.model-result').open=true;
    $('result-empty').hidden=true;$('result-content').hidden=false;
  }catch(error){if(token===state.runToken&&error.name!=='AbortError'){errorAt('prediction-error',error.message);$('result-empty').textContent='Chưa có kết quả.';}}
  finally{if(token===state.runToken){state.busy=false;state.controller=null;$('button-spinner').hidden=true;$('button-label').textContent='Phân loại ảnh';updateButton();}}
}

document.querySelectorAll('[data-source]').forEach(button=>button.addEventListener('click',()=>setSource(button.dataset.source)));
$('dataset').addEventListener('change',changeContext);
$('camera').addEventListener('change',event=>{
  state.camera=Number(event.target.value);state.page=1;clearSelection();loadGallery();
});
$('model-options').addEventListener('change',event=>{
  if(event.target.id==='select-all-models'){
    $('model-options').querySelectorAll('input[data-name]:enabled').forEach(option=>{option.checked=event.target.checked;});
  }
  updateModelSelection();clearResult();
});
$('model-summary').addEventListener('click',event=>{if(!state.available)event.preventDefault();});
document.addEventListener('click',event=>{
  if(!$('model-menu').contains(event.target))$('model-menu').open=false;
});
$('model-menu').addEventListener('keydown',event=>{
  if(event.key==='Escape'&&$('model-menu').open){$('model-menu').open=false;$('model-summary').focus();}
});
$('posture-filter').addEventListener('change',()=>{state.label=$('posture-filter').value;state.page=1;clearSelection();loadGallery();});
$('validation-dataset-filter').addEventListener('change',event=>{
  state.validationDataset=event.target.value;state.page=1;clearSelection();loadGallery();
});
$('previous-page').addEventListener('click',()=>{state.page--;loadGallery();});$('next-page').addEventListener('click',()=>{state.page++;loadGallery();});
$('random').addEventListener('click',async()=>{
  const signature=query({page:''}).toString();
  const stillCurrent=()=>signature===query({page:''}).toString();
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
    state.dataset=initial.dataset;state.camera=initial.camera;state.models=[initial.model||'hog_svm_rbf'];state.source='validation';state.page=initial.page;
    $('dataset').value=state.dataset;
    document.querySelectorAll('[data-source]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.source==='validation')));
    $('library-panel').setAttribute('aria-labelledby','tab-validation');
    $('source-note').textContent='Ảnh từ phần validation 20%.';
    selectSample(initial.sample,false);
  }
  syncValidationFilters();
  const initialRunToken=state.runToken;
  await Promise.all([configure(),loadGallery()]);
  if(initial?.model&&state.runToken===initialRunToken){
    if(state.models.includes(initial.model))await predict({expand:true});
    else errorAt('prediction-error','Model của kết quả này chưa có trên máy.');
  }
}
initialize();
