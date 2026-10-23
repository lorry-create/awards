# 简历研判 / Resume Lab

免费、无后端的简历文本分析工具，部署路径为 `/awards/resume-analyzer/`。

- 支持文字版 PDF（最多 25 页）、DOCX、TXT、MD（单文件最多 10 MB，最多 50,000 字符）。不支持扫描件 OCR、旧版 DOC 和图片。
- 固定规则检查内容完整度、行动和量化表达、清晰度、岗位关键词。结果不代表录用概率，不判断经历真实性、不检查原文件视觉排版。
- 岗位预设词可选；提供 JD 时使用从 JD 识别的内置词与手动补充词。未识别有效关键词时不计岗位分，不自动回退预设。所有词等权，不能理解 JD 中的“或”“优先”“非必须”。建议按实际岗位调整补充词。
- 文件只在浏览器内解析；简历与职位描述只保存在当前页面内存，不上传、不写入本地存储。主题设置复用证书页的 `awards-theme`。报告由用户主动下载或打印。
- 所有动态报告文字通过 `textContent` 渲染；不执行输入中的 HTML。PDF 关闭动态求值，DOCX 设置压缩展开大小上限。
- 编辑任一输入会使旧报告失效，避免下载不对应当前输入的报告。清空会取消待完成的文件导入。

## 本地预览

从仓库根目录运行 `python -m http.server 8765 --bind 127.0.0.1`，访问 `http://127.0.0.1:8765/resume-analyzer/`。需要通过 HTTP(S) 使用，不能直接双击 HTML 打开。

## 验证

运行 `node --test tests/resume-engine.test.mjs`。解析器还需在浏览器中验证文字 PDF、DOCX、损坏文件、编辑后报告失效、下载与窄屏排版。

## 规则

纯分析逻辑在 `engine.mjs`；UI 与文件解析在 `app.mjs`。计算方式与版本同时显示在页面的“评分依据与使用边界”中。

## 第三方组件

- [PDF.js / pdfjs-dist](https://github.com/mozilla/pdf.js) 5.6.205，Apache-2.0；许可证保留在 `vendor/pdfjs/LICENSE`。核心模块与 worker 使用官方 min 版本（保留稳定文件名），并包含 CMaps 和标准字体。
- [JSZip](https://github.com/Stuk/jszip) 3.10.1，MIT / GPLv3 双许可证；本项目采用 MIT，许可证保留在 `vendor/jszip/LICENSE.markdown`。

依赖从本机随工作区提供的运行时复制，并随网站部署，不依赖第三方 CDN。更新时一起更新版本、worker、资源和许可证。
