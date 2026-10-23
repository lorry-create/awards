import {analyze, buildTarget, reportText, SAMPLE, LIMIT} from './engine.mjs';

const $=id=>document.getElementById(id);
const state={report:null,source:'粘贴的文本',pages:null,importing:false,sequence:0};
const node=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
function showError(message=''){ $('error').textContent=message;$('error').hidden=!message; }
function resetReport(message='内容已更新，点击「开始分析」生成新报告。') {
  state.report=null;$('report').hidden=true;$('empty-report').hidden=false;
  $('empty-note').textContent=message;$('report-state').textContent='等待分析';showError();
}
function updateCount(){ $('char-count').textContent=$('resume-text').value.length.toLocaleString('zh-CN')+' 字符'; }
function getTargetInput(){return {role:$('role').value,jd:$('job-description').value,custom:$('custom-keywords').value};}
function updateTarget(){
  try{
    const target=buildTarget(getTargetInput());
    $('keyword-preview').textContent=target.terms.length?'将检查 '+target.terms.length+' 个词：'+target.terms.join(' · '):target.unrecognizedJD?'未从 JD 识别出预设技能词，请手动补充关键词。':'暂不进行岗位匹配，仅检查简历内容。';
  }catch(error){$('keyword-preview').textContent=error.message;}
}
function initializeTheme(){
  let saved;try{saved=localStorage.getItem('awards-theme');}catch{}
  const prefersDark=window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  function apply(value){document.documentElement.dataset.theme=value;$('theme').textContent=value==='dark'?'浅色模式':'深色模式';$('theme').setAttribute('aria-label',value==='dark'?'切换到浅色模式':'切换到深色模式');}
  apply(saved==='dark'||saved==='light'?saved:prefersDark?'dark':'light');
  $('theme').addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';apply(next);try{localStorage.setItem('awards-theme',next);}catch{}});
}

async function pdfText(buffer){
  const pdfjs=await import('./vendor/pdfjs/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:new Uint8Array(buffer),cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,isEvalSupported:false,useWasm:false,disableFontFace:true,useSystemFonts:true});
  let pdf;
  try{
    pdf=await task.promise;
    if(pdf.numPages>25)throw new Error('这份 PDF 超过 25 页，请先提取简历正文后再导入。');
    const pages=[];let total=0;
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);const content=await page.getTextContent();let text='',y=null;
      for(const item of content.items){
        if(!('str' in item))continue;
        const currentY=item.transform?.[5];
        if(y!==null&&currentY!==undefined&&Math.abs(currentY-y)>3&&text&&!text.endsWith('\n'))text+='\n';
        text+=item.str+(item.hasEOL?'\n':' ');y=currentY;
      }
      total+=text.length;if(total>LIMIT)throw new Error('PDF 提取的文字超过 50,000 字符，请只保留简历正文。');
      pages.push(text);page.cleanup();
    }
    return {text:pages.join('\n\n'),pages:pdf.numPages};
  }catch(error){
    if(error.name==='PasswordException')throw new Error('这份 PDF 受密码保护，请先导出一份未加密副本。');
    if(error.name==='InvalidPDFException')throw new Error('PDF 无法解析，文件可能损坏。请重新导出，或直接粘贴文字。');
    throw error;
  }finally{if(pdf)await pdf.destroy();else await task.destroy();}
}

