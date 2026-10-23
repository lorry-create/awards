import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyze,buildTarget,containsTerm,reportText,SAMPLE} from '../resume-analyzer/engine.mjs';

test('example has reproducible evidence and dimensions add up',()=>{
  const r=analyze({text:SAMPLE,role:'frontend'});
  assert.equal(r.checks.every(c=>c.pass),true);
  assert.equal(r.metricCount,3);
  assert.equal(r.dimensions[1].score,21);
  assert.equal(r.score,r.dimensions.reduce((n,d)=>n+d.score,0));
  assert.ok(r.recommendations.some(x=>x.title.includes('核对目标岗位')));
  assert.ok(r.rewrites.every(x=>!x.source.includes('求职方向')&&!x.source.includes(' | ')));
  assert.match(reportText(r),/不代表录用概率/);
});
test('Java and short aliases do not match longer unrelated words',()=>{
  assert.equal(containsTerm('JavaScript TypeScript React Native','Java'),false);
  assert.equal(containsTerm('Java Spring Boot','Java'),true);
  assert.equal(containsTerm('objects mysql excelled agents','SQL'),false);
  assert.equal(containsTerm('JS / NodeJS / Vue.js','JavaScript'),true);
  assert.equal(containsTerm('C++ C#','C++'),true);
  assert.equal(containsTerm('C++ C#','C#'),true);
  assert.equal(containsTerm('governance ongoing','Go'),false);
  assert.equal(containsTerm('JavaScript','js'),false);
});
test('no target rescales 75 points and shows no matching score',()=>{
  const r=analyze({text:SAMPLE});
  assert.equal(r.dimensions[3].score,null);
  assert.equal(r.keywords.length,0);
  assert.equal(r.score,Math.round(r.dimensions.slice(0,3).reduce((n,d)=>n+d.score,0)/75*100));
});
test('JD replaces presets and unknown JD does not silently fall back',()=>{
  const known=buildTarget({role:'frontend',jd:'掌握 Python 和 Pandas',custom:'Python、跨境物流'});
  assert.deepEqual(known.terms,['Python','Pandas','跨境物流']);
  const unknown=buildTarget({role:'frontend',jd:'负责陶瓷釉料配制'});
  assert.equal(unknown.unrecognizedJD,true);assert.deepEqual(unknown.terms,[]);
  const r=analyze({text:SAMPLE,role:'frontend',jd:'负责陶瓷釉料配制'});
  assert.equal(r.dimensions[3].score,null);
  assert.ok(r.recommendations.some(x=>x.title.includes('手动补充')));
});
test('dates and contact numbers are not achievement metrics',()=>{
  const text='教育背景 本科 计算机专业\n2025年9月—2026年6月\n项目经历\n负责2025年3月的项目开发，完成项目设计和实现。\n专业技能 Java Python SQL\n邮箱 test@example.com 手机 13800138000\n'+('进行系统功能开发与需求分析。'.repeat(5));
  assert.equal(analyze({text}).metricCount,0);
  const metric=analyze({text:text+'\n通过缓存优化，将接口响应时间从 2 秒缩短至 300 ms。'});
  assert.equal(metric.metricCount,1);
});
test('duplicate outcome lines cannot inflate evidence score',()=>{
  const text=SAMPLE+'\n'+Array(8).fill('通过图片压缩与按需加载，将首屏加载时间从 3.2 秒缩短至 1.8 秒。').join('\n');
  assert.equal(analyze({text}).metricCount,analyze({text:SAMPLE}).metricCount);
});
test('job titles and dated role headings are not concrete actions',()=>{
  const text='求职方向：软件开发实习生\n校园管理系统 | 前端开发实习生 | 2025.03—2025.06\n教育背景 示例大学 计算机专业 本科\n专业技能 Java Python SQL\n邮箱 test@example.com\n'+('课程包括软件工程、数据结构与计算机网络。'.repeat(5));
  assert.equal(analyze({text}).actionCount,0);
});
test('invalid or excessive input has no score',()=>{
  assert.throws(()=>analyze({text:'只有一个标题'}),/不足 80/);
  assert.throws(()=>analyze({text:'字'.repeat(50001)}),/50,000/);
  assert.throws(()=>buildTarget({custom:'词'.repeat(41)}),/40 字符/);
  assert.throws(()=>buildTarget({custom:Array.from({length:51},(_,i)=>'关键词'+i).join(',')}),/50 个/);
});
test('contact is checked by availability and not a name or demographic attribute',()=>{
  const noContact=SAMPLE.replace('chen.sample@example.com','未填写');
  assert.equal(analyze({text:noContact}).checks.find(c=>c.key==='contact').pass,false);
  const withPersonalAttributes=SAMPLE+'\n性别：未填写\n年龄：未填写\n民族：未填写';
  const a=analyze({text:SAMPLE}),b=analyze({text:withPersonalAttributes});
  assert.equal(a.score,b.score);
});
