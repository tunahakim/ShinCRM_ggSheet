/**
 * Dựng trên Sheet DEV ca "lệnh tạo mất phản hồi" (FBM-027) mà không phải canh đóng tab FBM đúng lúc: đặt dòng về đúng dấu lượt đẩy để lại khi mất phản hồi ("đang đẩy", chưa có ID FBM, `syncedAt` đã qua khoảng chờ). Lượt "Chỉ đẩy" kế tiếp phải tra theo khóa rồi mới nối hoặc tạo lại.
 * Chỉ dùng khách ALT00010. Khách: FBM đã có ALT00010 nên lượt đẩy phải nối lại đúng ID cũ theo MST, không gửi lệnh tạo. Giao dịch: dòng mới chưa từng lên FBM nên lượt đẩy tra không thấy dấu `#SC` và tạo đúng một giao dịch.
 */

/** Khách ALT00010 trên Sheet DEV; không có thì ném để người chạy biết, không dựng nửa chừng. */
function fbmRecoverAltCustomer() {
  var customer = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === 'ALT00010' && String(record.recordStatus || 'active') !== 'deleted'; })[0];
  if (!customer) { throw new Error('Chưa có khách ALT00010 trên Sheet DEV.'); }
  return customer;
}

/** Mốc `syncedAt` đã qua khoảng chờ tra lại, để lượt kế tiếp tra ngay. */
function fbmRecoverPastWait() {
  return new Date(Date.now() - (FbmSync.BUDGET.recoverWaitMinutes + 5) * 60000);
}

/** Dựng khách ALT00010 thành lệnh tạo mất phản hồi. Mã ShinCRM của khách được thêm vào phạm vi để chiều đẩy còn thấy dòng khi cột mã FBM đã trống. Trả ID và mã FBM cũ để so sau lượt. */
function fbmSeedStuckCustomer() {
  var customer = fbmRecoverAltCustomer(), codes = settingsValue(FbmSync.SETTING_SECTIONS.run, 'scopeCodes') || [];
  if (!String(customer.taxNumber || '').trim()) { throw new Error('Khách ALT00010 trên DEV chưa có MST, không thử tra lại được.'); }
  fbmDevSetTestCodes(codes.indexOf(customer.id) >= 0 ? codes : codes.concat([customer.id]));
  fbmFixtureSave('customer', [{ id: customer.id, fbmId: '', fbmCustomerCode: '', fbmHash: '', syncStatus: FbmSync.SYNC_STATUS.pushing, syncedAt: fbmRecoverPastWait() }], 'pull');
  return { ok: true, id: customer.id, expectFbmId: customer.fbmId, expectFbmCustomerCode: customer.fbmCustomerCode, taxNumber: customer.taxNumber };
}

/** Dựng một giao dịch mới của ALT00010 ở dấu mất phản hồi (chép trường nghiệp vụ từ một giao dịch đã có ID FBM). */
function fbmSeedStuckActivity() {
  var customer = fbmRecoverAltCustomer();
  var source = FbmSync.readLocal('activity').filter(function (record) { return String(record.customerId || '') === String(customer.id) && String(record.fbmId || '').trim() && String(record.recordStatus || 'active') !== 'deleted'; })[0];
  if (!source) { throw new Error('ALT00010 chưa có Activity mang ID FBM để chép trường.'); }
  var created = {};
  Object.keys(source).forEach(function (key) { if (['id', 'fbmId', 'fbmHash', 'syncStatus', 'syncedAt'].indexOf(key) < 0) { created[key] = source[key]; } });
  created.id = ''; created.recordStatus = 'active';
  created.content = 'Thử mất phản hồi ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM HH:mm');
  created.syncStatus = FbmSync.SYNC_STATUS.pushing; created.syncedAt = fbmRecoverPastWait();
  var saved = fbmFixtureSave('activity', [created], 'pull');
  return { ok: true, ids: saved.recordIds, content: created.content };
}

/** Báo trạng thái khách ALT00010 và các giao dịch thử mất phản hồi sau lượt, rồi bỏ mã ShinCRM của khách khỏi phạm vi khi khách đã có lại mã FBM. Chỉ đọc FBM qua Sheet, không gửi request. */
function fbmCheckStuckCreate() {
  var codes = settingsValue(FbmSync.SETTING_SECTIONS.run, 'scopeCodes') || [], scope = codes;
  // Khách thử có thể đang trống mã FBM, nên tìm theo mã ShinCRM trong phạm vi hoặc mã ALT00010.
  var customer = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === 'ALT00010' || codes.indexOf(record.id) >= 0; })[0] || null;
  var activities = FbmSync.readLocal('activity').filter(function (record) { return String(record.content || '').indexOf('Thử mất phản hồi') === 0 && String(record.recordStatus || 'active') !== 'deleted'; });
  if (customer && String(customer.fbmCustomerCode || '').trim() === 'ALT00010' && codes.indexOf(customer.id) >= 0) { scope = fbmDevSetTestCodes(codes.filter(function (code) { return code !== customer.id; })); }
  return {
    customer: customer && { id: customer.id, fbmId: customer.fbmId, fbmCustomerCode: customer.fbmCustomerCode, syncStatus: customer.syncStatus, fbmHash: customer.fbmHash ? 'có' : 'rỗng' },
    activities: activities.map(function (record) { return { id: record.id, fbmId: record.fbmId, syncStatus: record.syncStatus, content: record.content }; }),
    scope: scope
  };
}
