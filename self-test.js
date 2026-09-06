/**
 * self-test.js — 一次性自测脚本（spec §六 三场景验收）
 * 用法：node self-test.js
 * 运行后无副作用（不提交 git），可反复执行。
 */
'use strict';

const SQCDP = require('./ticket-flow.js'); // 会连带加载 data-core.js

let passCount = 0;
function pass(name) {
  passCount += 1;
  console.log('PASS  ' + name);
}
function fail(name, detail) {
  console.log('FAIL  ' + name + (detail ? '  ->  ' + detail : ''));
}

// 重置到种子数据，保证可重复
SQCDP.clearStorage();
SQCDP.getTickets();

/* ============ ① 完整闭环 ============ */
try {
  const yesterday = SQCDP.dateOffset(-1);
  let t = SQCDP.submitTicket({
    classification: 'S',
    title: '测试：车间安全通道堵塞',
    description: '现场测试用工单',
    impact: '可能影响应急疏散',
    requiredDate: yesterday,
    submitter: '王磊'
  });
  if (t.manager !== '李建国') throw new Error('未自动归到李建国，实际 manager=' + t.manager);
  if (t.status !== SQCDP.STATUS.PENDING) throw new Error('初始状态应为待指派，实际=' + t.status);

  t = SQCDP.assignTicket(t.id, '张海峰');
  if (t.status !== SQCDP.STATUS.IN_PROGRESS) throw new Error('指派后应为处理中，实际=' + t.status);

  t = SQCDP.reportDone(t.id, '已清理通道并复验');
  if (t.status !== SQCDP.STATUS.PENDING_CONFIRM) throw new Error('报完成后应为待确认，实际=' + t.status);

  t = SQCDP.confirmClose(t.id, '李建国');
  if (t.status !== SQCDP.STATUS.CLOSED) throw new Error('确认后应为已关闭，实际=' + t.status);
  if (SQCDP.statusColor(t) !== 'green') throw new Error('已关闭应为绿色，实际=' + SQCDP.statusColor(t));

  pass('① 完整闭环：提交→归李建国→派张海峰→报完成→李建国确认关闭→已关闭(绿)');
} catch (e) {
  fail('① 完整闭环', e.message);
}

/* ============ ② 超期未关闭 ============ */
try {
  const overdue = SQCDP.getTickets().filter(function (x) { return SQCDP.isOverdue(x); });
  if (overdue.length === 0) throw new Error('未找到超期未关闭工单');
  const t = overdue[0];
  if (SQCDP.statusColor(t) !== 'red') throw new Error('超期应标红，实际=' + SQCDP.statusColor(t));
  const days = SQCDP.overdueDays(t);
  if (days !== 10) throw new Error('超期天数应为 10，实际=' + days);
  pass('② 超期未关闭：isOverdue=true，标红，超期天数=' + days);
} catch (e) {
  fail('② 超期未关闭', e.message);
}

/* ============ ③ 员工仅见自己提交的工单 ============ */
try {
  const own = SQCDP.listTicketsForRole('employee', '王磊');
  if (own.length === 0) throw new Error('王磊应能看到自己提交的工单');
  const foreign = own.filter(function (x) { return x.submitter !== '王磊'; });
  if (foreign.length > 0) throw new Error('看到了他人提交的工单');
  const all = SQCDP.getTickets();
  const zhaoTotal = all.filter(function (x) { return x.submitter === '赵敏'; }).length;
  if (zhaoTotal === 0) throw new Error('赵敏应有自己的工单用于对照');
  pass('③ 员工仅能看到自己提交的工单（王磊可见 ' + own.length + ' 条，均非他人单）');
} catch (e) {
  fail('③ 员工仅见自己的工单', e.message);
}

console.log('\n结果: ' + passCount + '/3 通过');
process.exit(passCount === 3 ? 0 : 1);