function checkZipSize(buffer){
  // Bound declared expansion before decompressing DOCX files (ordinary ZIP, no ZIP64).
  const view=new DataView(buffer);let eocd=-1;
  for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}}
  if(eocd<0)throw new Error('DOCX 文件格式不完整，请用 Word 重新另存为 DOCX。');
  if(view.getUint16(eocd+4,true)!==0||view.getUint16(eocd+6,true)!==0)throw new Error('不支持分卷 DOCX 文件。');
  const count=view.getUint16(eocd+10,true);let offset=view.getUint32(eocd+16,true),size=0;
  if(count>2000)throw new Error('DOCX 内含文件过多，请导出为文字版 PDF 或粘贴文本。');
  for(let i=0;i<count;i++){
    if(offset+46>buffer.byteLength||view.getUint32(offset,true)!==0x02014b50)throw new Error('DOCX 压缩目录损坏，请重新保存文件。');
    size+=view.getUint32(offset+24,true);
    if(size>40*1024*1024)throw new Error('DOCX 解压后过大，请移除图片或只粘贴正文。');
    offset+=46+view.getUint16(offset+28,true)+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);
  }
}
async function docxText(buffer){
  checkZipSize(buffer);
  if(!window.JSZip)throw new Error('Word 解析组件未加载，请刷新页面后重试。');
  const zip=await window.JSZip.loadAsync(buffer);
  if(!zip.file('word/document.xml'))throw new Error('文件中没有 Word 正文，请确认上传的是 DOCX 文件。');
  const names=Object.keys(zip.files).filter(name=>/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(name));
  names.sort((a,b)=>a==='word/document.xml'?-1:b==='word/document.xml'?1:a.localeCompare(b));
  const chunks=[];let length=0;
  for(const name of names){
    const xml=await zip.file(name).async('string');
    if(xml.length>8*1024*1024)throw new Error('Word 正文过大，请只保留简历内容。');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)throw new Error('Word 正文 XML 无法解析，请重新导出文件。');
    const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paragraphs=Array.from(doc.getElementsByTagNameNS(ns,'p')).map(p=>Array.from(p.getElementsByTagNameNS(ns,'t')).map(t=>t.textContent).join(''));
    const text=paragraphs.join('\n');length+=text.length;
    if(length>LIMIT)throw new Error('Word 提取的文字超过 50,000 字符，请只保留简历正文。');
    chunks.push(text);
  }
  return {text:chunks.join('\n\n'),pages:null};
}
async function importFile(file){
  if(!file)return;
  const sequence=++state.sequence;
  state.importing=false;$('analyze').disabled=false;
  if(!/\.(pdf|docx|txt|md)$/i.test(file.name)){showError('支持 PDF、DOCX、TXT 和 MD。旧版 DOC 请先另存为 DOCX。');$('resume-file').value='';return;}
  if(file.size>10*1024*1024){showError('文件超过 10 MB，请压缩图片或直接粘贴正文。');$('resume-file').value='';return;}
  if(!file.size){showError('文件为空，请选择包含简历内容的文件。');$('resume-file').value='';return;}
  state.importing=true;$('analyze').disabled=true;resetReport('文件正在本地解析，完成后可检查文字并分析。');$('file-status').textContent='正在本地读取 '+file.name+'…';showError();
  try{
    const buffer=await file.arrayBuffer();let result;
    if(/\.pdf$/i.test(file.name))result=await pdfText(buffer);
    else if(/\.docx$/i.test(file.name))result=await docxText(buffer);
    else {let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('gb18030').decode(buffer);}result={text,pages:null};}
    if(sequence!==state.sequence)return;
    const text=result.text.trim();
    if(text.replace(/\s/g,'').length<80)throw new Error('提取的文字不足 80 字符。扫描 PDF / 图片型简历请先 OCR，或直接粘贴正文。');
    if(text.length>LIMIT)throw new Error('文件文字超过 50,000 字符，请只保留简历正文。');
    $('resume-text').value=text;state.source=file.name;state.pages=result.pages;
    $('upload-title').textContent=file.name;$('file-status').textContent='已在本地导入'+(result.pages?' · '+result.pages+' 页':'')+'。请检查下方文字，确认顺序后开始分析。';
    updateCount();resetReport('文字已导入。检查内容后，点击「开始分析」。');
  }catch(error){if(sequence===state.sequence){$('file-status').textContent='导入未完成。原有文字仍保留，可以更换文件或粘贴内容。';showError(error.message||'文件读取失败，请重新导出或粘贴正文。');}}
  finally{if(sequence===state.sequence){state.importing=false;$('analyze').disabled=false;$('resume-file').value='';}}
}

