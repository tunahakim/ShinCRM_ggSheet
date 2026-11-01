/**
 * Chuẩn bị hộp cát cho tệp `fbm_sync/`: trên GAS mọi tệp chung một không gian tên nên module đồng bộ luôn thấy bảng quyền, ngầm định kéo, danh tính phiên, cài đặt phạm vi; hộp cát chỉ nạp vài tệp nên cấp bản tối thiểu cho phần chưa nạp. `napServer` ở `load-gas.js` gọi ba móc dưới đây quanh mỗi tệp.
 * `load-gas.js` cần tệp này lúc nạp, nên ở đây đọc `docTep`/`taoHopCat` lúc gọi chứ không lúc nạp (tránh vòng require).
 */
const vm = require('vm');
const docTep = (duongDan) => require('../load-gas').docTep(duongDan);
const taoHopCat = (stubs) => require('../load-gas').taoHopCat(stubs);

/**
 * Trên GAS mọi tệp chung một phạm vi toàn cục, nên module đồng bộ luôn thấy bảng giá trị "Cho phép đồng bộ FBM" khai ở `DataSchema.js`. Hộp cát chỉ nạp vài tệp nên phải cấp riêng bảng đó; chỉ chép đúng hai tên này để không đè `DATA_SCHEMA` giả mà test tự dựng.
 */
function capBangChoPhepDongBo(hopCat) {
  if (hopCat.FBM_SYNC_PERMISSION_OPTIONS) { return; }
  const rieng = taoHopCat({});
  vm.runInContext(docTep('server/data/DataSchema.js'), rieng, { filename: 'server/data/DataSchema.js' });
  hopCat.FBM_SYNC_PERMISSION_OPTIONS = rieng.FBM_SYNC_PERMISSION_OPTIONS;
  hopCat.fbmSyncPermissionValues = rieng.fbmSyncPermissionValues;
}

/** Giá trị Xác thực của khách mới kéo từ FBM trong tệp thử; test cần nhánh khác thì tự gán `FbmSync.pullDefaults` hoặc nạp `fbm_sync/state/PullDefaults.js` thật. */
const XAC_THUC_MAC_DINH_THU = 'Chưa xác thực';

/**
 * Tệp thật luôn có ngầm định kéo từ FBM (preflight chặn khi thiếu), nên hộp cát chỉ nạp vài tệp đồng bộ được cấp sẵn `FbmSync.pullDefaults` trả Xác thực thử và một `categoryReadAll` rỗng cho chỗ gọi nó. Hộp đã có hàm thật hoặc tự gán thì giữ nguyên; nạp `PullDefaults.js` sau thì bản thật thay vào.
 */
function capNgamDinhKeoThu(hopCat) {
  const F = hopCat.FbmSync;
  if (!F) { return; }
  if (typeof F.pullDefaults !== 'function') { F.pullDefaults = (entity) => (entity === 'customer' ? { verifyStatus: XAC_THUC_MAC_DINH_THU } : {}); }
  if (typeof hopCat.categoryReadAll !== 'function') { hopCat.categoryReadAll = () => ({}); }
}

/** Mã người dùng FBM thử; test cần nhánh thiếu mã thì tự gán `scriptSettings`. */
const MA_NGUOI_DUNG_THU = '2037';
/** Giá trị Extension bắt từ trang FBM thử (`transport.captures`), khớp liên kết thử 2037 / Le Tuan Anh mà các test hay lưu; response probe hay grid User giả phải mang theo, vì GAS so liên kết với cả grid lẫn trang. */
const TRANG_FBM_THU = { payloadCookie: '461020379855cFHN_CRM_App', pageUserId: '2037', pageAccountName: 'Le Tuan Anh' };

/**
 * Tệp thật chỉ dựng request đọc khách sau khi phiên đã xác minh (cổng phát request chèn probe User trước), nên mã người dùng của điều kiện quyền luôn có. Nhiều test dựng request trực tiếp, không qua probe, nên nguồn danh tính phiên (`sessionVerifiedIdentity`) được cấp mã thử khi trống.
 * Chỉ bọc nguồn, không bọc `scriptSettings`: test nào đi qua probe thật thì mã của grid User đi thẳng vào request. Cổng vẫn đọc `sessionIdentityIsVerified` thật, nên test nào kiểm "phiên chưa xác minh phải probe trước" vẫn thấy đúng hành vi.
 */
