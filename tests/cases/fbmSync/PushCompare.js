/** So ba bản trước khi lưu FBM (`09/04` "So trước khi đẩy"): hash form bằng hash lưới, và bước mở form không ghi đè bản FBM đã đổi sau mốc. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer, giuBanGhiDongBo, soBan } = require("../../lib/load-gas");

const TEP = ['fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/write/SheetSave.js'];

/** Danh mục như trên Sheet Category: lưới FBM trả tên, form trả mã. */
const GATE = { map: { '@CAT_TINH_THANH\u001fHà Nội': 'HNI', '@CAT_NGUON_KH\u001fKhách tự tìm': 'KDTUTIM', '@CAT_CONG_VIEC\u001fGọi điện': 'GD' } };

function taoHop() {
  const props = { data: {} };
  const api = { getProperty: (key) => props.data[key] || null, setProperty: (key, value) => { props.data[key] = String(value); }, deleteProperty: (key) => { delete props.data[key]; } };
  const logs = [];
  const hop = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {}, PropertiesService: { getDocumentProperties: () => api, getScriptProperties: () => api }, writeGateSave: () => ({ ok: true }), logEvent: (event) => { logs.push(event); } });
  napServer(hop, ...TEP);
  hop.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  hop.FbmSync.scriptSettings = () => ({ accountName: 'Owner', baseUrl: 'https://fbm.test', customerAuthorized: '1.test', activityAuthorized: '1.test' });
  hop.FbmSync.pushLookupDue = () => false;
  hop.FbmSync.validatePushCategories = () => [];
  hop.FbmSync.pushEligibilityErrors = () => [];
  hop.FbmSync.stateCategoryGate = () => GATE;
  hop.logs = logs;
  return hop;
}

/** Response mở form sửa Customer như FBM trả: mảng Row theo vị trí, danh mục là mã. */
function formKhach(v) {
  const row = []; row[0] = v.stt_rec_kh; row[3] = v.ma_kh; row[4] = v.ten_kh; row[8] = v.ma_so_thue; row[9] = v.ong_ba; row[11] = v.dien_thoai; row[13] = v.email; row[14] = v.website; row[22] = v.nguon_dm; row[24] = v.dc_lh; row[25] = v.dc_lh_tinh;
  return { d: { Row: row, Showing: "_ticket = 'ticket-1';" } };
}
/** Response mở form sửa Activity: ngày là Date đã qua `fbDate`, công việc là mã. */
function formGiaoDich(v) {
  const row = []; row[0] = v.id; row[3] = v.ma_cv; row[10] = v.end_date; row[15] = v.details; row[21] = v.owner;
  return { d: { Controller: 'zccrAccountTask', Row: row, Showing: "_ticket = 'ticket-1';" } };
}

