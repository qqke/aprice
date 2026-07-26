import assert from 'node:assert/strict';

import { friendlyDataError } from '../src/lib/form-validation.js';

assert.equal(friendlyDataError({ message: 'no_price_tasks_available' }), '当前暂无可领取任务，请稍后再试。');
assert.equal(friendlyDataError({ message: 'daily_task_claim_limit_reached' }), '今天已领取过足够任务了，明天再来吧。');
assert.equal(friendlyDataError({ message: 'Failed to fetch' }), '网络连接失败，请检查网络后重试。');

console.log('form-validation test passed');
