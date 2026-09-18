/** Kiểm hợp đồng kiến trúc màn: mỗi màn có schema riêng và màn không tự ghép HTML/DOM. */
const fs = require('fs');
const path = require('path');
const { GAS_DIR, docTep } = require('../lib/load-gas');
const { section, check } = require('../lib/assert');

function listHtml(relativeDir) {
  return fs.readdirSync(path.join(GAS_DIR, relativeDir)).filter((name) => name.endsWith('.html')).sort();
}

function includeIndex(sidebar, relativePath) {
  return sidebar.indexOf("include('" + relativePath + "')");
}

function isBefore(sidebar, first, second) {
  const firstIndex = includeIndex(sidebar, first);
  const secondIndex = includeIndex(sidebar, second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

function chay(so) {
  section('screenSchemaAudit — màn hình chỉ đi qua schema và renderer');

  const coreSchemas = ['activityForm.html', 'customerForm.html', 'formHeader.html', 'noteForm.html', 'view.html'];
  check(so, 'năm tệp schema lõi nằm cùng thư mục screens',
    coreSchemas.filter((name) => listHtml('client/schema/screens').includes(name)), coreSchemas);

  const statusSchemas = ['budgetBlocked.html', 'common.html', 'loadError.html', 'loadSummary.html'];
  check(so, 'các màn trạng thái có schema riêng trong thư mục status',
    statusSchemas.filter((name) => listHtml('client/schema/status').includes(name)), statusSchemas);

  const fbmScreens = ['run.html', 'account.html', 'results.html', 'settings.html', 'index.html'];
  check(so, 'năm schema FBM nằm chung trong thư mục sync/screens',
    fbmScreens.filter((name) => listHtml('client/schema/sync/screens').includes(name)), fbmScreens);

  const fbmResultSchemas = ['status.html', 'issues.html', 'audit.html', 'conflict.html'];
  check(so, 'các panel kết quả FBM nằm chung trong thư mục sync/results',
    fbmResultSchemas.filter((name) => listHtml('client/schema/sync/results').includes(name)), fbmResultSchemas);

  const schemaFiles = [
    ...coreSchemas.map((name) => 'client/schema/screens/' + name),
    ...statusSchemas.map((name) => 'client/schema/status/' + name),
    ...fbmScreens.map((name) => 'client/schema/sync/screens/' + name),
    ...fbmResultSchemas.map((name) => 'client/schema/sync/results/' + name)
  ];
  const schemaViolations = schemaFiles.filter((file) => {
    const source = docTep(file);
    return /<(?:div|span|table|button|input|textarea|select|option)\b/i.test(source) || /\b(?:innerHTML|outerHTML|createElement|appendChild|insertAdjacent|querySelector|getElementById)\b/.test(source);
  });
  check(so, 'schema màn hình chỉ mô tả Block, không chứa HTML literal hoặc DOM', schemaViolations, []);

  const schemaNames = schemaFiles.map((file) => path.basename(file));
  check(so, 'registry không có tên schema màn hình trùng nhau', new Set(schemaNames).size, schemaNames.length);

  const screenFiles = listHtml('client/screen');
  const forbidden = [];
  screenFiles.forEach((name) => {
    const source = docTep('client/screen/' + name);
    if (/<(?:div|span|table|button|input|textarea|select|option)\b/i.test(source)) { forbidden.push(name + ': HTML literal'); }
    if (/\b(?:innerHTML|outerHTML|createElement|appendChild|insertAdjacent|querySelector|getElementById)\b/.test(source)) { forbidden.push(name + ': DOM access'); }
  });
  check(so, 'tệp điều phối màn không chứa HTML literal hoặc lối tắt DOM', forbidden, []);

  const fbmControllers = [
    'client/sync/screens/run.html',
    'client/sync/screens/account.html',
    'client/sync/screens/results.html',
    'client/sync/screens/settings.html',
    'client/sync/fbmSyncSettingsScreen.html',
    'client/sync/fbmSyncStatusScreen.html',
    'client/sync/fbmSyncAuditScreen.html',
    'client/sync/fbmSyncShell.html'
  ];
  const fbmForbidden = [];
  fbmControllers.forEach((file) => {
    const source = docTep(file);
    if (/<(?:div|span|table|button|input|textarea|select|option)\b/i.test(source)) { fbmForbidden.push(file + ': HTML literal'); }
    if (/\b(?:innerHTML|outerHTML|createElement|appendChild|insertAdjacent)\b/.test(source)) { fbmForbidden.push(file + ': DOM construction'); }
    if (/(?:Text|Button|StandaloneField|Card|Notice)\(\{[^\n]*(?:text|label|title|placeholder|ariaLabel|tooltip):\s*['"]/.test(source)) { fbmForbidden.push(file + ': static UI text in controller'); }
    if (/(?:className|id):\s*['"](?:shin-|is-)/.test(source)) { fbmForbidden.push(file + ': static UI class/id in controller'); }
    if (/getElementById\(\s*['"]|(?:patchValue|patchToggle|fbmSyncSetTargetState)\(\s*['"]/.test(source)) { fbmForbidden.push(file + ': literal render id in controller'); }
  });
  check(so, 'controller FBM chỉ tạo Block động và không chứa UI tĩnh/HTML', fbmForbidden, []);

  const sidebar = docTep('client/Sidebar.html');
  check(so, 'Sidebar nạp đủ schema lõi trước registry',
    coreSchemas.filter((name) => sidebar.includes("include('client/schema/screens/" + name.slice(0, -5) + "')")), coreSchemas);
  check(so, 'Sidebar nạp đủ schema trạng thái trước điều phối statusScreen',
    statusSchemas.filter((name) => sidebar.includes("include('client/schema/status/" + name.slice(0, -5) + "')")), statusSchemas);
  check(so, 'Sidebar nạp đủ schema FBM trước controller',
    fbmScreens.slice(0, -1).filter((name) => sidebar.includes("include('client/schema/sync/screens/" + name.slice(0, -5) + "')")), fbmScreens.slice(0, -1));
  check(so, 'Sidebar nạp đủ schema panel kết quả FBM trước controller',
    fbmResultSchemas.filter((name) => sidebar.includes("include('client/schema/sync/results/" + name.slice(0, -5) + "')")), fbmResultSchemas);

  const includeOrder = [
    ['client/schema/screens/view', 'client/screen/viewScreen'],
    ['client/schema/screens/customerForm', 'client/screen/formScreen'],
    ['client/schema/screens/activityForm', 'client/screen/formScreen'],
    ['client/schema/screens/noteForm', 'client/screen/formScreen'],
    ['client/schema/status/common', 'client/screen/statusScreen'],
    ['client/schema/status/budgetBlocked', 'client/screen/statusScreen'],
    ['client/schema/status/loadError', 'client/screen/statusScreen'],
    ['client/schema/status/loadSummary', 'client/screen/statusScreen'],
    ['client/schema/sync/screens/run', 'client/sync/screens/run'],
    ['client/schema/sync/screens/account', 'client/sync/screens/account'],
    ['client/schema/sync/screens/results', 'client/sync/screens/results'],
    ['client/schema/sync/screens/settings', 'client/sync/screens/settings'],
    ['client/schema/sync/screens/index', 'client/sync/fbmSyncShell'],
    ['client/schema/sync/results/status', 'client/sync/fbmSyncStatusScreen'],
    ['client/schema/sync/results/issues', 'client/sync/fbmSyncStatusScreen'],
    ['client/schema/sync/results/audit', 'client/sync/fbmSyncAuditScreen'],
    ['client/schema/sync/results/conflict', 'client/sync/fbmSyncAuditScreen'],
    ['client/sync/fbmSyncUiSchema', 'client/sync/fbmSyncConfigEditor']
  ];
  check(so, 'schema và compatibility bridge được include trước controller sử dụng', includeOrder.filter((pair) => !isBefore(sidebar, pair[0], pair[1])), []);

  const registry = docTep('client/schema/sync/screens/index.html');
  check(so, 'registry FBM trỏ đúng bốn schema màn hình và không có file thất lạc',
    fbmScreens.slice(0, -1).filter((name) => !registry.includes('FBM_SYNC_' + name.slice(0, -5).toUpperCase() + '_SCHEMA')).length,
    0);
}

module.exports = { chay };
