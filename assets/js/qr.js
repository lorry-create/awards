/*
 * qr.js — 二维码生成器（浏览器端，无外部依赖，可离线工作）
 *
 * 为什么自己实现：站点是纯静态托管，且 CSP 限制为 'self'。如果依赖 CDN 上的
 * 二维码库，访客网络访问不到 CDN 时二维码就画不出来。自带实现可以离线工作。
 *
 * 该实现按 ISO/IEC 18004 编写，算法与常量表参照 Project Nayuki 的
 * QR Code generator（MIT License, https://www.nayuki.io/page/qr-code-generator-library）
 * 校对，以避开自研实现里容易出现的、肉眼看不出来的位序错误。
 *
 * 支持范围：字节模式（UTF-8），版本 1-10，纠错等级 L/M/Q/H，
 * 自动择优掩码（按标准四项罚分规则）。
 */
(function (global) {
  'use strict';

  /* ---------- GF(256) 伽罗华域 ---------- */
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function initGF() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;   // 本原多项式 x^8 + x^4 + x^3 + x^2 + 1
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  // 生成多项式 (x - a^0)(x - a^1)...(x - a^(degree-1))，返回去掉首项 1 后的系数
  function rsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var d = 0; d < degree; d++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }

  // 计算 data 的纠错码字
  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ result.shift();
      result.push(0);
      for (var j = 0; j < divisor.length; j++) result[j] ^= gfMul(divisor[j], factor);
    }
    return result;
  }

  /* ---------- 标准常量表（索引 0 为占位）---------- */
  // 每块纠错码字数
  var ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28]
  };
  // 纠错块数量
  var NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8]
  };
  // 格式信息的标准取值（ISO Table C.1），索引为掩码号
  var FORMAT_TABLE = {
    L: [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976],
    M: [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0],
    Q: [0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed],
    H: [0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b]
  };
  var LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  /* ---------- 容量计算 ---------- */
  function numAlign(ver) { return ver === 1 ? 0 : Math.floor(ver / 7) + 2; }

  // 对齐图案的坐标列表
  function alignPositions(ver, size) {
    if (ver === 1) return [];
    var n = numAlign(ver);
    var step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    var result = [6];
    for (var pos = size - 7; result.length < n; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  // 可放数据的模块总数（含末尾不足以凑成一个码字的余数位）
  function numRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var n = numAlign(ver);
      result -= (25 * n - 10) * n - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  // 数据码字数（不含纠错码字）
  function numDataCodewords(ver, level) {
    return Math.floor(numRawDataModules(ver) / 8) -
      ECC_PER_BLOCK[level][ver] * NUM_BLOCKS[level][ver];
  }

  // 该版本可容纳的字节模式数据位数
  function dataCapacityBits(ver, level) {
    return numDataCodewords(ver, level) * 8;
  }

  /* ---------- 文本 -> 字节 -> 位流 ---------- */
  function toUtf8Bytes(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        // 代理对合成一个码点，UTF-8 占 4 字节
        var cp = 0x10000 + ((code - 0xd800) << 10) + (text.charCodeAt(i + 1) - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f),
                 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        i++;
      } else {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return out;
  }

  /* ---------- 位缓冲 ---------- */
  function BitBuffer() { this.bits = []; }
  BitBuffer.prototype.put = function (value, length) {
    // 按高位在前依次压入，与标准的位序一致
    for (var i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  };
  BitBuffer.prototype.length = function () { return this.bits.length; };

  /* ---------- 编码：生成数据码字序列 ---------- */
  function buildCodewords(text, level) {
    var bytes = toUtf8Bytes(text);
    var version = -1;

    for (var v = 1; v <= 10; v++) {
      var ccBits = v <= 9 ? 8 : 16;
      var need = 4 + ccBits + bytes.length * 8;
      if (need <= dataCapacityBits(v, level)) { version = v; break; }
    }
    if (version < 0) {
      throw new Error('内容太长，超出本实现支持的范围（版本 1-10，最多约 200 字节）');
    }

    var capacityBits = dataCapacityBits(version, level);
    var bb = new BitBuffer();
    bb.put(0x4, 4);                                   // 字节模式指示符
    bb.put(bytes.length, version <= 9 ? 8 : 16);       // 字符计数
    for (var i = 0; i < bytes.length; i++) bb.put(bytes[i], 8);

    bb.put(0, Math.min(4, capacityBits - bb.length())); // 结束符
    bb.put(0, (8 - bb.length() % 8) % 8);               // 补齐到字节边界

    // 交替填充 0xEC / 0x11 直到填满容量
    //
    // 注意：这里以前写成 for (pad = 0xEC; bb.length() < cap; pad ^= 0xEC ^ 0x11)，
    // 那是"先判断后执行"的 while 语义，再加上 0xEC ^ 0x11 反复异或会让 pad
    // 经过 0xEC -> 0x11 -> 0xFD -> 0x00 后恒为 0，条件为假，循环一次都不执行，
    // 结果位流为空、二维码里一个数据都没有。正确写法是无条件循环 + 交替取值。
    for (var padIndex = 0; bb.length() < capacityBits; padIndex++) {
      bb.put((padIndex % 2 === 0) ? 0xec : 0x11, 8);
    }

    // 位流打包成码字
    //
    // 注意 bb.length 是方法，必须调用才拿到位数。这里以前漏了括号，
    // 于是与数字比较时把函数对象当成 NaN，条件恒为假，打包循环一次都不执行，
    // 最终码字数组为空、二维码没有数据。
    var bitCount = bb.length();
    var codewords = [];
    for (var k = 0; k * 8 < bitCount; k++) codewords.push(0);
    for (var b = 0; b < bitCount; b++) codewords[b >>> 3] |= bb.bits[b] << (7 - (b & 7));

    return { version: version, codewords: codewords };
  }

  /* ---------- 纠错 + 分块交错 ---------- */
  function addEccAndInterleave(version, level, data) {
    var numBlocks = NUM_BLOCKS[level][version];
    var blockEccLen = ECC_PER_BLOCK[level][version];
    var rawCodewords = Math.floor(numRawDataModules(version) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);

    var divisor = rsDivisor(blockEccLen);
    var blocks = [];
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, divisor);
      if (i < numShortBlocks) dat.push(0);   // 短块补一个占位字节，便于统一交错
      blocks.push(dat.concat(ecc));
    }

    // 逐列交错
    var result = [];
    for (var c = 0; c < blocks[0].length; c++) {
      for (var j = 0; j < blocks.length; j++) {
        if (c !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][c]);
      }
    }
    return result;
  }

  /* ---------- 矩阵构造 ---------- */
  function buildMatrix(version) {
    var size = version * 4 + 17;
    var m = [];
    for (var r = 0; r < size; r++) m.push(new Array(size).fill(false));
    return m;
  }

  function drawFinder(m, cx, cy) {
    var size = m.length;
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) m[y][x] = (dist !== 2 && dist !== 4);
      }
    }
  }

  function drawAlignment(m, cx, cy) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        m[cy + dy][cx + dx] = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      }
    }
  }

  // 判断某个格子是否属于功能图案区（功能模块不能被数据覆盖）
  //
  // 这是**唯一**的功能模块定义，绘图与填数据两处都必须用它，避免两套规则
  // 各自漂移。曾经就因为绘图与填数据各写了一份，边界差了一列，导致数据
  // 整体错位一格、二维码扫不出来。
  //
  // 区域说明（size = 4*version+17）：
  //   定位图案含分隔符：三个 9x9 区域。中心在 (3,3)、(size-4,3)、(3,size-4)，
  //     故覆盖下标 size-8 .. size-1（即 9 格）。
  //   格式信息：第 8 行与第 8 列靠边的部分，加固定暗模块 (8, size-8)。
  //   版本信息：版本 >= 7 时，(0..5, size-11..size-1) 与 (size-11..size-1, 0..5)。
  function isFunctionModule(version, y, x) {
    var size = version * 4 + 17;

    // 定位图案 + 分隔符（9x9）
    if (x <= 8 && y <= 8) return true;
    if (x >= size - 8 && y <= 8) return true;
    if (x <= 8 && y >= size - 8) return true;

    // 格式信息（第一份、第二份）与固定暗模块
    if (y === 8 && x <= 8) return true;
    if (y === 8 && x >= size - 8) return true;
    if (x === 8 && y <= 8) return true;
    if (x === 8 && y >= size - 8) return true;

    // 时钟线
    if (x === 6 || y === 6) return true;

    // 对齐图案（三个角不画）
    var pos = alignPositions(version, size);
    var n = pos.length;
    for (var a = 0; a < n; a++) {
      for (var b = 0; b < n; b++) {
        if ((a === 0 && b === 0) || (a === 0 && b === n - 1) || (a === n - 1 && b === 0)) continue;
        if (Math.abs(x - pos[b]) <= 2 && Math.abs(y - pos[a]) <= 2) return true;
      }
    }

    // 版本信息
    if (version >= 7) {
      if (y <= 5 && x >= size - 11) return true;
      if (y >= size - 11 && x <= 5) return true;
    }

    return false;
  }

  // 画出所有功能图案的颜色，并返回功能模块掩码
  function drawFunctionPatterns(m, version) {
    var size = m.length;
    var fn = [];
    for (var r = 0; r < size; r++) {
      var rowFn = new Array(size).fill(false);
      for (var c = 0; c < size; c++) rowFn[c] = isFunctionModule(version, r, c);
      fn.push(rowFn);
    }

    // 三个定位图案（含分隔符）
    drawFinder(m, 3, 3);
    drawFinder(m, size - 4, 3);
    drawFinder(m, 3, size - 4);

    // 时钟线
    for (var i = 0; i < size; i++) {
      m[6][i] = i % 2 === 0;
      m[i][6] = i % 2 === 0;
    }

    // 重新画定位图案，覆盖被时钟线写到的部分
    drawFinder(m, 3, 3);
    drawFinder(m, size - 4, 3);
    drawFinder(m, 3, size - 4);

    // 对齐图案
    var pos = alignPositions(version, size);
    var n = pos.length;
    for (var a = 0; a < n; a++) {
      for (var b = 0; b < n; b++) {
        if ((a === 0 && b === 0) || (a === 0 && b === n - 1) || (a === n - 1 && b === 0)) continue;
        drawAlignment(m, pos[b], pos[a]);
      }
    }

    // 格式信息区先填浅色，稍后由 drawFormatBits 写入真值
    for (var f = 0; f <= 5; f++) m[f][8] = false;
    m[7][8] = false;
    m[8][8] = false;
    m[8][7] = false;
    for (var g = 9; g < 15; g++) m[8][14 - g] = false;
    for (var h = 0; h < 8; h++) m[8][size - 1 - h] = false;
    for (var k = 8; k < 15; k++) m[size - 15 + k][8] = false;
    m[size - 8][8] = true;   // 固定暗模块

    // 版本信息
    drawVersionBits(m, version);

    return fn;
  }

  function drawVersionBits(m, version) {
    if (version < 7) return;
    var rem = version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    var bits = (version << 12) | rem;
    var size = m.length;
    for (var j = 0; j < 18; j++) {
      var color = ((bits >>> j) & 1) !== 0;
      var a = size - 11 + (j % 3);
      var b = Math.floor(j / 3);
      m[b][a] = color;
      m[a][b] = color;
    }
  }

  // 写入格式信息（两份）
  function drawFormatBits(m, level, mask, fn) {
    var size = m.length;
    var bits = FORMAT_TABLE[level][mask];
    function set(x, y, dark) { m[y][x] = dark; if (fn) fn[y][x] = true; }

    for (var i = 0; i <= 5; i++) set(8, i, ((bits >>> i) & 1) !== 0);
    set(8, 7, ((bits >>> 6) & 1) !== 0);
    set(8, 8, ((bits >>> 7) & 1) !== 0);
    set(7, 8, ((bits >>> 8) & 1) !== 0);
    for (var j = 9; j < 15; j++) set(14 - j, 8, ((bits >>> j) & 1) !== 0);

    for (var k = 0; k < 8; k++) set(size - 1 - k, 8, ((bits >>> k) & 1) !== 0);
    for (var l = 8; l < 15; l++) set(8, size - 15 + l, ((bits >>> l) & 1) !== 0);
    set(8, size - 8, true);
  }

  // 按标准之字形顺序把码字填入非功能模块
  function drawCodewords(m, version, fn, data) {
    var size = m.length;
    var totalBits = data.length * 8;
    var i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && i < totalBits) {
            m[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
          // 余数位保持浅色（构造时已初始化为 false）
        }
      }
    }
  }

  function maskCondition(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    }
    return false;
  }

  function applyMask(m, fn, mask) {
    var size = m.length;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (!fn[y][x] && maskCondition(mask, x, y)) m[y][x] = !m[y][x];
      }
    }
  }

  /* ---------- 掩码罚分（标准四项规则）---------- */
  function penalty(m) {
    var size = m.length;
    var result = 0;
    var x, y, run, dark = 0;

    // 规则 1：同色连续 >= 5
    for (y = 0; y < size; y++) {
      run = 1;
      for (x = 1; x < size; x++) {
        if (m[y][x] === m[y][x - 1]) {
          run++;
        } else {
          if (run >= 5) result += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) result += 3 + (run - 5);
    }
    for (x = 0; x < size; x++) {
      run = 1;
      for (y = 1; y < size; y++) {
        if (m[y][x] === m[y - 1][x]) {
          run++;
        } else {
          if (run >= 5) result += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) result += 3 + (run - 5);
    }

    // 规则 2：2x2 同色块
    for (y = 0; y < size - 1; y++) {
      for (x = 0; x < size - 1; x++) {
        var c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += 3;
      }
    }

    // 规则 3：形如 1:1:3:1:1 的类定位图案（两侧带 4 个浅色）
    var patA = [true, false, true, true, true, false, true, false, false, false, false];
    var patB = [false, false, false, false, true, false, true, true, true, false, true];
    function matches(arr, p, start) {
      for (var i = 0; i < p.length; i++) if (arr[start + i] !== p[i]) return false;
      return true;
    }
    for (y = 0; y < size; y++) {
      for (x = 0; x + 11 <= size; x++) {
        if (matches(m[y], patA, x) || matches(m[y], patB, x)) result += 40;
      }
    }
    var col = [];
    for (x = 0; x < size; x++) {
      col.length = 0;
      for (y = 0; y < size; y++) col.push(m[y][x]);
      for (y = 0; y + 11 <= size; y++) {
        if (matches(col, patA, y) || matches(col, patB, y)) result += 40;
      }
    }

    // 规则 4：黑白比例偏离 50%
    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) if (m[y][x]) dark++;
    }
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * 10;

    return result;
  }

  /* ---------- 对外接口 ---------- */
  /**
   * 生成二维码矩阵。
   * @param {string} text 要编码的内容
   * @param {string} [level] 纠错等级 L/M/Q/H，默认 M
   * @returns {{size:number, modules:boolean[][], version:number, mask:number, level:string}}
   */
  function encode(text, level) {
    level = level || 'M';
    if (!ECC_PER_BLOCK[level]) throw new Error('纠错等级必须是 L/M/Q/H');

    var built = buildCodewords(text, level);
    var allCodewords = addEccAndInterleave(built.version, level, built.codewords);

    var matrix = buildMatrix(built.version);
    var fn = drawFunctionPatterns(matrix, built.version);
    drawCodewords(matrix, built.version, fn, allCodewords);
    drawVersionBits(matrix, built.version);

    // 逐个掩码试算，取罚分最低者
    var bestMask = 0;
    var bestPenalty = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      applyMask(matrix, fn, mask);
      drawFormatBits(matrix, level, mask);
      var p = penalty(matrix);
      if (p < bestPenalty) { bestPenalty = p; bestMask = mask; }
      applyMask(matrix, fn, mask);   // 异或两次即还原
    }

    applyMask(matrix, fn, bestMask);
    drawFormatBits(matrix, level, bestMask);

    // 统一成 0/1 数值，方便渲染
    var modules = matrix.map(function (row) {
      return row.map(function (v) { return v ? 1 : 0; });
    });

    return {
      size: built.version * 4 + 17,
      modules: modules,
      version: built.version,
      mask: bestMask,
      level: level
    };
  }

  /**
   * 把二维码画到 canvas 上。
   * @param {HTMLCanvasElement} canvas
   * @param {string} text
   * @param {{level?:string, quiet?:number, scale?:number, dark?:string, light?:string}} [opts]
   */
  function render(canvas, text, opts) {
    opts = opts || {};
    var level = opts.level || 'M';
    var quiet = opts.quiet == null ? 4 : opts.quiet;   // 静区：标准要求至少 4 个模块
    var dark = opts.dark || '#000000';
    var light = opts.light || '#ffffff';

    var result = encode(text, level);
    var count = result.size + quiet * 2;
    var scale = opts.scale || Math.max(2, Math.floor(480 / count));
    var px = count * scale;

    canvas.width = px;
    canvas.height = px;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = dark;
    for (var r = 0; r < result.size; r++) {
      for (var c = 0; c < result.size; c++) {
        if (result.modules[r][c]) {
          ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
        }
      }
    }
    return result;
  }

  global.QR = { encode: encode, render: render };
})(window);
