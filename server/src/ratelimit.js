// 登录失败限流（内存计数器）
// 目的：公网实例上挡住暴力猜口令。按「来源 IP + 用户名」分桶，窗口内失败次数超限则暂时拒绝。
// 说明：内存实现，多进程/重启后计数清零；单实例部署（当前 systemd 单进程）足够。
function createAttemptLimiter({ maxAttempts = 10, windowMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
  const buckets = new Map(); // key -> { count, firstAt }

  function prune(current) {
    // 防止长期运行下 Map 无界增长：顺手清掉已过期的桶
    if (buckets.size < 5000) return;
    for (const [k, v] of buckets) {
      if (current - v.firstAt >= windowMs) buckets.delete(k);
    }
  }

  function blocked(key) {
    const current = now();
    const b = buckets.get(key);
    if (!b) return { blocked: false, retryAfterSec: 0 };
    if (current - b.firstAt >= windowMs) {
      buckets.delete(key);
      return { blocked: false, retryAfterSec: 0 };
    }
    if (b.count < maxAttempts) return { blocked: false, retryAfterSec: 0 };
    return { blocked: true, retryAfterSec: Math.max(1, Math.ceil((windowMs - (current - b.firstAt)) / 1000)) };
  }

  function fail(key) {
    const current = now();
    const b = buckets.get(key);
    if (!b || current - b.firstAt >= windowMs) {
      buckets.set(key, { count: 1, firstAt: current });
      prune(current);
      return maxAttempts - 1;
    }
    b.count += 1;
    return Math.max(0, maxAttempts - b.count);
  }

  function reset(key) {
    buckets.delete(key);
  }

  return { blocked, fail, reset, size: () => buckets.size };
}

module.exports = { createAttemptLimiter };
