/**
 * app.js — SQCDP 现场问题工单闭环系统 · UI 层
 *
 * 纯原生 JS 单页演示。所有数据 / 状态机 / 存储一律走地基层 SQCDP 命名空间，
 * 本文件只做「页面渲染 + 用户交互」，不自行实现第二套业务逻辑。
 *
 * 界面：登录/角色切换 · 员工上报 · 员工我的工单 · 管理者工作台 · 责任人处理 · 总览看板
 */
(function () {
  'use strict';

  var SQCDP = window.SQCDP;
  var SESSION_KEY = 'sqcdp.session.v1';
  var AVATAR_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#db2777', '#ea580c', '#16a34a', '#4f46e5', '#0d9488'];

  /* ================= 会话状态 ================= */
  var state = {
    view: 'login',     // login | employee | manager | assignee | overview
    session: null,     // {role, name, code?}
    tab: 'report',     // employee 页签: report | mine
    cat: '',           // 员工上报所选分类
    draft: { cat: '', title: '', desc: '', impact: '', required: '' }
  };

  /* ================= 工具 ================= */
  function h(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function catName(code) {
    return SQCDP.CLASSIFICATION[code] || code || '';
  }

  function codeOfManager(name) {
    var m = SQCDP.getAccounts().managers;
    for (var k in m) { if (m[k] === name) return k; }
    return null;
  }

  function avatarColor(name) {
    var n = 0;
    for (var i = 0; i < String(name).length; i++) n += String(name).charCodeAt(i);
    return AVATAR_COLORS[n % AVATAR_COLORS.length];
  }

  function ticketsSorted() {
    var list = SQCDP.getTickets().slice();
    list.sort(function (a, b) { return (b.submitTime || '').localeCompare(a.submitTime || ''); });
    return list;
  }

  // 统计某组工单的状态/超期
  function tally(list) {
    var r = { pending: 0, doing: 0, confirm: 0, closed: 0, overdue: 0 };
    list.forEach(function (t) {
      if (SQCDP.isOverdue(t)) r.overdue += 1;
      switch (t.status) {
        case SQCDP.STATUS.PENDING: r.pending += 1; break;
        case SQCDP.STATUS.IN_PROGRESS: r.doing += 1; break;
        case SQCDP.STATUS.PENDING_CONFIRM: r.confirm += 1; break;
        case SQCDP.STATUS.CLOSED: r.closed += 1; break;
      }
    });
    return r;
  }

  function toast(msg, type) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.className = 'toast'; }, 2600);
  }

  /* ================= 顶层渲染 ================= */
  function render() {
    switch (state.view) {
      case 'employee': return viewEmployee();
      case 'manager': return viewManager();
      case 'assignee': return viewAssignee();
      case 'overview': return viewOverview();
      default: return viewLogin();
    }
  }

  function renderInto() {
    document.getElementById('app').innerHTML = render();
  }

  /* ================= 登录 / 角色切换 ================= */
  function viewLogin() {
    var acc = SQCDP.getAccounts();
    var s = '';

    s += headerBar(null);

    s += '<div class="card" style="padding:22px 18px;">';
    s += '<h1 class="page" style="margin-top:2px;">现场问题 · 随手一报</h1>';
    s += '<p class="lead" style="margin-bottom:4px;">选择演示身份，进入对应工作台。全程本地演示，数据保存在当前浏览器。</p>';
    s += '</div>';

    // 员工
    s += '<div class="group-label">🙋 员工（现场上报）</div>';
    s += '<div class="acc-grid">';
    acc.employees.forEach(function (name) {
      s += accountCard('employee', name, '员工', '', '#2563eb');
    });
    s += '</div>';

    // 分类管理者
    s += '<div class="group-label">🧭 分类管理者（收单 · 指派 · 确认关闭）</div>';
    s += '<div class="acc-grid">';
    Object.keys(acc.managers).forEach(function (code) {
      var name = acc.managers[code];
      s += accountCard('manager', name, catName(code) + '管理者', '分类:' + code + ' · ' + catName(code), '#7c3aed');
    });
    s += '</div>';

    // 责任人
    s += '<div class="group-label">🔧 责任人（处理 · 报完成）</div>';
    s += '<div class="acc-grid">';
    acc.assignees.forEach(function (name) {
      s += accountCard('assignee', name, '责任人', '', '#0d9488');
    });
    s += '</div>';

    // 总览看板
    s += '<div class="group-label">📊 演示</div>';
    s += '<button class="btn ghost" data-action="login" data-role="overview" data-name="总览看板">' +
         '📈 总览看板（全部工单 · 状态统计 · 超期督办）</button>';

    s += '<div style="text-align:center;margin:24px 0 8px;">';
    s += '<button class="btn gray" style="width:auto;min-height:40px;font-size:13.5px;padding:8px 18px;" data-action="reset">' +
         '🔄 重置演示数据（恢复初始种子）</button>';
    s += '</div>';

    return s;
  }

  function accountCard(role, name, roleText, extra, color) {
    return '<button class="account" data-action="login" data-role="' + h(role) +
      '" data-name="' + h(name) + '">' +
      '<span class="avatar" style="background:' + color + ';">' + h(name.charAt(0)) + '</span>' +
      '<span class="who"><b>' + h(name) + '</b><span>' + h(roleText) + (extra ? ' · ' + extra : '') + '</span></span>' +
      '<span class="role-tag badge blue">进入</span>' +
      '</button>';
  }

  function headerBar(personaText) {
    var s = '<div class="topbar">';
    s += '<div class="brand"><span class="logo">SQ</span>';
    s += '<div class="tt"><b>SQCDP 工单闭环</b><span>' + h(personaText || '现场问题 · 安全/质量/成本/交付/人员') + '</span></div></div>';
    if (state.session && state.view !== 'login') {
      s += '<div class="top-actions"><button class="btn sm ghost" data-action="switch-role">切换角色</button></div>';
    }
    s += '</div>';
    return s;
  }

  /* ================= 员工 ================= */
  function viewEmployee() {
    var me = state.session.name;
    var s = '';
    s += headerBar('当前身份：员工 · ' + me);
    s += '<div class="user-chip"><span class="badge">员工</span>' + h(me) + '</div>';

    s += '<div class="tabs" style="margin-top:14px;">';
    s += '<button class="' + (state.tab === 'report' ? 'on' : '') + '" data-action="tab" data-tab="report">📝 我要上报</button>';
    s += '<button class="' + (state.tab === 'mine' ? 'on' : '') + '" data-action="tab" data-tab="mine">🗂 我的工单</button>';
    s += '</div>';

    if (state.tab === 'report') s += employeeReportForm(me);
    else s += employeeMineList(me);
    return s;
  }

  function employeeReportForm(me) {
    var acc = SQCDP.getAccounts();
    var s = '<div class="card">';
    s += '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">';
    s += '<b style="font-size:16.5px;">上报现场问题</b>';
    s += '<span style="font-size:12px;color:var(--ink-3);">提交后自动送达对应分类管理者</span>';
    s += '</div>';

    // 分类
    s += '<div class="field"><label>问题分类 <span class="opt">（五选一）</span></label>';
    s += '<div class="cat-grid" id="rep-cat">';
    var codes = ['S', 'Q', 'C', 'D', 'P'];
    codes.forEach(function (code) {
      var on = state.draft.cat === code ? ' on' : '';
      s += '<button type="button" class="cat-btn' + on + '" data-action="cat" data-code="' + code + '">' +
        '<span class="lg">' + code + '</span>' + h(catName(code)) + '</button>';
    });
    s += '</div></div>';

    // 标题
    s += '<div class="field"><label>标题</label>';
    s += '<input class="input" data-draft="title" id="rep-title" maxlength="60" value="' + h(state.draft.title) + '" placeholder="一句话说明问题，如：车间地面油污">';
    s += '</div>';

    // 问题描述
    s += '<div class="field"><label>问题描述</label>';
    s += '<textarea class="input" data-draft="desc" id="rep-desc" rows="3" placeholder="位置、现象、出现经过等">' + h(state.draft.desc) + '</textarea>';
    s += '</div>';

    // 危害/影响
    s += '<div class="field"><label>危害 / 影响</label>';
    s += '<textarea class="input" data-draft="impact" id="rep-impact" rows="2" placeholder="可能造成的人身/质量/交付/成本影响">' + h(state.draft.impact) + '</textarea>';
    s += '</div>';

    // 要求解决日期
    s += '<div class="field"><label>要求解决日期</label>';
    s += '<input class="input" data-draft="required" type="date" id="rep-required" value="' + h(state.draft.required) + '">';
    s += '<div class="chip-row" style="margin-top:8px;">';
    s += '<button type="button" class="chip" data-action="date-chip" data-days="-1">昨天</button>';
    s += '<button type="button" class="chip" data-action="date-chip" data-days="0">今天</button>';
    s += '<button type="button" class="chip" data-action="date-chip" data-days="1">明天</button>';
    s += '<button type="button" class="chip" data-action="date-chip" data-days="3">3天后</button>';
    s += '</div></div>';

    s += '<div class="notice info" id="rep-target" style="margin:4px 0 14px;">' +
      (state.draft.cat ? '将送达 → 管理者 ' + h(codeManagerName(state.draft.cat) || '—') : '请先选择问题分类') + '</div>';

    s += '<button class="btn big" data-action="submit-report">提交工单</button>';
    s += '</div>';
    return s;
  }

  function codeManagerName(code) {
    var acc = SQCDP.getAccounts();
    return acc.managers[code] || '';
  }

  function employeeMineList(me) {
    var list = SQCDP.listTicketsForRole('employee', me);
    if (!list.length) {
      return '<div class="empty">还没有提交过工单。<br><b>去「我要上报」记录第一个问题吧。</b></div>';
    }
    var st = tally(list);
    var s = '<div class="stat-row">';
    s += statCell('待指派', st.pending, 'blue') + statCell('处理中/待确认', st.doing + st.confirm, 'orange') + statCell('已关闭', st.closed, 'green');
    s += '</div><div style="height:6px;"></div>';
    s += '<div class="notice' + (st.overdue ? '" style="color:#b91c1c;border-color:#fecaca;background:#fef2f2;' : ' info') + '">' +
      (st.overdue ? '⚠ ' + st.overdue + ' 条已超期，请留意（红色）' : '当前没有超期工单 ✔') + '</div>';

    list.forEach(function (t) {
      s += ticketCard(t, { showCategory: true });
    });
    return s;
  }

  /* ================= 通用工单卡 ================= */
  function ticketCard(t, opts) {
    opts = opts || {};
    var color = SQCDP.statusColor(t);
    var odDays = SQCDP.overdueDays(t);
    var s = '<div class="ticket t-' + color + '">';

    // 行1：编号 + 状态
    s += '<div class="row1"><span class="id">' + h(t.id) + '</span>';
    s += '<span>' + badge(t.status, color);
    if (odDays > 0) s += ' <span class="badge red">超期 ' + odDays + ' 天</span>';
    s += '</span></div>';

    // 分类 + 标题
    if (opts.showCategory) {
      s += '<div style="margin-bottom:2px;"><span class="pill ' + String(t.classification).toLowerCase() + '">' +
        h(catName(t.classification)) + '</span></div>';
    }
    s += '<div class="title">' + h(t.title) + '</div>';
    s += '<div class="desc">' + h(t.description || '') + '</div>';

    // 指派/处理信息
    var meta = [];
    if (opts.extra) meta = meta.concat(opts.extra);
    meta.push('<b>提交人</b>' + h(t.submitter || '—'));
    meta.push('<b>要求日期</b>' + h(t.requiredDate || '—'));
    if (t.manager) meta.push('<b>所属</b>' + h(catName(t.classification) + '·' + t.manager));
    if (t.assignee) meta.push('<b>责任人</b>' + h(t.assignee));
    s += '<div class="meta">' + meta.join('') + '</div>';

    if (t.handlerNote) {
      s += '<div class="hint">处理说明：' + h(t.handlerNote) + '</div>';
    }
    if (odDays > 0) {
      s += '<div class="hint"><span class="overdue-tag">已超期 ' + odDays + ' 天，要求 ' + h(t.requiredDate) + ' 前解决</span></div>';
    }

    if (opts.actions) s += '<div class="actions">' + opts.actions(t, color) + '</div>';
    s += '</div>';
    return s;
  }

  function badge(text, color) {
    return '<span class="badge ' + color + '">' + h(text) + '</span>';
  }

  function statCell(label, n, color) {
    var c = { blue: '#2563eb', orange: '#f59e0b', green: '#16a34a', red: '#dc2626', gray: '#6b7280' }[color] || '#6b7280';
    return '<div class="stat"><div class="n" style="color:' + c + ';">' + n + '</div><div class="t">' + h(label) + '</div></div>';
  }

  /* ================= 管理者工作台 ================= */
  function viewManager() {
    var me = state.session.name;
    var code = state.session.code || codeOfManager(me) || '';
    var list = SQCDP.listTicketsForRole('manager', me);
    var st = tally(list);

    var s = headerBar('当前身份：' + catName(code) + '管理者 · ' + me);
    s += '<div class="user-chip"><span class="badge">' + h(catName(code)) + '管理者</span>' + h(me) + '</div>';
    s += '<div style="margin:12px 0 4px;">';
    s += '<div class="stat-row">';
    s += statCell('新单待指派', st.pending, 'blue') + statCell('待确认核实', st.confirm, 'orange') + statCell('已关闭', st.closed, 'green');
    s += '</div></div>';

    // 本分类说明
    s += '<div class="notice info" style="margin-top:10px;">本工作台仅显示「' + h(catName(code)) + '（' + code + '）」分类工单。' +
      '关闭必须由管理者核实后确认，责任人不能自行关闭。</div>';

    // ===== 超期督办区 =====
    var odList = list.filter(SQCDP.isOverdue);
    s += '<div class="section-title"><span class="dot" style="background:var(--red);"></span>🚨 本分类 · 超期督办区' +
      '<small>' + odList.length + ' 条超期</small></div>';
    if (!odList.length) {
      s += '<div class="empty">本分类暂无超期工单 ✔</div>';
    } else {
      odList.forEach(function (t) {
        var canConfirm = t.status === SQCDP.STATUS.PENDING_CONFIRM;
        var isPending = t.status === SQCDP.STATUS.PENDING;
        s += ticketCard(t, {
          showCategory: false,
          extra: ['<b>状态</b>' + t.status],
          actions: function (tk) {
            var b = '';
            b += '<div class="notice" style="margin:0;">责任人 ' + h(tk.assignee || '未指派') + ' 已处理至「' + h(tk.status) +
              '」，要求 ' + h(tk.requiredDate) + ' 前关闭，已超期 <b>' + SQCDP.overdueDays(tk) + ' 天</b>。</div>';
            if (isPending) b += assignBar(tk, true);
            if (canConfirm) b += confirmBar(tk);
            return b;
          }
        });
      });
    }

    // ===== 新单待指派 =====
    var pendList = list.filter(function (t) { return t.status === SQCDP.STATUS.PENDING && !SQCDP.isOverdue(t); });
    s += '<div class="section-title"><span class="dot"></span>📥 新单待指派<small>' + pendList.length + ' 条</small></div>';
    if (!pendList.length) {
      s += '<div class="empty">暂无待指派新单</div>';
    } else {
      pendList.forEach(function (t) {
        s += ticketCard(t, { showCategory: false, actions: function (tk) { return assignBar(tk, false); } });
      });
    }

    // ===== 待确认核实（未超期部分）=====
    var confList = list.filter(function (t) {
      return t.status === SQCDP.STATUS.PENDING_CONFIRM && !SQCDP.isOverdue(t);
    });
    s += '<div class="section-title"><span class="dot" style="background:var(--orange);"></span>✅ 报完成 · 待确认核实<small>' + confList.length + ' 条</small></div>';
    if (!confList.length) {
      s += '<div class="empty">暂无待核实工单</div>';
    } else {
      confList.forEach(function (t) {
        s += ticketCard(t, { showCategory: false, actions: confirmBar });
      });
    }

    // ===== 处理中 / 已关闭（查看）=====
    var rest = list.filter(function (t) {
      return (t.status === SQCDP.STATUS.IN_PROGRESS || t.status === SQCDP.STATUS.CLOSED) && !SQCDP.isOverdue(t);
    });
    s += '<div class="section-title"><span class="dot" style="background:var(--green);"></span>🗂 本分类 · 处理中 / 已关闭<small>' + rest.length + ' 条</small></div>';
    if (!rest.length) {
      s += '<div class="empty">暂无其他工单</div>';
    } else {
      rest.forEach(function (t) {
        s += ticketCard(t, { showCategory: false });
      });
    }

    return s;
  }

  // 指派操作条（管理者）
  function assignBar(t, forceShow) {
    var acc = SQCDP.getAccounts();
    var opts = '';
    acc.assignees.forEach(function (name) {
      opts += '<option value="' + h(name) + '"' + (t.assignee === name ? ' selected' : '') + '>' + h(name) + '</option>';
    });
    return '<div style="background:var(--brand-light);border-radius:11px;padding:10px;">' +
      '<div style="font-size:13px;font-weight:700;color:var(--brand-dark);margin-bottom:6px;">指派给责任人</div>' +
      '<select class="input" id="as-' + h(t.id) + '" style="margin-bottom:8px;">' + opts + '</select>' +
      '<button class="btn" style="min-height:46px;font-size:15.5px;" data-action="assign" data-id="' + h(t.id) + '">指派并流转 → 处理中</button>' +
      '</div>';
  }

  function confirmBar(t) {
    return '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:11px;padding:10px;">' +
      '<div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:4px;">责任人已报完成，请核实处理结果</div>' +
      '<div style="font-size:13px;color:#374151;margin-bottom:8px;">完成时间：' + h(t.doneTime || '—') + '　责任人：' + h(t.assignee || '—') + '</div>' +
      '<button class="btn green" style="min-height:46px;font-size:15.5px;" data-action="confirm-close" data-id="' + h(t.id) + '">✓ 核实无误，确认关闭（工单闭环）</button>' +
      '</div>';
  }

  /* ================= 责任人处理页 ================= */
  function viewAssignee() {
    var me = state.session.name;
    var list = SQCDP.listTicketsForRole('assignee', me);
    var s = headerBar('当前身份：责任人 · ' + me);
    s += '<div class="user-chip"><span class="badge">责任人</span>' + h(me) + '</div>';

    var toDo = list.filter(function (t) { return t.status === SQCDP.STATUS.IN_PROGRESS; });
    var waiting = list.filter(function (t) { return t.status === SQCDP.STATUS.PENDING_CONFIRM; });
    var done = list.filter(function (t) { return t.status === SQCDP.STATUS.CLOSED; });
    var over = list.filter(SQCDP.isOverdue);

    s += '<div class="notice' + (over.length ? ' info' : ' info') + '" style="margin-top:12px;">' +
      (over.length ? '⚠ 有 ' + over.length + ' 条超期任务，请优先处理！' : '当前没有超期任务') +
      '　·　报完成后需等待管理者确认关闭（责任人不能自行关闭）。</div>';

    s += '<div class="section-title"><span class="dot" style="background:var(--orange);"></span>🔧 待我处理<small>' + toDo.length + ' 条</small></div>';
    if (!toDo.length) s += '<div class="empty">暂无待处理任务</div>';
    toDo.forEach(function (t) {
      s += ticketCard(t, {
        showCategory: true,
        extra: ['<b>负责人收单</b>' + h(t.manager || '—')],
        actions: function (tk) {
          return '<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:11px;padding:10px;">' +
            '<div style="font-size:13px;font-weight:700;color:#9a3412;margin-bottom:6px;">填写处理说明并报完成</div>' +
            '<textarea class="input" id="note-' + h(tk.id) + '" rows="2" placeholder="如何处理、整改措施、完成情况…">' + h(tk.handlerNote || '') + '</textarea>' +
            '<button class="btn orange" style="margin-top:8px;min-height:46px;font-size:15.5px;" data-action="report-done" data-id="' + h(tk.id) + '">已完成 · 报完成（流转到待确认）</button>' +
            '</div>';
        }
      });
    });

    s += '<div class="section-title"><span class="dot" style="background:#9ca3af;"></span>⏳ 已报完成 · 待管理者确认<small>' + waiting.length + ' 条</small></div>';
    if (!waiting.length) s += '<div class="empty">暂无待确认工单</div>';
    waiting.forEach(function (t) {
      s += ticketCard(t, { showCategory: true, extra: ['<b>完成时间</b>' + h(t.doneTime || '—')] });
    });

    s += '<div class="section-title"><span class="dot" style="background:var(--green);"></span>✔ 已闭环<small>' + done.length + ' 条</small></div>';
    if (!done.length) s += '<div class="empty">暂无已闭环工单</div>';
    done.forEach(function (t) {
      s += ticketCard(t, { showCategory: true, extra: ['<b>关闭时间</b>' + h(t.closeTime || '—')] });
    });
    return s;
  }

  /* ================= 总览看板 ================= */
  function viewOverview() {
    var all = ticketsSorted();
    var st = tally(all);
    var s = headerBar('演示 · 总览看板');
    s += '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
      '<button class="btn sm ghost" data-action="switch-role">返回角色选择</button>' +
      '<button class="btn sm ghost" data-action="reset">重置数据</button></div>';

    s += '<div class="card"><b style="font-size:16.5px;">📊 全部工单 · 状态统计</b>';
    s += '<div class="stat-row" style="margin-top:10px;">';
    s += statCell('待指派', st.pending, 'blue') + statCell('处理中', st.doing, 'orange') + statCell('待确认', st.confirm, 'orange');
    s += statCell('已关闭', st.closed, 'green') + statCell('超期', st.overdue, 'red') + statCell('合计', all.length, 'gray');
    s += '</div></div>';

    s += '<div class="section-title"><span class="dot" style="background:var(--red);"></span>🚨 超期督办区（未闭环）<small>' +
      all.filter(SQCDP.isOverdue).length + ' 条</small></div>';
    var od = all.filter(SQCDP.isOverdue);
    if (!od.length) s += '<div class="empty">暂无超期工单 ✔</div>';
    od.forEach(function (t) {
      s += ticketCard(t, { showCategory: true, extra: ['<b>状态</b>' + h(t.status)] });
    });

    s += '<div class="section-title"><span class="dot"></span>🗂 全部工单清单（共 ' + all.length + ' 条）</div>';
    if (!all.length) s += '<div class="empty">暂无工单</div>';
    all.forEach(function (t) {
      s += ticketCard(t, {
        showCategory: true,
        extra: ['<b>提交时间</b>' + h((t.submitTime || '').slice(0, 16))],
        actions: function (tk) {
          if (tk.status === SQCDP.STATUS.PENDING) return assignBar(tk, true);
          return '';
        }
      });
    });
    return s;
  }

  /* ================= 动作分发 ================= */
  function onAction(action, el) {
    var id = el.getAttribute('data-id');
    var me = state.session && state.session.name;

    switch (action) {
      case 'login': {
        var role = el.getAttribute('data-role');
        var name = el.getAttribute('data-name');
        if (role === 'overview') {
          state.session = null;
          state.view = 'overview';
        } else {
          var sess = { role: role, name: name };
          if (role === 'manager') sess.code = codeOfManager(name);
          state.session = sess;
          state.view = role === 'manager' ? 'manager' : role;
          if (role === 'employee') { state.tab = 'report'; state.draft = { cat: '', title: '', desc: '', impact: '', required: SQCDP.dateOffset(0) }; }
        }
        SQCDP.writeJSON(SESSION_KEY, state.session);
        break;
      }
      case 'switch-role': {
        state.session = null;
        state.view = 'login';
        SQCDP.writeJSON(SESSION_KEY, null);
        break;
      }
      case 'reset': {
        SQCDP.clearStorage();
        SQCDP.getTickets(); // 重建种子
        state.session = null;
        state.view = 'login';
        toast('已恢复初始种子数据', 'ok');
        break;
      }
      case 'tab':
        state.tab = el.getAttribute('data-tab');
        break;
      case 'cat': {
        var code = el.getAttribute('data-code');
        state.draft.cat = (state.draft.cat === code) ? '' : code;
        // 就地高亮 + 更新送达提示，避免整页重绘丢焦点
        var wrap = document.getElementById('rep-cat');
        if (wrap) {
          var btns = wrap.querySelectorAll('.cat-btn');
          for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].getAttribute('data-code') === state.draft.cat);
        }
        refreshTargetNotice();
        return;
      }
      case 'date-chip': {
        var days = parseInt(el.getAttribute('data-days'), 10);
        state.draft.required = SQCDP.dateOffset(days);
        var inp = document.getElementById('rep-required');
        if (inp) inp.value = state.draft.required;
        // 更新选中态
        var row = el.parentNode;
        if (row) {
          var chips = row.querySelectorAll('.chip');
          for (var j = 0; j < chips.length; j++) chips[j].classList.toggle('on', chips[j] === el);
        }
        return;
      }
      case 'submit-report': {
        doSubmitReport();
        return;
      }
      case 'assign': {
        try {
          var sel = document.getElementById('as-' + id);
          var assignee = sel ? sel.value : '';
          if (!assignee) { toast('请选择责任人', 'err'); return; }
          SQCDP.assignTicket(id, assignee);
          toast('已指派给 ' + assignee + '，状态 → 处理中', 'ok');
        } catch (e) { toast(e.message || '指派失败', 'err'); }
        break;
      }
      case 'confirm-close': {
        try {
          SQCDP.confirmClose(id, me);
          toast('已确认关闭，工单闭环 ✔', 'ok');
        } catch (e) { toast(e.message || '关闭失败', 'err'); }
        break;
      }
      case 'report-done': {
        try {
          var ta = document.getElementById('note-' + id);
          var note = ta ? ta.value.trim() : '';
          if (!note) { toast('请先填写处理说明', 'err'); return; }
          SQCDP.reportDone(id, note);
          toast('已报完成 → 待管理者确认', 'ok');
        } catch (e) { toast(e.message || '报完成失败', 'err'); }
        break;
      }
    }
    renderInto();
  }

  function doSubmitReport() {
    var cat = state.draft.cat;
    var title = (document.getElementById('rep-title') || {}).value || '';
    var desc = (document.getElementById('rep-desc') || {}).value || '';
    var impact = (document.getElementById('rep-impact') || {}).value || '';
    var required = (document.getElementById('rep-required') || {}).value || '';

    if (!cat) { toast('请先选择问题分类', 'err'); return; }
    if (!title.trim()) { toast('请填写标题', 'err'); return; }
    if (!desc.trim()) { toast('请填写问题描述', 'err'); return; }
    if (!required) { toast('请选择要求解决日期', 'err'); return; }

    try {
      var t = SQCDP.submitTicket({
        classification: cat,
        title: title.trim(),
        description: desc.trim(),
        impact: impact.trim(),
        requiredDate: required,
        submitter: state.session.name
      });
      state.draft = { cat: '', title: '', desc: '', impact: '', required: SQCDP.dateOffset(0) };
      state.tab = 'mine';
      renderInto();
      toast('工单 ' + t.id + ' 已提交 → 送达 ' + (t.manager || '对应管理者') + '（' + catName(cat) + '）', 'ok');
    } catch (e) {
      toast(e.message || '提交失败', 'err');
    }
  }

  /* ================= draft 输入同步 ================= */
  function captureDraftInput(input) {
    var k = input.getAttribute('data-draft');
    if (state.view === 'employee' && k) {
      state.draft[k] = input.value;
    }
  }

  function refreshTargetNotice() {
    var t = document.getElementById('rep-target');
    if (!t) return;
    var cat = state.draft.cat;
    t.innerHTML = cat ? '将送达 → 管理者 ' + h(codeManagerName(cat) || '—') + '（' + h(catName(cat)) + '）'
      : '请先选择问题分类';
    t.className = 'notice info';
  }

  /* ================= 事件绑定 ================= */
  function bind() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!btn) return;
      e.preventDefault();
      onAction(btn.getAttribute('data-action'), btn);
    });

    document.addEventListener('input', function (e) {
      var inp = e.target;
      if (inp && inp.getAttribute && inp.getAttribute('data-draft')) captureDraftInput(inp);
    });

    document.addEventListener('change', function (e) {
      var inp = e.target;
      if (inp && inp.getAttribute && inp.getAttribute('data-draft')) captureDraftInput(inp);
    });
  }

  /* ================= 启动 ================= */
  function boot() {
    // 恢复会话（若之前进入过某角色）
    var saved = SQCDP.readJSON(SESSION_KEY, null);
    if (saved && saved.role && saved.name) {
      // 仅恢复到上一次登录，但默认展示角色选择页更利于演示；
      // 若保存在总览则不强制。
    }
    bind();
    renderInto();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
