/**
 * Đồ dùng chung của các hàm dò reload trên DEV: chụp và trả lại thuộc tính tài liệu, ghi một dòng báo cáo và ném khi ca hỏng.
 */

/** Không khôi phục sổ nạp lại và mốc view: sổ chỉ ghi thêm, trả về bản cũ thì Sidebar đang mở nhớ revision lớn hơn và bỏ lỡ thay đổi; dòng thừa của fixture chỉ làm Sidebar nạp thêm một lần. */
function reloadProbePropKeys() {
  return [VIEW_LEDGER_KEY];
}

function reloadProbeSnapshotProperties(keys) {
  var props = documentProps();
  var snapshot = {};
  keys.forEach(function (key) { snapshot[key] = props.getProperty(key); });
  return snapshot;
}

function reloadProbeRestoreProperties(snapshot) {
  var props = documentProps();
  Object.keys(snapshot || {}).forEach(function (key) {
    if (snapshot[key] === null || snapshot[key] === undefined) { props.deleteProperty(key); }
    else { props.setProperty(key, snapshot[key]); }
  });
}

/** Ghi `DAT`/`LOI` vào báo cáo; ca hỏng thì ném để hàm dò dừng và dọn fixture ngay. */
function reloadProbeAssert(report, label, condition, detail) {
  report.push((condition ? 'DAT' : 'LOI') + ' | ' + label + (detail ? ' | ' + detail : ''));
  if (!condition) { throw new Error(label + (detail ? ': ' + detail : '')); }
}
