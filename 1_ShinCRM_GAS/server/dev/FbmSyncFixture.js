/** Chuẩn bị Sheet DEV cho live test ALT00010; không xóa dữ liệu hay gửi request FBM. */
function fbmPrepareAltTest() {
  if (typeof fbmEnsureSyncColumns === 'function') { fbmEnsureSyncColumns(); }
  var cases = [
    'Đọc phiên Customer/Activity qua Extension; chỉ nhận ALT00010.',
    'Nhập bốn danh mục live vào Category và bỏ qua mã companion giả.',
    'Kéo Customer về Customer, giữ nguyên ghi chú nội bộ.',
    'Kéo Activity về Activity và nối đúng Customer.id nội bộ.',
    'Không đổi dữ liệu: hash ba chiều phải giữ trạng thái đã đồng bộ.',
    'Đổi một trường Customer được phép: đẩy sửa lên FBM, không gửi ghi chú nội bộ.',
    'Tạo một Activity mới thuộc ALT00010 và kiểm tra dấu #SC-.',
    'Đổi đồng thời hai phía: ghi conflict, không ghi đè im lặng.',
    'Đang sửa trên Sidebar: bản ghi bị hoãn, không ghi đè bản nháp.',
    'Lỗi HTTP/Bugs/Extension: giải phóng khóa và ghi lỗi vào Log.',
    'Xác nhận không phát sinh request xóa.'
  ];
  if (typeof logEvent === 'function' && typeof flushLog === 'function') {
    logEvent({ source: 'fbm_sync', action: 'prepare_test', outcome: LOG_OK, entity: 'customer', recordId: 'ALT00010', reason: 'Chuẩn bị live test; chỉ giới hạn mã ALT00010.', detail: { cases: cases } });
    flushLog();
  }
  return { ok: true, customerCode: 'ALT00010', deleted: false, writesToFbm: 0, cases: cases };
}

var FBM_FAKE_DELETED_CODE = 'ALTFAKE01';
/** Dò luồng "mã bị xóa" (FBM-048): nhân bản khách ALT00010 thành dòng mang ID/mã FBM không tồn tại và tạm thu phạm vi live về mã giả. Chỉ đọc form FBM, không ghi FBM. */
function fbmSeedFakeDeletedCustomer() {
  var source = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === 'ALT00010'; })[0];
  if (!source) { return { ok: false, reason: 'Chưa có khách ALT00010 trên Sheet DEV.' }; }
  var existing = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === FBM_FAKE_DELETED_CODE; })[0];
  var fake = {};
  Object.keys(source).forEach(function (key) { if (key !== 'id') { fake[key] = source[key]; } });
  fake.id = existing ? existing.id : '';
  fake.companyName = 'Khách giả mã FBM đã xóa';
  fake.fbmId = 'A999999999'; fake.fbmCustomerCode = FBM_FAKE_DELETED_CODE;
  fake.fbmHash = 'baseline-gia'; fake.syncStatus = FbmSync.SYNC_STATUS.synced; fake.recordStatus = 'active';
  var saved = FbmSync.sheetSave('customer', [fake], 'pull');
  PropertiesService.getDocumentProperties().setProperty('FBM_SYNC_TEST_CUSTOMER_CODE', FBM_FAKE_DELETED_CODE);
  return { ok: true, recordIds: saved.recordIds, scope: FBM_FAKE_DELETED_CODE };
}
/** Kết thúc dò mã bị xóa: xóa mềm dòng giả (có ID FBM nên không xóa cứng được) và trả phạm vi live về mặc định ALT00010. */
function fbmEndFakeDeletedCustomer() {
  var fakes = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === FBM_FAKE_DELETED_CODE; });
  if (fakes.length) { FbmSync.sheetSave('customer', fakes.map(function (record) { return { id: record.id, recordStatus: 'deleted' }; }), 'pull'); }
  PropertiesService.getDocumentProperties().deleteProperty('FBM_SYNC_TEST_CUSTOMER_CODE');
  return { ok: true, softDeleted: fakes.map(function (record) { return record.id + ': ' + record.syncStatus; }), scope: FbmSync.scriptSettings().testCustomerCode };
}
/** Dò luồng xung đột (G10.7): sửa Website của ALT00010 bên ShinCRM và thay baseline bằng giá trị giả, nên lượt kéo thấy cả hai phía khác baseline và khác nhau. Không ghi FBM. */
function fbmSeedConflict() {
  var source = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === 'ALT00010' && String(record.recordStatus || 'active') !== 'deleted'; })[0];
  if (!source) { return { ok: false, reason: 'Chưa có khách ALT00010 trên Sheet DEV.' }; }
  var website = 'Website xung đột ShinCRM ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'HH:mm');
  FbmSync.sheetSave('customer', [{ id: source.id, website: website, fbmHash: 'baseline-gia-xung-dot', syncStatus: FbmSync.SYNC_STATUS.pending }], 'pull');
  return { ok: true, id: source.id, website: website };
}
