/** Danh sách tệp giao diện Sidebar Đồng bộ FBM (schema màn, khung, màn con) để các ca kiểm tĩnh đọc chung một danh sách, thêm màn mới chỉ sửa ở đây. */

const { docTep } = require('../load-gas');

const TEP_DONG_BO = [
  'client/schema/sync/screens/run.html',
  'client/schema/sync/screens/account.html',
  'client/schema/sync/screens/results.html',
  'client/schema/sync/screens/settings.html',
  'client/schema/sync/screens/index.html',
  'client/sync/fbmSyncUiSchema.html',
  'client/sync/fbmSyncConfigEditor.html',
  'client/sync/fbmSyncShell.html',
  'client/sync/fbmSyncStatusScreen.html',
  'client/sync/fbmSyncSettingsScreen.html',
  'client/sync/fbmSyncAuditScreen.html',
  'client/sync/fbmSync.html',
  'client/sync/screens/account.html',
  'client/sync/screens/run.html',
  'client/sync/screens/results.html',
  'client/sync/screens/settings.html'
];

/** Nguồn từng tệp theo tên (`source`) và nguồn gộp (`all`). */
function nguonDongBo() {
  const source = Object.fromEntries(TEP_DONG_BO.map((file) => [file, docTep(file)]));
  return { source, all: Object.values(source).join('\n') };
}

module.exports = { TEP_DONG_BO, nguonDongBo };
