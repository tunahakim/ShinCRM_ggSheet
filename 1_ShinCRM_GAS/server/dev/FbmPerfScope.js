/**
 * Dựng phạm vi và dữ liệu cho phiên đo của `FbmPerfProbe.js`: thu phạm vi đồng bộ về vài khách thử, xóa vài dòng Activity để lượt Lấy đi nhánh ghi Sheet, chỉnh múi giờ tệp DEV. Chỉ DEV; dùng chung bộ nhớ Cache và thời hạn của bộ đo.
 */

/** Phạm vi đo có giới hạn: giới hạn phạm vi với tối đa `FbmSync.SCOPE_CODES_MAX` mã FBM (`fbmCustomerCode`); khách đã ghép cặp thì GAS tự đổi ra cả mã ShinCRM cho chiều ghi. Ưu tiên khách đã có giao dịch trong Sheet Activity để đo cả nhánh ghi Sheet, bù bằng khách cuối Sheet Customer đã có FBM ID. Chỉ đọc FBM nên an toàn; cất cài đặt cũ để `fbmPerfTestScopeOff` trả lại. */
function fbmPerfTestScopeOn() {
  var before = FbmSync.syncSettingsRead(), codes = [], withActivity = {};
  FbmSync.readLocal('activity').forEach(function (record) { var id = String(record.customerId || '').trim(); if (id) { withActivity[id] = true; } });
  var customers = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmId || '').trim() && FbmSync.SCOPE_CODE_PATTERN.test(String(record.fbmCustomerCode || '').trim()); });
  var ordered = customers.filter(function (record) { return withActivity[String(record.id || '').trim()]; }).concat(customers.slice().reverse());
  ordered.forEach(function (record) {
    var id = String(record.fbmCustomerCode).trim();
    if (codes.length < FbmSync.SCOPE_CODES_MAX && codes.indexOf(id) < 0) { codes.push(id); }
  });
  if (!fbmPerfCache().get('FBM_PERF_PREVIOUS_SETTINGS')) { fbmPerfCache().put('FBM_PERF_PREVIOUS_SETTINGS', JSON.stringify({ scopeLimited: before.scopeLimited, scopeCodes: before.scopeCodes }), FBM_PERF_TTL_SECONDS); }
  var saved = FbmSync.syncSettingsSave({ scopeLimited: true, scopeCodes: codes });
  return saved.ok ? 'Đã giới hạn phạm vi ' + codes.length + ' mã FBM (' + Object.keys(withActivity).length + ' khách có giao dịch trong Sheet).' : 'LỖI ' + saved.code + ': ' + saved.message;
}
function fbmPerfTestScopeOff() {
  var raw = fbmPerfCache().get('FBM_PERF_PREVIOUS_SETTINGS');
  if (!raw) { return 'Không còn bản cài đặt cũ trong Cache; hãy sửa phạm vi đồng bộ bằng tay ở Sidebar.'; }
  var saved = FbmSync.syncSettingsSave(JSON.parse(raw));
  return saved.ok ? 'Đã trả phạm vi đồng bộ và danh sách khách chỉ định về như trước khi đo.' : 'LỖI ' + saved.code + ': ' + saved.message;
}

/** Số dòng Activity của khách thử bị xóa khỏi Sheet DEV để lượt Lấy kế tiếp đi nhánh ghi giao dịch mới (`fbmPerfDropScopeActivities`). */
var FBM_PERF_DROP_ACTIVITY_ROWS = 10;

/**
 * Chuẩn bị đo nhánh ghi Sheet mà không tạo giao dịch thật trên FBM: xóa vài dòng Activity đã liên kết FBM của khách trong phạm vi thử khỏi Sheet DEV; lượt "Lấy từ FBM → ShinCRM" kế tiếp thấy chúng là giao dịch mới và ghi lại.
 * Chỉ chạy khi phạm vi đồng bộ đang giới hạn (gọi `fbmPerfTestScopeOn` trước). Xóa từ dưới lên để vị trí dòng phía trên không dịch.
 */
function fbmPerfDropScopeActivities() {
  var scope = FbmSync.scope(), customers = {};
  if (!scope || !scope.shin.length) { return 'LỖI: phạm vi chưa giới hạn vào khách có trên Sheet; chạy fbmPerfTestScopeOn trước.'; }
  FbmSync.readLocal('customer').forEach(function (customer) { customers[String(customer.id || '')] = customer; });
  var targets = {}, picked = 0;
  FbmSync.readLocal('activity').forEach(function (record) {
    var fbmId = String(record.fbmId || '').trim(), customer = customers[String(record.customerId || '')];
    if (picked < FBM_PERF_DROP_ACTIVITY_ROWS && fbmId && customer && FbmSync.inScope(customer, scope)) { targets[fbmId] = true; picked += 1; }
  });
  var sheet = shinOpenSheet('Activity'), columns = readColumnMap('Activity'), at = columnIndex(columns, '@ACT_FBM_ID');
  var count = sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW), values = count ? sheet.getRange(SHEET_FIRST_DATA_ROW, at, count, 1).getValues() : [], rows = [];
  values.forEach(function (row, index) { if (targets[String(row[0] || '').trim()]) { rows.push(SHEET_FIRST_DATA_ROW + index); } });
  rows.reverse().forEach(function (row) { sheet.deleteRow(row); });
  return 'Đã xóa ' + rows.length + ' dòng Activity của khách thử khỏi Sheet DEV (FBM ID: ' + Object.keys(targets).join(', ') + ').';
}

/** Đặt múi giờ tệp Sheet DEV trùng múi giờ script để đổi ô ngày đi đường nhanh (`dateTextLocal`); chỉ đổi khi hai múi giờ cùng giờ ở các mốc thử, không thì báo và giữ nguyên. */
function fbmDevAlignSheetTimezone() {
  var book = shinOpenBook(), before = book.getSpreadsheetTimeZone(), script = Session.getScriptTimeZone();
  if (before === script) { return 'Múi giờ tệp đã trùng script: ' + script; }
  var moc = [new Date(Date.UTC(1976, 0, 1)), new Date(Date.UTC(1999, 0, 1)), new Date(Date.UTC(2026, 6, 1))], lech = moc.filter(function (d) { return Utilities.formatDate(d, before, 'Z') !== Utilities.formatDate(d, script, 'Z'); });
  if (lech.length) { return 'Không đổi: ' + before + ' và ' + script + ' khác giờ ở ' + lech.length + ' mốc thử.'; }
  book.setSpreadsheetTimeZone(script);
  return 'Đã đổi múi giờ tệp từ ' + before + ' sang ' + book.getSpreadsheetTimeZone();
}