async function chay(so) {
  section("FBM sync — so ba bản trước khi đẩy");
  const hop = taoHop(), F = hop.FbmSync;

  // 1. Hash tính từ form phải bằng hash tính từ lưới cho cùng một bản FBM; lệch thì mọi lần đẩy thành xung đột giả.
  const khachFbm = { stt_rec_kh: 'A000050753', ma_kh: 'ALT00010', ten_kh: 'Test', ma_so_thue: '00', ong_ba: 'Tên người liên hệ test', dien_thoai: '0000000000', email: 'Email test', website: 'Website test', nguon_dm: 'KDTUTIM', dc_lh: 'Địa chỉ\r\ndòng hai ', dc_lh_tinh: 'HNI' };
  const khachForm = F.verifyFormValues(formKhach(khachFbm), 'customer');
  const khachFields = F.GRID_FIELDS.customer.slice(), khachRow = khachFields.map(() => '');
  const datKhach = (name, value) => { khachRow[khachFields.indexOf(name)] = value; };
  ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dien_thoai', 'email', 'website'].forEach((name) => datKhach(name, khachFbm[name]));
  datKhach('dc_lh', 'Địa chỉ\ndòng hai'); datKhach('ten_dclh_tinh', 'Hà Nội'); datKhach('ten_nguon_dm', 'Khách tự tìm');
  const khachLuoi = F.rowsToRecords('customer', { d: { Fields: khachFields.map((Name) => ({ AliasName: Name })), Rows: [khachRow], TotalRowCount: 1 } }).rows[0];
  const khachSheet = Object.assign({ id: 'CUS-000010' }, F.customerRecord(khachLuoi, GATE));
  check(so, 'Khách: hash từ form mở sửa = hash từ lưới khách = hash dòng Sheet kéo về từ lưới', [F.hash(khachForm, 'customer', GATE), F.hash(khachSheet, 'customer', GATE)], [F.hash(khachLuoi, 'customer', GATE), F.hash(khachLuoi, 'customer', GATE)]);

  const gdFbm = { id: 174813, ma_cv: 'GD', end_date: new Date('2026-09-09T10:30:00+07:00'), details: 'Gọi khách\r\nhẹn tuần sau #SC-ACT-008600', owner: 'Owner' };
  const gdForm = F.verifyFormValues(formGiaoDich(gdFbm), 'activity');
  const gdFields = F.GRID_FIELDS.activity.slice(), gdRow = gdFields.map(() => '');
  const datGd = (name, value) => { gdRow[gdFields.indexOf(name)] = value; };
  datGd('id', 174813); datGd('ten_cv', 'Gọi điện'); datGd('details', 'Gọi khách\nhẹn tuần sau'); datGd('end_date', '/Date(' + new Date('2026-09-09T08:00:00+07:00').getTime() + ')/'); datGd('owner', 'Owner');
  const gdLuoi = F.rowsToRecords('activity', { d: { Fields: gdFields.map((Name) => ({ AliasName: Name })), Rows: [gdRow], TotalRowCount: 1 } }).rows[0];
  const gdSheet = Object.assign({ id: 'ACT-008600' }, F.activityRecord(gdLuoi, GATE, { ma_kh: 'ALT00010', sttRec: 'A000050753' }));
  check(so, 'Giao dịch: hash từ form mở sửa = hash từ lưới = hash dòng Sheet (khác giờ trong ngày, xuống dòng, dấu #SC, công việc theo mã/tên)', [F.hash(gdForm, 'activity', GATE), F.hash(gdSheet, 'activity', GATE)], [F.hash(gdLuoi, 'activity', GATE), F.hash(gdLuoi, 'activity', GATE)]);

  // 2. Bảng quyết định của bước mở form.
  const base = { ten_kh: 'Cũ' }, shinMoi = { ten_kh: 'ShinCRM sửa' }, fbmMoi = { ten_kh: 'FBM sửa' };
  const quyet = (shin, fbm, coMoc) => F.pushOpenDecision('customer', Object.assign({}, shin, { fbmHash: coMoc === false ? '' : F.hash(base, 'customer', GATE) }), fbm, GATE).action;
  check(so, 'Bảng quyết định: FBM = mốc thì lưu; FBM = ShinCRM thì không lưu; cả ba khác thì xung đột; chỉ FBM đổi thì không lưu; chưa có mốc mà khác nhau là xung đột', [quyet(shinMoi, base), quyet(shinMoi, shinMoi), quyet(shinMoi, fbmMoi), quyet(base, fbmMoi), quyet(shinMoi, fbmMoi, false), quyet(shinMoi, shinMoi, false)], ['save', 'settled', 'conflict', 'fbmOnly', 'conflict', 'settled']);
  const gdMoc = F.hash({ fbmId: 9, taskType: 'GD', content: 'Nội dung', workDate: '2026-09-09' }, 'activity', GATE);
  check(so, 'Giao dịch hai bên đã bằng nhau mà FBM còn dấu #SC vẫn lưu để bỏ dấu', F.pushOpenDecision('activity', { fbmId: 9, taskType: 'GD', content: 'Nội dung mới', workDate: '2026-09-09', fbmHash: gdMoc }, { id: 9, ma_cv: 'GD', details: 'Nội dung mới #SC-ACT-9', end_date: '2026-09-09' }, GATE).action, 'save');

  // 3. Luồng thật: FBM đổi sau mốc, ShinCRM cũng đổi → không phát lệnh lưu, dòng thành xung đột, bản ghi sau vẫn được đẩy.
  const mocKhach = F.hash(khachFbm, 'customer', GATE);
  const khachA = Object.assign({}, khachSheet, { id: 'CUS-A', fbmId: 'A000050753', companyName: 'ShinCRM sửa', fbmHash: F.hash(Object.assign({}, khachFbm, { ten_kh: 'Tên gốc' }), 'customer', GATE), syncStatus: F.SYNC_STATUS.pushing });
  const khachB = { id: 'CUS-B', fbmId: 'B-1', companyName: 'Khách sau', fbmHash: 'cu', syncStatus: F.SYNC_STATUS.pending };
  let sheet = [khachA, khachB];
  const ghi = [];
  F.readLocal = (entity) => entity === 'customer' ? sheet.map((r) => Object.assign({}, r)) : [];
  hop.writeGateSave = (request) => { ghi.push(...request.records); request.records.forEach((patch) => { sheet = sheet.map((r) => r.id === patch.id ? Object.assign({}, r, patch) : r); }); return { ok: true }; };
  F.pushCandidates = () => sheet.filter((r) => r.id === 'CUS-B' && r.syncStatus === F.SYNC_STATUS.pending).map((record) => ({ kind: 'edit', id: record.id, record, raw: record, position: 1 }));
  F.customerEditOpenRequest = (fbmId) => ({ url: 'https://fbm.test/edit', body: { values: [fbmId] }, meta: { kind: 'customer_edit_open', id: fbmId } });
  giuBanGhiDongBo(hop, 'customer', 'CUS-A');
  const xungDot = F.stateStart('', 'push', 0);
  xungDot.cursor = { kind: 'push_wait', operation: 'customer_edit_open', entity: 'customer', index: 0, candidate: { entity: 'customer', kind: 'edit', id: 'CUS-A' } };
  F.stateWrite(xungDot);
  const sauXungDot = F.continuePush(F.stateRead(), formKhach(khachFbm));
  const stXungDot = F.stateRead();
  check(so, 'FBM đổi sau mốc và ShinCRM cũng đổi: không phát lệnh lưu, dòng thành xung đột chờ quyết, nhả bản ghi, phiên không dừng mà mở form bản ghi kế', [sheet[0].syncStatus, sheet[0].fbmHash === khachA.fbmHash, !!soBan(hop)['customer:CUS-A'], sauXungDot && sauXungDot.meta.kind, sauXungDot && sauXungDot.meta.id, stXungDot.phase, stXungDot.counts.conflict], [F.SYNC_STATUS.conflict, true, false, 'customer_edit_open', 'B-1', 'push', 1]);
  const nhomLog = Object.keys(F.recordIssues).map((key) => F.recordIssues[key]).filter((group) => group.direction === 'push' && group.status === F.SYNC_STATUS.conflict)[0] || { reason: '' };
  check(so, 'Log xung đột chiều đẩy nêu mã bản ghi và tên trường lệch, không chép giá trị', [nhomLog.ids, nhomLog.reason.indexOf('ở trường ten_kh') >= 0, nhomLog.reason.indexOf('ShinCRM sửa') < 0, nhomLog.reason.indexOf('Test') < 0], [['CUS-A'], true, true, true]);

  // 4. FBM đã có đúng dữ liệu ShinCRM: không lưu, ghi mốc mới, đã đồng bộ.
  sheet = [Object.assign({}, khachSheet, { id: 'CUS-A', fbmId: 'A000050753', fbmHash: 'moc-cu', syncStatus: F.SYNC_STATUS.pushing })];
  giuBanGhiDongBo(hop, 'customer', 'CUS-A');
  const khop = F.stateStart('', 'push', 0);
  khop.cursor = { kind: 'push_wait', operation: 'customer_edit_open', entity: 'customer', index: 0, candidate: { entity: 'customer', kind: 'edit', id: 'CUS-A' } };
  F.stateWrite(khop);
  F.continuePush(F.stateRead(), formKhach(khachFbm));
  check(so, 'FBM = ShinCRM: không gửi lệnh lưu, mốc = hash FBM, đã đồng bộ, nhả bản ghi', [sheet[0].fbmHash, sheet[0].syncStatus, !!soBan(hop)['customer:CUS-A'], F.stateRead().cursor.operation === 'customer_edit_save'], [mocKhach, F.SYNC_STATUS.synced, false, false]);

  // 5. Chỉ FBM đổi (ShinCRM = mốc): không lưu, trả về đã đồng bộ, mốc giữ nguyên để chiều lấy về kéo.
  const fbmDoi = Object.assign({}, khachFbm, { dien_thoai: '0911111111' });
  sheet = [Object.assign({}, khachSheet, { id: 'CUS-A', fbmId: 'A000050753', fbmHash: mocKhach, syncStatus: F.SYNC_STATUS.pushing })];
  giuBanGhiDongBo(hop, 'customer', 'CUS-A');
  const chiFbm = F.stateStart('', 'push', 0);
  chiFbm.cursor = { kind: 'push_wait', operation: 'customer_edit_open', entity: 'customer', index: 0, candidate: { entity: 'customer', kind: 'edit', id: 'CUS-A' } };
  F.stateWrite(chiFbm);
  F.continuePush(F.stateRead(), formKhach(fbmDoi));
  check(so, 'Chỉ FBM đổi: không gửi lệnh lưu, dòng về đã đồng bộ, mốc giữ nguyên', [sheet[0].fbmHash, sheet[0].syncStatus, F.stateRead().cursor.operation === 'customer_edit_save'], [mocKhach, F.SYNC_STATUS.synced, false]);

  // 6. FBM = mốc: lưu như cũ.
  sheet = [Object.assign({}, khachSheet, { id: 'CUS-A', fbmId: 'A000050753', companyName: 'ShinCRM sửa', fbmHash: mocKhach, syncStatus: F.SYNC_STATUS.pushing })];
  const luu = F.stateStart('', 'push', 0);
  luu.cursor = { kind: 'push_wait', operation: 'customer_edit_open', entity: 'customer', index: 0, candidate: { entity: 'customer', kind: 'edit', id: 'CUS-A' } };
  F.stateWrite(luu);
  const lenhLuu = F.continuePush(F.stateRead(), formKhach(khachFbm));
  const tenMoi = lenhLuu.body.memvars.filter((item) => item.Name === 'ten_kh')[0];
  check(so, 'FBM = mốc: dựng lệnh lưu với giá trị ShinCRM', [F.stateRead().cursor.operation, tenMoi.OldValue, tenMoi.NewValue], ['customer_edit_save', 'Test', 'ShinCRM sửa']);

  // 7. Giao dịch cũ bị sửa trên FBM (ca lỗ thật ở chiều Hai chiều): không ghi đè.
  const gdMocCu = F.hash({ fbmId: 174813, taskType: 'GD', content: 'Gọi khách\nhẹn tuần sau', workDate: '2026-09-09' }, 'activity', GATE);
  let gdSheetRows = [{ id: 'ACT-008600', customerId: 'CUS-A', fbmId: '174813', taskType: 'GD', content: 'ShinCRM sửa nội dung', workDate: '2026-09-09', owner: 'Owner', fbmHash: gdMocCu, syncStatus: F.SYNC_STATUS.pushing }];
  F.readLocal = (entity) => entity === 'activity' ? gdSheetRows.map((r) => Object.assign({}, r)) : [Object.assign({}, khachSheet, { id: 'CUS-A' })];
  hop.writeGateSave = (request) => { request.records.forEach((patch) => { gdSheetRows = gdSheetRows.map((r) => r.id === patch.id ? Object.assign({}, r, patch) : r); }); return { ok: true }; };
  F.pushCandidates = () => [];
  giuBanGhiDongBo(hop, 'activity', 'ACT-008600');
  const gdState = F.stateStart('', 'push', 0);
  gdState.cursor = { kind: 'push_wait', operation: 'activity_edit_open', entity: 'activity', index: 0, candidate: { entity: 'activity', kind: 'edit', id: 'ACT-008600' } };
  F.stateWrite(gdState);
  const gdKetQua = F.continuePush(F.stateRead(), formGiaoDich(Object.assign({}, gdFbm, { details: 'Đồng nghiệp sửa trên FBM' })));
  check(so, 'Giao dịch cũ bị sửa trên FBM và ShinCRM cũng sửa: không gửi lệnh lưu, dòng thành xung đột, phiên đi tiếp tới hết', [gdKetQua, gdSheetRows[0].syncStatus, F.stateRead().phase, F.stateRead().counts.conflict], [null, F.SYNC_STATUS.conflict, 'done', 1]);

  // 8. Đọc lại sau lưu khác dữ liệu vừa ghi: dòng thành xung đột nhưng phiên không dừng.
  const daGui = { id: 'ACT-V', customerId: 'CUS-A', fbmId: '42', taskType: 'GD', content: 'Đã gửi', workDate: '2026-09-09', owner: 'Owner', fbmHash: 'moc', syncStatus: F.SYNC_STATUS.pushed };
  gdSheetRows = [daGui];
  F.pendingPushSet('activity', 'ACT-V', { hSHIN: F.hash(daGui, 'activity', GATE), fbmId: '42' });
  giuBanGhiDongBo(hop, 'activity', 'ACT-V');
  const verify = F.stateStart('', 'push', 0);
  verify.cursor = { kind: 'push_wait', operation: 'activity_verify', entity: 'activity', index: 0, candidate: { entity: 'activity', kind: 'edit', id: 'ACT-V' } };
  F.stateWrite(verify);
  const sauVerify = F.continuePush(F.stateRead(), formGiaoDich({ id: 42, ma_cv: 'GD', end_date: new Date('2026-09-09T08:00:00+07:00'), details: 'Người khác sửa ngay sau', owner: 'Owner' }));
  check(so, 'Đọc xác nhận ra xung đột: dòng thành xung đột chờ quyết, phiên không dừng ở trạng thái xung đột', [sauVerify, gdSheetRows[0].syncStatus, F.stateRead().phase, F.stateRead().counts.conflict, !!soBan(hop)['activity:ACT-V']], [null, F.SYNC_STATUS.conflict, 'done', 1, false]);
}

module.exports = { chay };
