const test = require('node:test');
const assert = require('node:assert');
const { createAttemptLimiter } = require('../src/ratelimit');

test('限流：窗口内达到上限后阻塞，并给出剩余秒数', () => {
  let t = 1000;
  const limiter = createAttemptLimiter({ maxAttempts: 3, windowMs: 60_000, now: () => t });

  assert.equal(limiter.blocked('a').blocked, false);
  assert.equal(limiter.fail('a'), 2);
  assert.equal(limiter.fail('a'), 1);
  assert.equal(limiter.fail('a'), 0, '第 3 次失败后额度用尽');

  const gate = limiter.blocked('a');
  assert.equal(gate.blocked, true);
  assert.ok(gate.retryAfterSec > 0 && gate.retryAfterSec <= 60);
});

test('限流：不同 key 互不影响', () => {
  let t = 0;
  const limiter = createAttemptLimiter({ maxAttempts: 2, windowMs: 60_000, now: () => t });
  limiter.fail('1.1.1.1|alice');
  limiter.fail('1.1.1.1|alice');
  limiter.fail('1.1.1.1|alice');
  assert.equal(limiter.blocked('1.1.1.1|alice').blocked, true);
  assert.equal(limiter.blocked('2.2.2.2|alice').blocked, false);
  assert.equal(limiter.blocked('1.1.1.1|bob').blocked, false);
});

test('限流：窗口过期后自动解锁并重新计数', () => {
  let t = 0;
  const limiter = createAttemptLimiter({ maxAttempts: 1, windowMs: 1000, now: () => t });
  limiter.fail('k');
  limiter.fail('k');
  assert.equal(limiter.blocked('k').blocked, true);
  t += 1001;
  assert.equal(limiter.blocked('k').blocked, false);
  assert.equal(limiter.fail('k'), 0, '窗口重置后重新计数，剩余次数回到 max-1');
});

test('限流：登录成功后 reset 清空计数', () => {
  let t = 0;
  const limiter = createAttemptLimiter({ maxAttempts: 2, windowMs: 60_000, now: () => t });
  limiter.fail('k');
  limiter.fail('k');
  limiter.fail('k');
  assert.equal(limiter.blocked('k').blocked, true);
  limiter.reset('k');
  assert.equal(limiter.blocked('k').blocked, false);
  assert.equal(limiter.size(), 0);
});
