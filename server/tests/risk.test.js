const test = require('node:test');
const assert = require('node:assert');
const { riskLevel, deadlineOf, canTransition, decorate } = require('../src/risk');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

test('transmitted 未打标：第 1~3 天绿色', () => {
  assert.equal(riskLevel({ status: 'transmitted', sent_at: daysAgo(1) }), 'green');
  assert.equal(riskLevel({ status: 'transmitted', sent_at: daysAgo(3) }), 'green');
});

test('transmitted 未打标：第 4~6 天黄色预警（提前 3 天）', () => {
  assert.equal(riskLevel({ status: 'transmitted', sent_at: daysAgo(4) }), 'yellow');
  assert.equal(riskLevel({ status: 'transmitted', sent_at: daysAgo(6) }), 'yellow');
});

test('transmitted 未打标：第 7 天起红色逾期', () => {
  assert.equal(riskLevel({ status: 'transmitted', sent_at: daysAgo(7) }), 'red');
  assert.equal(riskLevel({ status: 'transmitted', sent_at: daysAgo(12) }), 'red');
});

test('已打标 / 非计时状态不参与风险计算', () => {
  assert.equal(riskLevel({ status: 'transmitted', sent_at: daysAgo(30), labeled_at: daysAgo(20) }), 'none');
  assert.equal(riskLevel({ status: 'to_be_clarified', sent_at: daysAgo(30) }), 'none');
  assert.equal(riskLevel({ status: 'accepted', sent_at: daysAgo(30) }), 'none');
  assert.equal(riskLevel({ status: 'changed', sent_at: null }), 'none');
});

test('打标截止日 = 发送日 + 7 天', () => {
  assert.equal(deadlineOf('2026-09-01'), '2026-09-08');
  assert.equal(deadlineOf(null), null);
});

test('状态流转规则（依据 requirement exchange guideline）', () => {
  assert.ok(canTransition('transmitted', 'in_review'));
  assert.ok(canTransition('transmitted', 'changed')); // 变更后待重发
  assert.ok(canTransition('changed', 'transmitted')); // 重发重新计时
  assert.ok(canTransition('to_be_clarified', 'transmitted')); // 澄清后重新发送
  assert.ok(canTransition('rejection_tbc', 'cancelled'));
  assert.ok(!canTransition('accepted', 'transmitted')); // 终态不可流转
  assert.ok(!canTransition('transmitted', 'accepted')); // 必须经打标环节
});

test('decorate 输出 deadline 与风险', () => {
  const d = decorate({ status: 'transmitted', sent_at: daysAgo(5) });
  assert.equal(d.risk, 'yellow');
  assert.equal(d.days_elapsed, 5);
  assert.ok(d.deadline_at);
});
