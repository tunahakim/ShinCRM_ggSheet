/** Quyền đồng bộ của một bản ghi: ô "Cho phép đồng bộ FBM", Customer cha, người phụ trách giao dịch. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Bản ghi được đẩy lên và được kéo về hay không, theo ô "Cho phép đồng bộ FBM". So khớp đúng chữ với bảng `FBM_SYNC_PERMISSION_OPTIONS`; ô trống hoặc sai giá trị thì `invalid`: không đẩy nhưng vẫn kéo về (kéo về chỉ ghi vào sheet riêng, sai thì sửa được; đẩy lên ghi vào CRM chung không rút lại được), bên gọi phải cảnh báo kèm mã bản ghi.
 * Activity còn bị chặn theo Customer cha: cha không được đẩy thì con không được đẩy, cha không được kéo thì con không được kéo.
 */
FbmSync.syncPermission = function (record, entity, customer) {
  var value = String(FbmSync.value(record, 'fbmSyncPermission', '')), option = null;
  FBM_SYNC_PERMISSION_OPTIONS.some(function (item) { if (item.value === value) { option = item; } return !!option; });
  if (!option) {
    return { push: false, pull: true, invalid: true, value: value, reason: value.trim() ? 'Ô "Cho phép đồng bộ FBM" có giá trị không hợp lệ "' + value + '".' : 'Ô "Cho phép đồng bộ FBM" đang trống.' };
  }
  var result = { push: option.push, pull: option.pull, invalid: false, value: value, reason: option.push ? '' : 'Bản ghi đang chọn "' + value + '".' };
  if (entity === 'activity' && customer) {
    var parent = FbmSync.syncPermission(customer, 'customer');
    if (result.push && !parent.push) { result.push = false; result.reason = 'Khách hàng cha không cho phép đẩy lên FBM.'; }
    if (result.pull && !parent.pull) { result.pull = false; result.reason = 'Khách hàng cha không cho phép lấy từ FBM.'; }
  }
  return result;
};

/**
 * Bộ lọc "được lấy từ FBM" dùng chung cho bước gắn cờ "không thấy" và bước chọn khách đọc giao dịch (09/02 Phần 3): bản ghi người dùng đã chặn chiều lấy về thì vắng bên FBM cũng không được gắn cờ, không tốn request đọc.
 * Giao dịch kế thừa quyền của khách cha nên tra bảng khách một lần cho cả lượt, không tra lại theo từng dòng.
 */
FbmSync.pullAllowedReader = function (entity) {
  if (entity !== 'activity') { return function (record) { return FbmSync.syncPermission(record, 'customer').pull; }; }
  var byId = {};
  FbmSync.readLocal('customer').forEach(function (customer) { byId[String(customer.id || '').trim()] = customer; });
  return function (record) { return FbmSync.syncPermission(record, 'activity', byId[String(record.customerId || '').trim()]).pull; };
};

/** Activity chỉ được đẩy khi Customer cha đã liên kết đủ hai mã FBM. */
FbmSync.activityParentReady = function (customer) {
  return !!customer && !!String(customer.fbmId || '').trim() && !!String(customer.fbmCustomerCode || '').trim();
};

/**
 * Giao dịch có thuộc tài khoản FBM đang đồng bộ không: `''` khi thuộc, còn lại là câu lỗi. Dùng chung cho phép xét đẩy, bước mở form sửa và nhánh bỏ dấu #SC của chiều lấy.
 * Thiếu tên tài khoản là lỗi, không phải "chưa kết luận": cho qua khi chưa biết tài khoản là có đường đẩy giao dịch của người khác. Giao dịch chưa có người phụ trách (mới tạo ở ShinCRM) thì thuộc tài khoản đang đẩy.
 */
FbmSync.ownerCheck = function (record, accountName) {
  var configured = String(accountName || '').trim(), owner = String(record && record.owner || '').trim();
  if (!configured) { return 'Chưa có tên tài khoản FBM đang đồng bộ nên chưa xác định được người phụ trách giao dịch.'; }
  if (owner && owner !== configured) { return 'Giao dịch thuộc owner FBM "' + owner + '", khác tài khoản FBM đang đăng nhập "' + configured + '".'; }
  return '';
};
