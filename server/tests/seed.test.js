const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// 数据完整性：种子数据必须 67 条、状态分布 50 锁定 + 17 流转、HW/SW 与 FO 齐全
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'seed-data.json'), 'utf-8'));

test('种子数据共 67 个模块', () => {
  assert.equal(rows.length, 67);
});

test('状态分布：50 已锁定 + 17 流转中', () => {
  const accepted = rows.filter((r) => r.status === 'accepted').length;
  const inFlow = rows.length - accepted;
  assert.equal(accepted, 50);
  assert.equal(inFlow, 17);
});

test('HW/SW 分类齐全且只含 HW/SW', () => {
  for (const r of rows) assert.ok(['HW', 'SW'].includes(r.hwsw), `异常分类: ${r.module_name} -> ${r.hwsw}`);
  const hw = rows.filter((r) => r.hwsw === 'HW').length;
  assert.equal(hw, 14);
});

test('每个模块都有 FO 名字与邮箱', () => {
  for (const r of rows) {
    assert.ok(r.fo_name, `缺少 FO: ${r.module_name}`);
    assert.ok(r.fo_email, `缺少 FO 邮箱: ${r.module_name}`);
  }
});

test('流转中演示案例含红/黄逾期场景（offset >= 7 与 4~6）', () => {
  const RED = ['00_CAA_Law_Regulation_Standard', '00_CAA_PPC_Module_Requirements'];
  const YELLOW = ['02_CAA_ASMH', '01_CAA_IDI_CuFu_UI'];
  for (const name of RED) assert.ok(rows.find((r) => r.module_name === name && r.status === 'transmitted'), name);
  for (const name of YELLOW) assert.ok(rows.find((r) => r.module_name === name && r.status === 'transmitted'), name);
});
