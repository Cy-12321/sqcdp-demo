/**
 * ticket-flow.js — SQCDP 现场问题工单闭环系统 · 流程层（状态机 + 操作）
 *
 * 纯原生 JavaScript，无框架、无 npm、无构建步骤。
 * 挂载到 data-core.js 定义的同一命名空间 window.SQCDP。
 * Node：可 require 自测（module.exports = SQCDP）。
 *
 * 状态机链：待指派 → 处理中 → 待确认 → 已关闭
 *   submitTicket  员工提交（按分类自动归到该分类管理者） -> 待指派
 *   assignTicket  管理者指派责任人                        -> 处理中
 *   reportDone    责任人报完成                            -> 待确认
 *   confirmClose  管理者确认关闭                          -> 已关闭
 */
(function (global) {
  'use strict';

  var SQCDP = global.SQCDP;
  // Node 下若尚未加载数据层，则先加载，保证流程函数可用
  if (!SQCDP && typeof require === 'function') {
    SQCDP = require('./data-core.js');
  }
  if (!SQCDP) SQCDP = {};
  global.SQCDP = SQCDP;

  /* ================= 常量 ================= */
  var STATUS = {
    PENDING: '待指派',
    IN_PROGRESS: '处理中',
    PENDING_CONFIRM: '待确认',
    CLOSED: '已关闭'
  };

  var CLASSIFICATION = {
    S: '安全',
    Q: '质量',
    C: '成本',
    D: '交付',
    P: '人员'
  };

  /* ================= 内部辅助 ================= */
  function findTicket(tickets, id) {
    for (var i = 0; i < tickets.length; i++) {
      if (tickets[i].id === id) return tickets[i];
    }
    return null;
  }

  function managerForCategory(code) {
    var acc = SQCDP.getAccounts();
    return acc.managers[code] || null;
  }

  function categoryForManager(name) {
    var acc = SQCDP.getAccounts();
    for (var code in acc.managers) {
      if (acc.managers[code] === name) return code;
    }
    return null;
  }

  function parseDate(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function daysBetween(fromDateStr, toDateStr) {
    var f = parseDate(fromDateStr);
    var t = parseDate(toDateStr);
    if (!f || !t) return 0;
    var fa = Date.UTC(f.getFullYear(), f.getMonth(), f.getDate());
    var ta = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((ta - fa) / 86400000);
  }

  /* ================= 流程操作 ================= */

  // 员工提交工单，按分类自动归到该分类管理者（待指派）
  function submitTicket(input) {
    input = input || {};
    var code = input.classification;
    if (!CLASSIFICATION[code]) {
      throw new Error('无效分类: ' + code + '（应为 S/Q/C/D/P）');
    }
    if (!input.submitter) throw new Error('缺少提交人(submitter)');
    if (!input.requiredDate) throw new Error('缺少要求日期(requiredDate)');

    var tickets = SQCDP.getTickets();
    var ticket = {
      id: SQCDP.nextTicketId(),
      classification: code,
      title: input.title || '',
      description: input.description || '',
      impact: input.impact || '',
      requiredDate: input.requiredDate,
      submitter: input.submitter,
      submitTime: SQCDP.now(),
      manager: managerForCategory(code),
      assignee: null,
      assignTime: null,
      handlerNote: null,
      doneTime: null,
      closeTime: null,
      closer: null,
      status: STATUS.PENDING
    };
    tickets.push(ticket);
    SQCDP.saveTickets(tickets);
    return ticket;
  }

  // 管理者指派责任人 -> 处理中
  function assignTicket(ticketId, assignee) {
    var tickets = SQCDP.getTickets();
    var ticket = findTicket(tickets, ticketId);
    if (!ticket) throw new Error('工单不存在: ' + ticketId);
    if (ticket.status !== STATUS.PENDING) {
      throw new Error('仅"待指派"状态的工单可指派，当前为: ' + ticket.status);
    }
    if (!assignee) throw new Error('缺少责任人(assignee)');
    ticket.assignee = assignee;
    ticket.assignTime = SQCDP.now();
    ticket.status = STATUS.IN_PROGRESS;
    SQCDP.saveTickets(tickets);
    return ticket;
  }

  // 责任人报完成 -> 待确认
  function reportDone(ticketId, handlerNote) {
    var tickets = SQCDP.getTickets();
    var ticket = findTicket(tickets, ticketId);
    if (!ticket) throw new Error('工单不存在: ' + ticketId);
    if (ticket.status !== STATUS.IN_PROGRESS) {
      throw new Error('仅"处理中"状态的工单可报完成，当前为: ' + ticket.status);
    }
    ticket.handlerNote = (handlerNote !== undefined && handlerNote !== null) ? handlerNote : ticket.handlerNote || '';
    ticket.doneTime = SQCDP.now();
    ticket.status = STATUS.PENDING_CONFIRM;
    SQCDP.saveTickets(tickets);
    return ticket;
  }

  // 管理者确认关闭 -> 已关闭
  function confirmClose(ticketId, closer) {
    var tickets = SQCDP.getTickets();
    var ticket = findTicket(tickets, ticketId);
    if (!ticket) throw new Error('工单不存在: ' + ticketId);
    if (ticket.status !== STATUS.PENDING_CONFIRM) {
      throw new Error('仅"待确认"状态的工单可确认关闭，当前为: ' + ticket.status);
    }
    ticket.closeTime = SQCDP.now();
    ticket.closer = closer || ticket.manager || null;
    ticket.status = STATUS.CLOSED;
    SQCDP.saveTickets(tickets);
    return ticket;
  }

  /* ================= 查询 / 状态判断 ================= */

  // 角色过滤：员工看自己提交的 / 管理者看自己分类的 / 责任人看指派给自己的
  function listTicketsForRole(role, name) {
    var tickets = SQCDP.getTickets();
    if (role === 'employee') {
      return tickets.filter(function (t) { return t.submitter === name; });
    }
    if (role === 'manager') {
      var code = categoryForManager(name);
      return tickets.filter(function (t) { return t.classification === code; });
    }
    if (role === 'assignee') {
      return tickets.filter(function (t) { return t.assignee === name; });
    }
    return [];
  }

  // 超期：已过要求日期 且 未关闭
  function isOverdue(ticket) {
    if (!ticket || ticket.status === STATUS.CLOSED) return false;
    if (!ticket.requiredDate) return false;
    return ticket.requiredDate < SQCDP.todayStr();
  }

  // 超期天数（正整数，未超期为 0）
  function overdueDays(ticket) {
    if (!isOverdue(ticket)) return 0;
    return daysBetween(ticket.requiredDate, SQCDP.todayStr());
  }

  // 状态颜色：超期=红（优先），待指派=蓝，处理中/待确认=橙，已关闭=绿
  function statusColor(ticket) {
    if (isOverdue(ticket)) return 'red';
    switch (ticket.status) {
      case STATUS.PENDING: return 'blue';
      case STATUS.IN_PROGRESS:
      case STATUS.PENDING_CONFIRM:
        return 'orange';
      case STATUS.CLOSED: return 'green';
      default: return 'gray';
    }
  }

  /* ================= 挂载到命名空间 ================= */
  SQCDP.STATUS = STATUS;
  SQCDP.CLASSIFICATION = CLASSIFICATION;

  SQCDP.submitTicket = submitTicket;
  SQCDP.assignTicket = assignTicket;
  SQCDP.reportDone = reportDone;
  SQCDP.confirmClose = confirmClose;
  SQCDP.listTicketsForRole = listTicketsForRole;
  SQCDP.isOverdue = isOverdue;
  SQCDP.overdueDays = overdueDays;
  SQCDP.statusColor = statusColor;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SQCDP;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