function renderDimension(d){
  const box=node('div','dimension');const label=node('div','dimension-label');label.append(node('span','',d.label),node('strong','',d.score===null?'未计分':`${d.score} / ${d.max}`));
  const bar=node('progress');bar.max=d.max;bar.value=d.score??0;bar.setAttribute('aria-label',d.label+(d.score===null?'未计分':` ${d.score} / ${d.max}`));box.append(label,bar);return box;
}
function renderCheck(label,pass,detail){const row=node('div','structure-item');const main=node('div');main.append(node('h4','',label),node('p','',detail));row.append(main,node('span','check-status'+(pass?' pass':''),pass?'✓ 已检出 / 通过':'待检查'));return row;}
function renderReport(r){
  $('total-score').textContent=r.score;$('score-arc').setAttribute('stroke-dasharray',`${r.score} 100`);
  $('score-ring-title').textContent=`文本诊断分 ${r.score} / 100`;$('score-title').textContent=r.title;$('score-note').textContent=r.note;
  $('report-meta').textContent=`${r.fileLabel} · ${r.chars.toLocaleString('zh-CN')} 有效字符${r.pages?' · 原文件 '+r.pages+' 页':''} · 规则 v${r.version}`;
  $('dimensions').replaceChildren(...r.dimensions.map(renderDimension));
  $('issue-count').textContent=r.recommendations[0].priority==='info'?'基础检查通过':r.recommendations.length+' 项建议';
  $('recommendations').replaceChildren(...r.recommendations.map(item=>{
    const entry=node('article','recommendation');const heading=node('div','recommendation-head');heading.append(node('span','priority '+item.priority,item.priority==='high'?'优先修改':item.priority==='info'?'人工核对':'建议完善'),node('h4','',item.title));entry.append(heading,node('p','',item.body),node('blockquote','source-quote',item.source));return entry;
  }));
  $('structure').replaceChildren(...r.checks.map(c=>renderCheck(c.label,c.pass,c.rule)),...r.clarity.map(c=>renderCheck(c.label,c.pass,c.detail)));
  $('match-count').textContent=r.keywords.length?`${r.hits} / ${r.keywords.length} 个词`:'未设目标词';
  $('keyword-source').textContent=r.keywords.length?`方向：${r.target.name}。来源：${r.target.source}。各词等权；“或”选项也会逐词列出，请按实际 JD 取舍。`:r.target.unrecognizedJD?'JD 未命中内置词表，请在左侧补充该岗位的重要关键词。':'尚未指定有效岗位关键词。本次报告不计算岗位匹配分。';
  const groups=[];
  for(const hit of [true,false]){
    const terms=r.keywords.filter(k=>k.hit===hit);if(!terms.length)continue;
    const group=node('div','keyword-group');group.append(node('h4','',hit?'已在简历中检出':'尚未检出，按实际能力核对'));const chips=node('div','chips');chips.append(...terms.map(k=>node('span','term '+(hit?'hit':'miss'),(hit?'✓ ':'')+k.term)));group.append(chips);groups.push(group);
  }
  $('keyword-results').replaceChildren(...groups);
  if(r.metrics.length){$('evidence').replaceChildren(node('h4','evidence-heading',`已识别 ${r.metricCount} 条量化表述，展示其中 ${r.metrics.length} 条`),...r.metrics.map(text=>node('p','evidence-item',text)));}
  else $('evidence').replaceChildren(node('p','empty-detail','暂未识别到“具体行动 + 数量或效果”的表述。尝试补充实际交付数量、耗时变化或用户反馈；没有可靠数据时，写清交付物与验证方式。'));
  const examples=r.rewrites.length?r.rewrites:[{source:'填写你实际完成的一项任务。',template:'为[具体场景或用户]，使用[实际方法]完成[交付物]；通过[真实数据或可核验反馈]说明结果。'}];
  $('rewrite-examples').replaceChildren(...examples.map((example,i)=>{const block=node('div','rewrite');block.append(node('h4','',`表达模板 ${i+1}`),node('span','rewrite-label','原文 / 待补充经历'),node('blockquote','source-quote',example.source),node('span','rewrite-label','按真实经历填空'),node('p','',example.template),node('small','','方括号需要你填写真实信息。这是表达模板，不是已经核实的改写。'));return block;}));
  $('report').hidden=false;$('empty-report').hidden=true;$('report-state').textContent='分析完成';
}
function runAnalysis(){
  if(state.importing)return;showError();
  try{const report=analyze({text:$('resume-text').value,...getTargetInput(),fileLabel:state.source,pages:state.pages});state.report=report;renderReport(report);if(window.innerWidth<=820)$('report-title').scrollIntoView({behavior:'smooth',block:'start'});}
  catch(error){resetReport('补充或检查输入内容后，重新开始分析。');showError(error.message);$('resume-text').focus();}
}
function loadSample(auto=false){
  ++state.sequence;state.importing=false;$('analyze').disabled=false;state.source='演示简历（虚构信息）';state.pages=null;
  $('resume-text').value=SAMPLE;$('role').value='frontend';$('job-description').value='熟悉 JavaScript、TypeScript、HTML、CSS，掌握 Vue 或 React，了解响应式、性能优化、Git 与 HTTP。';$('custom-keywords').value='';
  $('upload-title').textContent='点击选择，或将文件拖到这里';$('file-status').textContent='当前是虚构演示简历，示例数字仅用于演示分析功能。';$('resume-file').value='';updateCount();updateTarget();resetReport('示例已放入，点击「开始分析」查看结果。');if(auto)runAnalysis();
}
function clearAll(){++state.sequence;state.importing=false;state.source='粘贴的文本';state.pages=null;$('analyze').disabled=false;for(const id of ['resume-text','job-description','custom-keywords','resume-file'])$(id).value='';$('role').value='general';$('upload-title').textContent='点击选择，或将文件拖到这里';$('file-status').textContent='内容已清空。支持文字版 PDF；扫描件请先转为可复制文字。';updateCount();updateTarget();resetReport('放入简历后，点击「开始分析」。你会得到具体问题、原文依据与修改方向。');}

