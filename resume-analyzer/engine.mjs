/** Pure, deterministic text checks. No network, persistence or personal-attribute inference. */
export const VERSION = '1.0';
export const LIMIT = 50000;
export const TERMS = [
  ['JavaScript','js'],['TypeScript','ts'],['HTML','html5'],['CSS','css3'],['Vue','vue.js','vuejs'],['React','react.js','reactjs'],['Angular'],['Node.js','nodejs','node.js'],['Vite'],['Webpack'],['Git'],['HTTP','https'],['REST API','restful','rest api'],['小程序'],['响应式'],['性能优化'],['自动化测试','单元测试','unit test'],
  ['Java'],['Spring Boot','springboot'],['Spring'],['Python'],['C++','cpp'],['C#','csharp'],['Go','golang'],['SQL'],['MySQL'],['PostgreSQL','postgres'],['Redis'],['MongoDB'],['Linux'],['Docker'],['Kubernetes','k8s'],['微服务'],['接口设计'],['数据库'],['网络安全'],
  ['机器学习','machine learning'],['深度学习','deep learning'],['大模型','llm','large language model'],['RAG','检索增强生成'],['智能体','agent','agents'],['提示词','prompt','prompting'],['PyTorch'],['TensorFlow'],['LangChain'],['模型部署'],['数据处理'],['模型评估'],['强化学习','reinforcement learning'],['计算机视觉','computer vision'],['自然语言处理','nlp'],
  ['Excel'],['Power BI','powerbi'],['Tableau'],['Pandas'],['NumPy'],['统计分析'],['数据分析'],['数据可视化'],['数据清洗'],['A/B 测试','a/b testing','a/b测试','ab测试','ab test'],['指标体系'],['用户研究'],['需求分析'],['产品设计'],['原型设计'],['Axure'],['Figma'],['项目管理'],['用户体验'],['竞品分析'],['需求文档','prd'],['数据驱动'],['跨部门协作'],
  ['内容策划'],['新媒体'],['活动策划'],['社群运营'],['用户运营'],['增长'],['转化率'],['留存'],['文案'],['视频剪辑'],['短视频'],['SEO'],['品牌'],['市场调研'],['沟通能力'],['团队协作'],['英语'],['算法'],['测试'],['前端'],['后端'],['电商'],['物流'],['供应链'],['跨境'],['运营'],['设计'],['开发']
];
export const ROLES = {
  general:{name:'未指定岗位',terms:[]},
  frontend:{name:'前端开发',terms:['JavaScript','TypeScript','HTML','CSS','Vue','React','Git','HTTP','响应式','性能优化']},
  backend:{name:'后端开发',terms:['Java','Spring Boot','Python','SQL','MySQL','Redis','Linux','Docker','接口设计','Git']},
  ai:{name:'AI 应用开发',terms:['Python','大模型','RAG','智能体','提示词','PyTorch','数据处理','模型评估','模型部署','Git']},
  data:{name:'数据分析',terms:['SQL','Python','Excel','Pandas','统计分析','数据可视化','数据清洗','指标体系','A/B 测试','数据分析']},
  product:{name:'产品经理 / 产品助理',terms:['需求分析','用户研究','原型设计','需求文档','竞品分析','数据分析','项目管理','用户体验','跨部门协作','产品设计']},
  operations:{name:'运营 / 新媒体',terms:['内容策划','活动策划','用户运营','社群运营','数据分析','转化率','留存','文案','短视频','新媒体']}
};
export const SAMPLE = `陈同学 | 求职方向：前端开发实习生
邮箱：chen.sample@example.com

教育背景
示例大学 · 软件工程 · 本科
2023.09 — 2027.06
主修课程：数据结构、数据库、计算机网络、软件工程。

项目经历
校园活动管理平台 | 前端开发 | 2025.03 — 2025.06
使用 Vue 3、TypeScript 和 Vite 开发活动报名页面，负责表单校验、分页和状态管理。
通过图片压缩与按需加载，将首屏加载时间从 3.2 秒缩短至 1.8 秒。
设计通用表单组件，将重复页面的开发时间降低 30%。
与 3 名团队成员协作，使用 Git 进行版本管理，完成 12 个页面交付。

实习经历
示例科技公司 | 前端开发实习生 | 2025.07 — 2025.09
负责公司后台管理系统的开发与维护。
参与产品需求讨论，协助处理用户反馈。

专业技能
JavaScript、TypeScript、HTML、CSS、Vue、Git、HTTP。
了解响应式布局、接口联调与基础单元测试。

自我评价
认真负责，学习能力强，具有良好的团队协作精神。`;

