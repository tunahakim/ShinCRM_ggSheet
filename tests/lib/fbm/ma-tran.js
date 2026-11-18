/**
 * Khung dùng chung của các ca ma trận FBM-0xx (kéo, đẩy, xung đột, kho thuộc tính): bản ghi mẫu, lưới FBM đi qua executor thật và hộp đã có ba khách xung đột. Mỗi ca tự dựng hộp từ đây, không dựa thứ tự chạy của ca khác.
 */
const { luoiDaCat } = require('./tab-fbm-gia');
const { datState } = require('./dat-state');
const { makeSync } = require('./hang-day');
const { keoVe } = require('./keo-ve');

/** Cổng danh mục rỗng: dấu vân bắt buộc có cổng, bản ghi mẫu không có giá trị danh mục cần đổi mã. */
const NO_CATEGORY = { map: {} };

/** Lưới user FBM trả cho câu hỏi phiên: đúng tài khoản liên kết của hộp thử (2037, ANHLT, Le Tuan Anh). */
const USER_BODY = '{"d":{"TotalRowCount":1,"Rows":[[2037,"ANHLT","Le Tuan Anh"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}';

/** Cổng danh mục chỉ cho tỉnh Hà Nội, đủ để bản ghi mẫu qua cổng khi kéo về. */
const CONG_HA_NOI = { map: {}, names: {}, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true } }, warnings: [] };

/** Cột lưới khách FBM mà ca xung đột và ca tra MST dựng dòng theo tên. */
const COT_LUOI_KHACH = ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ten_cv', 'ngay_gd', 'datetime0', 'xorder'];

/** Lưới FBM đủ cột (dòng là đối tượng theo tên cột) đi qua executor thật để cắt đúng cột GAS cần; `requestId` gắn vết như cửa relay. */
async function luoiTheoTen(F, entity, fields, rows, requestId) {
  const cut = await luoiDaCat(F, entity, fields, rows.map((row) => fields.map((field) => row[field] === undefined ? '' : row[field])));
  // Có mã request thì trả nguyên phong bì Extension gửi về, để response đi qua `continue` như lát thật.
  return requestId === undefined ? JSON.parse(cut.body) : { ok: true, status: 200, body: cut.body, transport: { contract: F.protocol.contract, trace: [{ requestId, stage: 'fetch' }] } };
}

function khachMau(id, code, name) {
  return { fbmId: id, fbmCustomerCode: code, companyName: name, taxNumber: '010000' + code.slice(-2), phone: '0900000000', email: code.toLowerCase() + '@example.test', address: 'Hà Nội', province: 'Hà Nội', contactPerson: 'Người liên hệ', leadSource: '', product: '', fbmSyncPermission: 'Cho phép', syncStatus: 'đã đồng bộ' };
}

function giaoDichMau(id, customerCode, content) {
  return { fbmId: id, customerFbmCode: customerCode, customerFbmId: 'FBM-C' + Number(customerCode.slice(3)), workDate: '2026-09-19', taskType: 'Gọi điện', content, owner: 'Le Tuan Anh', fbmSyncPermission: 'Cho phép', syncStatus: 'đã đồng bộ' };
}

/** Dòng khách thô như FBM trả về trong lưới. */
function dongKhachFbm(id, code, name) {
  return { stt_rec_kh: id, ma_kh: code, ten_kh: name, ma_so_thue: '010000' + code.slice(-2), ong_ba: 'Người liên hệ', dc_lh: 'Hà Nội', dien_thoai: '0900000000', email: code.toLowerCase() + '@example.test', ten_dclh_tinh: 'Hà Nội' };
}

/** Lưới khách của ca xung đột: response mang `requestId` để đi qua `continue`. */
function luoiKhachXungDot(F, requestId, rows) {
  return luoiTheoTen(F, 'customer', COT_LUOI_KHACH, rows, requestId);
}

/** Lệnh chốt xung đột qua cổng lệnh `confirm_conflict`, giữ thứ tự tham số cũ cho dễ đọc ca. */
function chotXungDot(F, entity, id, choice, merged, fbmValues, shinValues, snapshot) {
  return F.runConflictConfirmCommand({ entity, id, choice, merged, fbmValues, shinValues, snapshot });
}

/** Giá trị FBM (bên phải) và ShinCRM (bên trái) các trường lệch của DTO xung đột, đúng thứ Sidebar gửi lại khi chốt. */
const giaTriFbmCua = (dto) => Object.fromEntries(((dto && dto.fields) || []).map((item) => [item.field, item.right]));
const giaTriShinCua = (dto) => Object.fromEntries(((dto && dto.fields) || []).map((item) => [item.field, item.left]));

/** Phiên xong và đã xác minh danh tính: điều kiện để mở chế độ xung đột. */
function phienXongDaXacMinh(F) {
  const done = F.runOpen({ phase: 'checking_session' });
  done.phase = 'done'; F.stateWrite(done);
  datState(F, { session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
}

/**
 * Lệnh mở xung đột như Sidebar chạy nó: lệnh mở một lượt mới nên cổng phiên hỏi phiên trước; hộp được liên kết tài khoản 2037 và câu hỏi phiên được trả bằng đúng tài khoản đó rồi trả kết quả mở kèm request đọc bản ghi xung đột (`probe` là request hỏi phiên, nếu có).
 */
function moXungDot(F) {
  F.bindingRead = () => ({ spreadsheetId: F.currentSpreadsheetId(), userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  const opened = F.runSlice(() => F.runConflictOpenCommand());
  if (!opened.request || opened.request.meta.kind !== 'session_probe') { return opened; }
  const reply = { ok: true, status: 200, body: USER_BODY, transport: { contract: F.protocol.contract, trace: [{ requestId: opened.request.id, stage: 'fetch' }], captures: { pageUserId: '2037', pageAccountName: 'Le Tuan Anh' } } };
  const next = F.runSlice(() => F.continue(reply));
  return Object.assign({}, opened, { probe: opened.request, request: next.request, sessionReply: next });
}

/** Hộp có `ids.length` khách đã kéo về với tên gốc, rồi đổi tên Shin trên Sheet và kéo lại tên FBM khác: mọi dòng ở "xung đột chờ quyết". */
function dungXungDot(ids, tenFbm) {
  const run = makeSync(), F = run.hop.FbmSync;
  const state = F.runOpen({ phase: 'pull_customer' });
  state.mode = 'read'; F.readCategoryGate = () => CONG_HA_NOI; F.stateWrite(state);
  keoVe(F, 'customer', ids.map((n) => F.customerRecord(dongKhachFbm('F-' + n, 'ALT0000' + n, 'Tên gốc ' + n), NO_CATEGORY)));
  run.local.customer.forEach((row) => { row.companyName = 'Tên Shin ' + row.fbmCustomerCode.slice(-1); });
  const pull = keoVe(F, 'customer', ids.map((n) => F.customerRecord(dongKhachFbm('F-' + n, 'ALT0000' + n, (tenFbm || 'Tên FBM ') + n), NO_CATEGORY)));
  return { run, F, pull };
}

module.exports = { NO_CATEGORY, CONG_HA_NOI, COT_LUOI_KHACH, luoiTheoTen, khachMau, giaoDichMau, dongKhachFbm, luoiKhachXungDot, chotXungDot, giaTriFbmCua, giaTriShinCua, phienXongDaXacMinh, dungXungDot, moXungDot };
