/** Ánh xạ bản ghi FBM sang schema nội bộ của Sheet: nối định danh khách (ID, mã khách, MST), dựng record Customer/Activity kèm dấu vân, nối Activity vào khách cha và giữ trường chỉ thuộc ShinCRM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Chuẩn hóa MST cho phép nối record; giữ dấu gạch chi nhánh nhưng bỏ dấu chấm, phẩy và khoảng trắng. */
FbmSync.customerTaxKey = function (value) {
  return FbmSync.normalize(value).replace(/[.,\s]/g, '');
};
/** Báo MST không thể dùng để nối an toàn vì trùng hoặc dòng đã liên kết. */
FbmSync.customerTaxIdentityIssue = function (localByTaxNumber, incoming) {
  var tax = FbmSync.customerTaxKey(incoming && (incoming.taxNumber || incoming.ma_so_thue));
  var matches = tax && localByTaxNumber && localByTaxNumber[tax] || [];
  if (!matches.length) { return null; }
  if (matches.length !== 1) { return { tax: tax, reason: 'duplicate_tax_number', records: matches }; }
  var record = matches[0];
  if (String(record.fbmId || '').trim() || String(record.fbmCustomerCode || '').trim()) { return { tax: tax, reason: 'already_linked', records: matches }; }
  return null;
};

/** Hợp nhất định danh FBM theo ID, mã khách hoặc MST duy nhất của dòng chưa liên kết. */
FbmSync.findCustomerByIdentity = function (localById, localByCode, incoming, localByTaxNumber) {
  var key = String(incoming && incoming.fbmId || '').trim(), code = String(incoming && incoming.fbmCustomerCode || '').trim();
  if (key && localById[key]) { return localById[key]; }
  if (code && localByCode[code] && localByCode[code].length === 1) { return localByCode[code][0]; }
  var tax = FbmSync.customerTaxKey(incoming && (incoming.taxNumber || incoming.ma_so_thue)), matches = tax && localByTaxNumber && localByTaxNumber[tax] || [];
  if (matches.length === 1 && !String(matches[0].fbmId || '').trim() && !String(matches[0].fbmCustomerCode || '').trim()) { return matches[0]; }
  return null;
};

/** Đổi record Customer FBM sang schema nội bộ của Sheet. Dấu vân FBM tính một lần ở đây trên bản đã đổi, cùng cách tính với dòng trên Sheet; giờ đồng bộ do bên ghi đặt. */
FbmSync.customerRecord = function (fbm, categoryGate) {
  var record = { companyName: fbm.ten_kh || '', taxNumber: fbm.ma_so_thue || '', phone: fbm.dien_thoai || '', email: fbm.email || '', address: fbm.dc_lh || '', province: fbm.ten_dclh_tinh || fbm.dc_lh_tinh || '', website: fbm.website || '', contactPerson: fbm.ong_ba || '', leadSource: fbm.ten_nguon_dm || fbm.nguon_dm || '', fbmSyncPermission: FbmSync.pullDefaultPermission(), fbmCustomerCode: fbm.ma_kh || '', fbmId: fbm.stt_rec_kh || '', syncStatus: FbmSync.SYNC_STATUS.synced };
  record.fbmHash = FbmSync.hash(record, 'customer', categoryGate);
  return record;
};
/** Đổi record Activity FBM sang schema nội bộ của Sheet. Dấu vân tính trên bản đã bỏ dấu `#SC` như dòng trên Sheet; tính trên dòng thô thì giao dịch còn dấu luôn lệch dấu vân. */
FbmSync.activityRecord = function (fbm, categoryGate, parent) {
  var parentCode = fbm.ma_kh || (parent && (parent.ma_kh || parent.maKh)) || '';
  // `customerFbmId` là `stt_rec_kh` của khách vừa đọc, khóa nối khách cha; mã khách `ma_kh` chỉ để hiển thị vì có thể đổi hoặc trùng.
  var details = fbm.details || '', record = { customerId: parentCode, customerFbmCode: parentCode, customerFbmId: String(parent && parent.sttRec || '').trim(), workDate: fbm.end_date || '', taskType: fbm.ten_cv || fbm.ma_cv || '', content: FbmSync.stripActivityMarker(details), markerId: FbmSync.activityMarkerId(details), owner: fbm.owner || '', enteredBy: fbm.owner || '', fbmSyncPermission: FbmSync.pullDefaultPermission(), fbmId: fbm.id || '', syncStatus: FbmSync.SYNC_STATUS.synced };
  record.fbmHash = FbmSync.hash(record, 'activity', categoryGate);
  return record;
};

/** Nối Activity FBM vào mã Customer nội bộ theo `stt_rec_kh` của khách đã đọc (09/05 Phần 9), không qua `ma_kh`. Mã khách cha đứng ngoài dấu vân nên giữ nguyên `fbmHash` lúc dựng. */
FbmSync.linkActivityCustomers = function (records, customers) {
  var byFbm = {}, orphaned = 0, blocked = 0;
  (customers || []).forEach(function (customer) {
    var fbmId = String(customer.fbmId || '').trim();
    if (fbmId) { byFbm[fbmId] = customer; }
  });
  var linked = (records || []).map(function (record) {
    var customerCode = String(record.customerFbmCode || '').trim(), customer = byFbm[String(record.customerFbmId || '').trim()];
    if (!customer) {
      orphaned += 1;
      if (FbmSync.logPullRecord) { FbmSync.logPullRecord('activity', record, null, FbmSync.SYNC_STATUS.skipped, 'Không tìm thấy Customer cha trong ShinCRM.', { issue: true }); }
      return null;
    }
    var parentPermission = FbmSync.syncPermission(customer, 'customer');
    if (!parentPermission.pull) {
      blocked += 1;
      if (FbmSync.logPullRecord) { FbmSync.logPullRecord('activity', record, customer, FbmSync.SYNC_STATUS.skipped, 'Customer cha ' + String(customer.id || '') + ' không cho phép lấy từ FBM: ' + parentPermission.reason, { issue: parentPermission.invalid }); }
      return null;
    }
    return Object.assign({}, record, { customerId: String(customer.id || '').trim(), customerFbmCode: customerCode });
  }).filter(Boolean);
  return { records: linked, orphaned: orphaned, blocked: blocked };
};

/** Giữ trường chỉ thuộc ShinCRM khi FBM trả lại bản ghi đã tồn tại. */
FbmSync.preserveLocalFields = function (entity, current, incoming) {
  var fields = entity === 'customer'
    ? ['note', 'fbmSyncPermission', 'verifyStatus', 'customerGroup', 'searchAliases', 'bidClosingDate']
    : ['fbmSyncPermission', 'contractValue', 'priority', 'dueAt'];
  var merged = Object.assign({}, incoming);
  fields.forEach(function (field) {
    if (current && Object.prototype.hasOwnProperty.call(current, field)) { merged[field] = current[field]; }
    else { delete merged[field]; }
  });
  return merged;
};