export function normalize(value) {
  return String(value ?? '').normalize('NFKC').replace(/\r\n?/g,'\n').replace(/\u0000/g,'').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/([\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/g,'$1').trim();
}
function regexEscape(value) { return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
export function containsTerm(text, term) {
  const normalized = normalize(text).toLowerCase();
  const variants = TERMS.find(group=>group[0].toLowerCase()===term.toLowerCase()) || [term];
  return variants.some(alias=>{
    const raw=normalize(alias).toLowerCase();
    let pattern=regexEscape(raw).replace(/\s+/g,'\\s*');
    if (/^[a-z0-9]/.test(raw)) pattern='(^|[^a-z0-9_])'+pattern;
    if (/[a-z0-9]$/.test(raw)) pattern+='(?=$|[^a-z0-9_+#])';
    if (/[+#]$/.test(raw)) pattern+='(?=$|[^a-z0-9_+#])';
    return new RegExp(pattern,'i').test(normalized);
  });
}
function canonical(value) {
  const v=normalize(value);
  return TERMS.find(group=>group.some(a=>a.toLowerCase()===v.toLowerCase()))?.[0] || v;
}
export function buildTarget({role='general',jd='',custom=''}={}) {
  const selected=ROLES[role]||ROLES.general;
  const hasJD=normalize(jd).length>0;
  // Explicit dictionary extraction avoids treating every ordinary word in a JD as a skill.
  const detected=hasJD ? TERMS.filter(group=>containsTerm(jd,group[0])).map(group=>group[0]) : selected.terms;
  const extra=custom.split(/[,，、;；\n]+/).map(canonical).filter(Boolean);
  const seen=new Set();
  const all=[...detected,...extra].filter(t=>{const key=t.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
  if(all.some(t=>t.length>40)) throw new Error('单个关键词请控制在 40 字符以内，用逗号分隔多个词。');
  if(all.length>50) throw new Error('目标关键词最多 50 个，请缩短职位描述或补充词列表。');
  return {role:role in ROLES?role:'general',name:selected.name,terms:all,source:hasJD?'职位描述识别词 + 补充词':selected.terms.length?'岗位预设词 + 补充词':'自定义补充词',hasJD,unrecognizedJD:hasJD&&detected.length===0};
}
const ACTION=/(?:设计|开发|实现|搭建|构建|优化|提升|提高|降低|减少|节省|缩短|完成|交付|部署|分析|清洗|策划|组织|运营|建立|解决|重构|修复|编写|支持|服务|处理|负责|推动|主导|独立|built|developed|designed|implemented|improved|reduced|increased|delivered|optimized|analysed|analyzed|led|created|deployed|managed)/i;
const GENERIC=[/认真负责/g,/吃苦耐劳/g,/学习能力强/g,/热爱学习/g,/性格开朗/g,/积极向上/g,/抗压能力强/g,/良好的团队(?:协作|合作)精神/g,/hard.?working/gi,/fast learner/gi];
function stripNonResults(text) {
  return text.replace(/\b(?:19|20)\d{2}(?:\s*[年./-]\s*\d{1,2})?(?:\s*[月./-]\s*\d{1,2})?\s*[日月]?/g,' ')
    .replace(/(?:\+?86[ -]?)?1[3-9]\d{9}/g,' ').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,' ');
}
function hasMetric(text) {
  const clean=stripNonResults(text);
  return ACTION.test(clean) && /\d+(?:\.\d+)?\s*(?:[%％]|(?:万|亿)?(?:个|项|位|名|人|次|条|台|家|套|款|页|篇|小时|分钟|秒|毫秒)|ms\b|seconds?\b|minutes?\b|users?\b|projects?\b|requests?\b|hours?\b|pages?\b|times?\b)/i.test(clean);
}
const clip=(text,size=145)=>text.length>size?text.slice(0,size)+'…':text;
function isActionStatement(text) {
  if(!ACTION.test(text)||text.length<16)return false;
  if(/(?:求职|应聘|意向)(?:方向|岗位|职位)?\s*[:：]/.test(text))return false;
  if(/[|｜]/.test(text)&&!/(?:使用|通过|负责|设计了|实现了|提升|降低|完成|交付|优化了|built|developed|implemented|delivered)/i.test(text))return false;
  return true;
}

export function analyze({text,role='general',jd='',custom='',fileLabel='粘贴的文本',pages=null}={}) {
  const content=normalize(text);
  const chars=content.replace(/\s/g,'').length;
  if(content.length>LIMIT) throw new Error('简历文本超过 50,000 字符，请保留与求职相关的正文后重试。');
  if(chars<80) throw new Error('可分析文字不足 80 字符。请补充简历正文；如果是扫描 PDF，请先 OCR 转为文字。');
  const target=buildTarget({role,jd,custom});
  const lines=content.split(/\n+/).map(t=>t.trim()).filter(Boolean);
  const statements=[...new Set(content.split(/\n+|[。；;]|[•●▪◆]/).map(t=>t.replace(/^[-*\s]+/,'').trim()).filter(t=>t.length>=10))];
  const actions=statements.filter(isActionStatement);
  const metrics=actions.filter(hasMetric);
  const generic=GENERIC.flatMap(regex=>[...content.matchAll(regex)].map(m=>m[0]));
  const recognized=TERMS.filter(group=>containsTerm(content,group[0])).map(group=>group[0]);
  const checks=[
    {key:'contact',label:'联系方式',points:6,pass:/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?86[ -]?)?1[3-9]\d{9})/i.test(content),rule:'检测邮箱或中国大陆手机号码；国际号码请自行核对。',suggestion:'补充可用的邮箱或手机号，方便招聘方联系。'},
    {key:'education',label:'教育背景',points:6,pass:/教育|学历|学士|本科|专科|硕士|博士|大专|大学|学院|education|\bbachelor|\bmaster|\buniversity|\bcollege/i.test(content),rule:'检测教育背景、学历或院校相关词。',suggestion:'加入院校、专业、学历与就读时间，让教育背景更清楚。'},
    {key:'experience',label:'项目 / 工作经历',points:8,pass:/项目(?:经历|经验|名称)?|实习|工作经历|工作经验|任职|社会实践|project|internship|work experience|employment/i.test(content),rule:'项目、实习或工作经历任一类别即可。',suggestion:'补充至少一段真实项目、实习或工作经历，说明目标、个人贡献与结果。'},
    {key:'skills',label:'专业技能',points:6,pass:/专业技能|技术栈|技能|技术能力|skills|technologies/i.test(content)||recognized.length>=3,rule:'检测技能栏目，或至少 3 个已知技术 / 能力词。',suggestion:'增加技能栏目，列出实际用过的工具、技术与方法，并用经历佐证。'},
    {key:'timeline',label:'经历时间',points:4,pass:/\b(?:19|20)\d{2}\s*[年./-]\s*\d{1,2}|\b(?:19|20)\d{2}\s*(?:至今|[—–-]\s*(?:19|20)\d{2})/i.test(content),rule:'检测年月或年份区间；请自行确认属于教育或经历时间。',suggestion:'给教育、项目或实习补充起止年月，例如 2025.03—2025.06。'}
  ];
  const clarity=[
    {label:'正文长度适中',pass:chars>=250&&chars<=5000,points:5,detail:`当前 ${chars} 字符；检查范围为 250–5,000 字符。`},
    {label:'有清晰分段',pass:lines.length>=6,points:5,detail:`提取到 ${lines.length} 个非空行，建议使用栏目和分条经历。`},
    {label:'避免过长句段',pass:statements.length>0&&statements.filter(t=>t.length>180).length<=Math.floor(statements.length*.2),points:5,detail:'超过 180 字符的句段不宜多于有效句段的 20%。'},
    {label:'少用泛化自评',pass:generic.length<=2,points:5,detail:`检测到 ${generic.length} 处预设泛化自评用语。`}
  ];
  const keywords=target.terms.map(term=>({term,hit:containsTerm(content,term)}));
  const hits=keywords.filter(k=>k.hit),missing=keywords.filter(k=>!k.hit);
  const structureScore=checks.reduce((n,c)=>n+(c.pass?c.points:0),0);
  const evidenceScore=Math.min(metrics.length,4)*4+Math.min(actions.length,3)*3;
  const clarityScore=clarity.reduce((n,c)=>n+(c.pass?c.points:0),0);
  const matchScore=keywords.length?Math.round(hits.length/keywords.length*25):null;
  const score=Math.round((structureScore+evidenceScore+clarityScore+(matchScore??0))/(matchScore===null?75:100)*100);
  const recommendations=[];
  for(const check of checks.filter(c=>!c.pass)) recommendations.push({priority:check.key==='contact'||check.key==='experience'?'high':'medium',title:`补充${check.label}`,body:check.suggestion,source:'当前文本未命中：'+check.rule});
  if(metrics.length<3) recommendations.push({priority:'high',title:metrics.length?'让更多经历带上可核验结果':'给经历补充真实的量化结果',body:`识别到 ${metrics.length} 条带行动与数量 / 效果的表述。优先选择 2–3 段经历，补充交付规模、效率变化或用户反馈；只填写能够解释来源的数字。`,source:clip(actions.find(t=>!hasMetric(t))||'当前未检出同时包含具体行动和结果数量的表述。')});
  if(actions.length<3) recommendations.push({priority:'medium',title:'写清楚个人完成的具体行动',body:'用“设计、实现、分析、组织”等动词说明自己做了什么，补上方法、工具与交付物，区分团队成果和个人贡献。',source:`当前检测到 ${actions.length} 条行动表述。`});
  if(missing.length) recommendations.push({priority:'medium',title:'核对目标岗位需要的能力',body:`未检出的词包括：${missing.slice(0,6).map(k=>k.term).join('、')}。核对是否真的掌握；已有相关经验时，用项目或实习说明使用场景。`,source:`已检出 ${hits.length} / ${keywords.length} 个目标词。文本匹配不等于岗位胜任力评估。`});
  if(target.unrecognizedJD) recommendations.push({priority:'medium',title:'手动补充 JD 中的重要关键词',body:'职位描述未命中内置词表。请把该职位重要的工具、行业知识或方法填入“补充岗位关键词”，再分析。',source:'不自动回退到岗位预设词，避免给出与这份 JD 无关的匹配分。'});
  if(!clarity[0].pass) recommendations.push({priority:'medium',title:chars<250?'补充与岗位有关的经历细节':'压缩重复或无关内容',body:chars<250?'当前文字较少。补充项目背景、自己的任务、使用的方法与结果，避免只列经历标题。':'当前正文较长。优先保留与目标岗位相关的经历，合并重复技能与泛化自评。',source:clarity[0].detail});
  if(!clarity[1].pass||!clarity[2].pass) recommendations.push({priority:'medium',title:'检查分段与文件提取顺序',body:'把教育、经历、技能分成栏目，每条经历尽量表达一个行动与结果。若从 PDF 导入，请先修正多栏混排或丢失的换行。',source:!clarity[1].pass?clarity[1].detail:clarity[2].detail});
  if(generic.length) recommendations.push({priority:'medium',title:'用具体事例支撑自我评价',body:'将泛化自评替换为具体行动或真实反馈。例如用一次协作交付的事实说明团队合作能力。',source:[...new Set(generic)].slice(0,4).join('、')});
  if(!recommendations.length) recommendations.push({priority:'info',title:'基础检查已通过，继续人工核对',body:'逐条确认时间、个人贡献与数字来源；结合实际 JD 调整经历顺序，并在原文件中检查排版和链接。',source:'当前规则未发现明显缺项，不代表简历已覆盖所有招聘要求。'});
  recommendations.sort((a,b)=>(a.priority==='high'?0:1)-(b.priority==='high'?0:1));
  const weak=actions.filter(t=>!hasMetric(t)&&t.length<=220&&!/@|1[3-9]\d{9}/.test(t)).slice(0,2);
  const rewrites=weak.map(source=>({source,template:'针对[具体业务或用户场景]，完成[你个人负责的交付物]，采用[实际技术或方法]解决[明确问题]；以[真实的交付数量、效率变化或反馈]说明结果。'}));
  return {version:VERSION,score,chars,lineCount:lines.length,fileLabel,pages,target,keywords,hits:hits.length,missing:missing.length,checks,clarity,metrics:metrics.slice(0,4).map(t=>clip(t,240)),actionCount:actions.length,metricCount:metrics.length,rewrites,recommendations:recommendations.slice(0,9),dimensions:[{key:'structure',label:'内容完整度',score:structureScore,max:30},{key:'evidence',label:'成果表达',score:evidenceScore,max:25},{key:'clarity',label:'表达清晰度',score:clarityScore,max:20},{key:'match',label:'岗位关键词',score:matchScore,max:25}],title:score>=85?'基础清楚，继续打磨细节':score>=65?'已有基础，还能更具体':'先补齐信息，再打磨表达',note:matchScore===null?'未设有效岗位关键词，按内容检查的 75 分等比例换算。':'优先处理缺项与经历表达，再对照岗位要求核对。'};
}

export function reportText(report) {
  const r=report;
  const lines=['简历研判 · 文本分析报告',`规则版本：${r.version}`,`来源：${r.fileLabel}`,`文本诊断分：${r.score} / 100`,r.note,'分数不代表录用概率，也不判断经历真实性。','',...r.dimensions.map(d=>`${d.label}：${d.score===null?'不计分':d.score+' / '+d.max}`),'','优先修改建议',...r.recommendations.flatMap((item,i)=>[`${i+1}. ${item.title}`,item.body,'依据：'+item.source,'']),'内容完整度',...r.checks.map(c=>`${c.pass?'[已检出]':'[待补充]'} ${c.label}：${c.rule}`),'','表达清晰度',...r.clarity.map(c=>`${c.pass?'[通过]':'[待检查]'} ${c.label}：${c.detail}`),'','岗位关键词',`来源：${r.target.source}；方向：${r.target.name}`,r.keywords.length?`命中 ${r.hits} / ${r.keywords.length} 个目标词`:'未设置有效目标关键词，未计算岗位分',...r.keywords.map(k=>`${k.hit?'[已检出]':'[未检出]'} ${k.term}`),'','原文中的量化表达',...(r.metrics.length?r.metrics:['未检出符合规则的量化表述。']),'','经历填空模板（仅填写真实信息）',...r.rewrites.flatMap(w=>['原文：'+w.source,'模板：'+w.template,'']),'使用边界','固定文本规则，非 AI 评审。不核验事实、不检查原文件的视觉排版。未检出不等于没有能力。','内容完整度30分；成果表达25分（最多4条量化成果×4 + 最多3条行动×3）；清晰度20分；关键词覆盖25分。无有效关键词时其余75分换算为100分。','报告由你保管；工具不会将简历上传或保存至云端。'];
  return lines.join('\n');
}
