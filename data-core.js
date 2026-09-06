/**
 * data-core.js — SQCDP 现场问题工单闭环系统 · 地基层（数据与存储）
 *
 * 纯原生 JavaScript，无框架、无 npm、无构建步骤。
 * 浏览器：挂载到 window.SQCDP（等价于 globalThis.SQCDP）。
 * Node：可 require 自测（module.exports = SQCDP）。
 *
 * 职责：定义命名空间、演示账号、种子工单、本地存储(localStorage + Node 内存兜底)读写。
 *
 * 工单字段映射（spec §三，中文 → 键名）：
 *   工单号     -> id
 *   分类       -> classification   （S=安全 Q=质量 C=成本 D=交付 P=人员）
 *   标题       -> title
 *   问题描述   -> description
 *   危害/影响  -> impact
 *   要求日期   -> requiredDate     （YYYY-MM-DD）
 *   提交人     -> submitter
 *   提交时间   -> submitTime
 *   指派责任人 -> assignee
 *   指派时间   -> assignTime
 *   处理说明   -> handlerNote
 *   完成时间   -> doneTime
 *   关闭时间   -> closeTime
 *   关闭人     -> closer
 *  （另含 status 状态字段，及 manager 收单管理者字段，用于流程流转）
 */
(function (global) {
  'use strict';

  var SQCDP = global.SQCDP || {};

  /* ================= 存储 KEY 常量（统一管理） ================= */
  var STORAGE_KEYS = {
    TICKETS: 'sqcdp.tickets.v1',
    ACCOUNTS: 'sqcdp.accounts.v1',
    SEQ: 'sqcdp.seq.v1'
  };

  /* ================= 日期/时间工具 ================= */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function toDateStr(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function toDateTimeStr(d) {
    return toDateStr(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function now() { return toDateTimeStr(new Date()); }

  function todayStr() { return toDateStr(new Date()); }

  function dateOffset(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return toDateStr(d);
  }

  function dateTimeOffset(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return toDateTimeStr(d);
  }

  /* ================= 演示账号（spec §四） ================= */
  var ACCOUNTS = {
    employees: ['王磊', '赵敏', '刘洋'],
    managers: {
      S: '李建国', // 安全
      Q: '陈芳',   // 质量
      C: '刘志强', // 成本
      D: '王雪梅', // 交付
      P: '孙丽华'  // 人员
    },
    assignees: ['张海峰', '周明', '吴刚', '郑涛', '林晓东']
  };

  /* ================= 种子工单（spec §四：1 超期未关闭 / 1 处理中 / 1 已关闭） ================= */
  function buildSeedTickets() {
    return [
      // 1) 超期未关闭：要求日期在 10 天前，已报完成但管理者尚未确认（待确认），超期天数 = 10
      {
        id: 'SQCDP-0001',
        classification: 'S',
        title: '车间叉车通道地面油污',
        description: '北车间叉车通道转弯处有大片油污，叉车经过容易打滑。',
        impact: '存在人员滑倒与叉车侧滑风险，可能造成人身伤害。',
        requiredDate: dateOffset(-10),
        submitter: '王磊',
        submitTime: dateTimeOffset(-15),
        manager: ACCOUNTS.managers.S,
        assignee: '张海峰',
        assignTime: dateTimeOffset(-14),
        handlerNote: '已安排保洁清理并放置防滑警示牌，等待复查。',
        doneTime: dateTimeOffset(-8),
        closeTime: null,
        closer: null,
        status: '待确认'
      },
      // 2) 处理中：要求日期在 5 天后，尚未完成
      {
        id: 'SQCDP-0002',
        classification: 'Q',
        title: '装配线螺丝扭矩超标',
        description: '三号工位电动扭矩扳手校准后仍出现扭矩超差报警。',
        impact: '影响装配质量，可能导致产品缺陷流出。',
        requiredDate: dateOffset(5),
        submitter: '赵敏',
        submitTime: dateTimeOffset(-2),
        manager: ACCOUNTS.managers.Q,
        assignee: '周明',
        assignTime: dateTimeOffset(-1),
        handlerNote: null,
        doneTime: null,
        closeTime: null,
        closer: null,
        status: '处理中'
      },
      // 3) 已关闭：要求日期 3 天前，已确认关闭
      {
        id: 'SQCDP-0003',
        classification: 'D',
        title: '客户订单包装标识错误',
        description: '某批次成品外包装贴标与订单号不一致，已通知重新贴标。',
        impact: '可能造成客户收货错乱、交付延误。',
        requiredDate: dateOffset(-3),
        submitter: '王磊',
        submitTime: dateTimeOffset(-10),
        manager: ACCOUNTS.managers.D,
        assignee: '吴刚',
        assignTime: dateTimeOffset(-9),
        handlerNote: '已重新核对并完成贴标，抽样复查通过。',
        doneTime: dateTimeOffset(-5),
        closeTime: dateTimeOffset(-4),
        closer: ACCOUNTS.managers.D,
        status: '已关闭'
      }
    ];
  }

  /* ================= 本地存储：localStorage + Node 内存兜底 ================= */
  var _mem = {};

  function ls() {
    if (typeof localStorage !== 'undefined') return localStorage;
    return null;
  }

  function rawGet(key) {
    var s = ls();
    if (s) {
      try { return s.getItem(key); } catch (e) { return null; }
    }
    return Object.prototype.hasOwnProperty.call(_mem, key) ? _mem[key] : null;
  }

  function rawSet(key, val) {
    var s = ls();
    if (s) {
      try { s.setItem(key, val); } catch (e) { /* 忽略隐私模式/配额异常 */ }
    }
    _mem[key] = val;
  }

  function readJSON(key, fallback) {
    var raw = rawGet(key);
    if (raw === null || raw === undefined) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function writeJSON(key, value) {
    rawSet(key, JSON.stringify(value));
  }

  /* ================= 工单读写 ================= */
  function saveTickets(list) {
    writeJSON(STORAGE_KEYS.TICKETS, list);
  }

  function getTickets() {
    var list = readJSON(STORAGE_KEYS.TICKETS, null);
    if (!Array.isArray(list)) {
      // 缺失或损坏 -> 返回种子数据（sane default），并落盘
      list = buildSeedTickets();
      saveTickets(list);
      writeJSON(STORAGE_KEYS.SEQ, list.length);
    }
    return list;
  }

  function nextTicketId() {
    var seq = readJSON(STORAGE_KEYS.SEQ, 0);
    if (typeof seq !== 'number' || isNaN(seq)) seq = 0;
    seq += 1;
    writeJSON(STORAGE_KEYS.SEQ, seq);
    return 'SQCDP-' + String(seq).padStart(4, '0');
  }

  function getAccounts() { return ACCOUNTS; }

  function clearStorage() {
    var s = ls();
    if (s) {
      try {
        s.removeItem(STORAGE_KEYS.TICKETS);
        s.removeItem(STORAGE_KEYS.SEQ);
      } catch (e) { /* 忽略 */ }
    }
    delete _mem[STORAGE_KEYS.TICKETS];
    delete _mem[STORAGE_KEYS.SEQ];
  }

  /* ================= 挂载到命名空间 ================= */
  SQCDP.STORAGE_KEYS = STORAGE_KEYS;
  SQCDP.ACCOUNTS = ACCOUNTS;

  SQCDP.getAccounts = getAccounts;
  SQCDP.getTickets = getTickets;
  SQCDP.saveTickets = saveTickets;
  SQCDP.nextTicketId = nextTicketId;
  SQCDP.readJSON = readJSON;
  SQCDP.writeJSON = writeJSON;
  SQCDP.clearStorage = clearStorage;

  // 日期工具（供 ticket-flow 及自测使用）
  SQCDP.now = now;
  SQCDP.todayStr = todayStr;
  SQCDP.dateOffset = dateOffset;
  SQCDP.dateTimeOffset = dateTimeOffset;

  global.SQCDP = SQCDP;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SQCDP;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