$('resume-text').addEventListener('input',()=>{
  if(state.importing){++state.sequence;state.importing=false;$('analyze').disabled=false;$('file-status').textContent='文件导入已取消，保留当前编辑的文字。';}
  if(state.source!=='粘贴的文本'&&!state.source.endsWith('（文本已编辑）'))state.source+='（文本已编辑）';state.pages=null;updateCount();resetReport();
});
for(const id of ['role','job-description','custom-keywords'])$(id).addEventListener(id==='role'?'change':'input',()=>{updateTarget();resetReport();});
$('resume-file').addEventListener('change',e=>importFile(e.target.files[0]));
const zone=$('dropzone');for(const event of ['dragenter','dragover'])zone.addEventListener(event,e=>{e.preventDefault();zone.classList.add('dragging');});
for(const event of ['dragleave','drop'])zone.addEventListener(event,e=>{e.preventDefault();zone.classList.remove('dragging');if(event==='drop'){if(e.dataTransfer.files.length>1)showError('请每次导入一份简历。');else importFile(e.dataTransfer.files[0]);}});
// Prevent dropping files outside the dropzone from navigating away and losing the current work.
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
$('sample').addEventListener('click',()=>loadSample());$('sample-empty').addEventListener('click',()=>loadSample(true));$('clear').addEventListener('click',clearAll);$('analyze').addEventListener('click',runAnalysis);
$('download').addEventListener('click',()=>{if(!state.report)return;const blob=new Blob(['\ufeff'+reportText(state.report)],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const link=node('a');link.href=url;link.download='简历分析报告.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);});
$('print').addEventListener('click',()=>{if(state.report)window.print();});
initializeTheme();updateCount();updateTarget();