function capPhienThu(hopCat) {
  const F = hopCat.FbmSync;
  if (!F) { return; }
  // Hộp cát chỉ nạp tệp dựng request, không nạp cổng phiên (TransportCore): cấp danh tính thử tối thiểu; nạp TransportCore sau thì hàm thật thay vào và được bọc lại.
  if (typeof F.sessionVerifiedIdentity !== 'function') { const gia = () => ({ userId: MA_NGUOI_DUNG_THU, username: '', accountName: '' }); gia.laBanThu = true; F.sessionVerifiedIdentity = gia; return; }
  if (F.sessionVerifiedIdentity.laBanThu) { return; }
  const goc = F.sessionVerifiedIdentity;
  const thu = function () {
    const value = goc.apply(this, arguments);
    if (!value.userId) { value.userId = MA_NGUOI_DUNG_THU; }
    return value;
  };
  thu.laBanThu = true;
  F.sessionVerifiedIdentity = thu;
}

/**
 * Dấu lần đẩy sạch đọc sổ nạp lại, cài đặt phạm vi và tài khoản đã liên kết; trên GAS ba thứ đó luôn có. Hộp chỉ nạp chặng đẩy thì cấp bản trung tính cho cài đặt và sổ (không giới hạn phạm vi, sổ ở 0); hộp nạp tệp thật hoặc tự gán thì dùng bản của nó.
 */
function capDauDaySach(hopCat) {
  const F = hopCat.FbmSync;
  if (typeof F.syncSettingsRead !== 'function') { F.syncSettingsRead = () => ({ approvalThreshold: 10, scopeLimited: false, scopeCodes: [] }); }
  // Tài khoản đã liên kết đọc bằng hàm thật của Identity.js (kho trống thì chưa liên kết); không cấp hàm giả để hàm bị đổi tên là test hỏng ngay.
  if (typeof F.boundIdentity !== 'function') { vm.runInContext(docTep('fbm_sync/reconcile/Identity.js'), hopCat, { filename: 'fbm_sync/reconcile/Identity.js' }); }
  if (typeof hopCat.reloadJournalRead !== 'function') { hopCat.reloadJournalRead = () => ({ rev: 0 }); }
}

/** Khung lượt đồng bộ FBM (ô lượt, mở/đóng lượt, cờ dừng, khung lát): gần như mọi hộp đồng bộ đều nạp đủ bộ này, theo đúng thứ tự. */
const TEP_KHUNG_LUOT = ['fbm_sync/state/State.js', 'fbm_sync/state/Run.js', 'fbm_sync/state/RunStop.js', 'fbm_sync/state/Slice.js'];

/** Trước khi chạy một tệp: tệp đồng bộ cần bảng quyền; `Identity.js` đọc liên kết qua cửa JSON của kho trong `State.js` (bản thật luôn có). */
function capTruocTep(hopCat, duongDan, duongDans) {
  if (duongDan.indexOf('fbm_sync/') === 0) { capBangChoPhepDongBo(hopCat); }
  if (duongDan === 'fbm_sync/reconcile/Identity.js' && !(hopCat.FbmSync && typeof hopCat.FbmSync.documentPropertyJson === 'function') && duongDans.indexOf('fbm_sync/state/State.js') < 0) {
    vm.runInContext(docTep('fbm_sync/state/State.js'), hopCat, { filename: 'fbm_sync/state/State.js' });
  }
}

/** Sau khi chạy một tệp: ngầm định kéo cho mọi tệp đồng bộ, danh tính phiên thử cho tệp dựng request. */
function capSauTep(hopCat, duongDan) {
  if (duongDan.indexOf('fbm_sync/') === 0) { capNgamDinhKeoThu(hopCat); }
  if (duongDan === 'fbm_sync/transport/TransportCore.js' || duongDan === 'fbm_sync/read/GridRead.js') { capPhienThu(hopCat); }
}

/** Sau cả lần nạp: hộp có chặng đẩy thì cấp phần dấu lần đẩy sạch cần. */
function capSauNap(hopCat, duongDans) {
  if (duongDans.indexOf('fbm_sync/transport/PushFlow.js') >= 0) { capDauDaySach(hopCat); }
}

module.exports = { capTruocTep, capSauTep, capSauNap, TEP_KHUNG_LUOT, TRANG_FBM_THU };
