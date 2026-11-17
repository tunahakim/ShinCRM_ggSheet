/**
 * Khung dùng chung của các ca tự đăng nhập: dựng hộp GAS (kho thuộc tính giả, tệp nạp, liên kết, credential) và các hàm nộp response qua đúng cổng như đường thật.
 * Mỗi ca tự dựng hộp của mình bằng `dungHopCong` hoặc `dungHopGiuPhien`, không dựa vào trạng thái của ca khác.
 */
const { trongLat } = require('./hop-dong-bo');
const { taoKhoThuocTinh } = require('../gas/kho-thuoc-tinh');
const { taoHopCat, napServer, TEP_KHUNG_LUOT } = require('../load-gas');
const { quaTrangLogin } = require('./trang-login');

const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const { datState } = require('./dat-state');
const quaTrang = (nop, first, doi) => quaTrangLogin(nop, first, MA_HOP_DONG, doi);
const USER_BODY = '{"d":{"TotalRowCount":1,"Rows":[[2037,"ANHLT","Le Tuan Anh"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}';
const HET_HAN = { ok: true, status: 200, body: '{"d":{"Authorized":false,"Rows":[]}}' };

/** Hộp nhỏ chỉ nạp cổng tự đăng nhập và chặng phiên, chưa liên kết, chưa lưu credential. */
function dungHopCong() {
  const props = taoKhoThuocTinh({});
  const hop = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => props }, logEvent() {}, LOG_OK: 'ok', LOG_ERROR: 'error' });
  napServer(hop, 'fbm_sync/control/ControlPort.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/auth/LoginStores.js', 'fbm_sync/auth/LoginTools.js', 'fbm_sync/auth/AutoLogin.js', 'fbm_sync/auth/LoginRun.js', 'fbm_sync/write/SheetSave.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/ConnectionSave.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/state/Heartbeat.js');
  return hop;
}

/**
 * Hộp đủ chuỗi Giữ phiên: các tiến trình khác vừa chạy xong nên chưa đến hạn, lần hỏi nào đến hạn chỉ là Giữ phiên. Đã liên kết một tài khoản và lưu credential giả (tắt bằng `credential: false`), lượt đang ở `idle`.
 * Trả kèm `data` (kho thuộc tính thô) cho ca cần đọc khóa trực tiếp.
 */
function dungHopGiuPhien(opt) {
  const cau = Object.assign({ sheetId: 'sheet-test', binding: { userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' }, credential: true }, opt || {});
  const data = { FBM_SYNC_PROCESS_BOOK_V1: JSON.stringify({ customerFull: { doneAt: Date.now() }, activityFull: { doneAt: Date.now() }, detail: { doneAt: Date.now() } }) };
  const props = taoKhoThuocTinh(data);
  const hop = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => props, getScriptProperties: () => props }, LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }, shinOpenBook: () => ({ getId: () => cau.sheetId }) });
  napServer(hop, 'fbm_sync/control/ControlPort.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/ConnectionSave.js', 'fbm_sync/auth/LoginStores.js', 'fbm_sync/auth/LoginTools.js', 'fbm_sync/auth/AutoLogin.js', 'fbm_sync/auth/LoginRun.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/read/CustomerScan.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/write/SheetSave.js');
  hop.FbmSync.configValue = () => '';
  hop.FbmSync.readLocal = () => [];
  hop.FbmSync.connectionSave({ binding: Object.assign({ spreadsheetId: cau.sheetId }, cau.binding) });
  if (cau.credential) { hop.FbmSync.credentialWrite({ credentialRef: 'cred-heartbeat-123', ciphertext: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt', database: 'FHN_CRM_App', unit: 'CTY' } }); }
  hop.FbmSync.runOpen({ phase: 'idle' });
  return { hop, data };
}

/** Vá dấu lần thử đăng nhập qua đúng cổng đọc, ghi của GAS (`loginAttemptRead`, `loginAttemptWrite`); trường không nêu giữ nguyên. */
function vaDauThu(F, patch) { return F.loginAttemptWrite(Object.assign(F.loginAttemptRead(), patch)); }

/** Gom dòng Log của hộp vào một mảng, để ca kiểm Log có ghi đúng và không lộ bí mật. */
function batLogCong(hop) { const logs = []; hop.logEvent = (event) => logs.push(event); return logs; }

/** Nộp response của lượt nền như `continue` qua lát chung, bỏ phần khóa của cửa lệnh (khóa kiểm ở Control), nhưng kết quả vẫn qua cửa ra `publicResult` như đường thật: gọi thẳng lát thì trường lạ ở đường tự đăng nhập không lộ ra trong test. */
function noiNen(hop, response) { return hop.FbmSync.publicResult(hop.FbmSync.runSlice(() => hop.FbmSync.continue(response))); }
/** Đặt ô lượt đăng nhập ở bước `cursor.step` rồi nộp response qua chặng chung (`CURSOR_TABLE.login`). */
function nopBuoc(F, cursor, reply, patch) {
  datState(F, Object.assign({ runId: 'login-' + Math.random().toString(36).slice(2), phase: 'checking_session', cursor: F.loginCursorOpen(cursor), activeRequestId: '', deadlineAt: 0 }, patch || {}));
  return trongLat(F, () => F.stageRun(F.cursorTable('login'), F.stateRead(), reply));
}
/** Hỏi cổng tự đăng nhập bằng đúng đầu vào chặng phiên đọc khi phiên chết. */
function congVao(F, now, manual) { const vao = F.sessionInputs({ cursor: { kind: 'session', resume: { cursor: { kind: 'customer_grid' } } } }, HET_HAN); return F.autoLoginGate(Object.assign({ attempt: vao.attempt, now: now === undefined ? Date.now() : now, manual: manual === true }, vao.login)); }
/** Lần hỏi của chuông nền từ máy được giao chạy nền, kết quả qua cửa ra `publicResult` như `noiNen`. */
function hoiNen(hop) {
  if (hop.FbmSync.backgroundMachineRead().machineId !== 'may-A') { hop.FbmSync.backgroundMachineWrite(hop.FbmSync.machineAssigned('may-A', 'Máy A', Date.now())); }
  return hop.FbmSync.publicResult(hop.FbmSync.heartbeatRun({ trigger: 'alarm', machineId: 'may-A' }));
}

module.exports = { USER_BODY, HET_HAN, quaTrang, noiNen, nopBuoc, congVao, hoiNen, dungHopCong, dungHopGiuPhien, vaDauThu, batLogCong };
