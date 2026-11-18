/**
 * Lượt Lấy qua executor thật: phiên rỗng chỉ phát request đọc, Extension cũ không gửi mã hợp đồng thì GAS dừng và không ghi Sheet, trang danh sách khách chỉ đánh dấu chứ chưa ghi.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { datState } = require('../../lib/fbm/dat-state');
const { tabGia, rawExecutor, luoiFbm, dongFbm } = require('../../lib/fbm/tab-fbm-gia');
const { USER_BODY } = require('../../lib/fbm/tu-dang-nhap');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

async function chay(so) {
  section('FBM sync — lượt đọc rỗng và Extension lệch mã hợp đồng');
  const readFlow = workflowGas();
  readFlow.hop.FbmSync.prepareCategoryGate = () => ({ map: {} });
  readFlow.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
  readFlow.hop.FbmSync.pullPageApply = () => ({ ok: true, written: 0, conflicts: 0, skipped: 0, identityBlocks: [] });
  datState(readFlow.hop.FbmSync, { session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  let readStep = readFlow.hop.FbmSync.runSlice(() => readFlow.hop.FbmSync.start({ mode: 'read', origin: 'manual', manual: true }, readFlow.hop.FbmSync.stateRead()));
  const readKinds = [];
  for (let hop = 0; readStep && readStep.request && hop < 12; hop += 1) {
    const request = readStep.request;
    readKinds.push(request.meta.kind + ':' + String(request.meta.entity || request.meta.field || ''));
    let body;
    if (request.meta.kind === 'session_probe') { body = USER_BODY; }
    else if (request.meta.kind === 'authorize') { body = JSON.stringify({ d: { Authorized: 'auth-' + request.meta.entity } }); }
    else if (request.meta.kind === 'completion') { body = JSON.stringify({ d: [['CODE', 'Tên danh mục']] }); }
    else {
      body = JSON.stringify({ d: {
        TotalRowCount: 0, Rows: [],
        ViewPage: { Fields: ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ten_cv', 'ngay_gd', 'datetime0', 'xorder'].map((AliasName) => ({ AliasName })) }
      } });
    }
    const throughExtension = await tabGia().send(request, body);
    readStep = readFlow.hop.FbmSync.runSlice(() => readFlow.hop.FbmSync.continue(rawExecutor(throughExtension.reply, request.id)));
  }
  check(so, 'phiên rỗng: Extension chỉ chuyển request đọc, không phát request ghi hoặc xóa và pipeline kết thúc', [
    readKinds, readKinds.length, readKinds.every((kind) => ['session_probe:user', 'authorize:customer', 'authorize:activity', 'completion:@CAT_TINH_THANH', 'completion:@CAT_NGUON_KH', 'completion:@CAT_CONG_VIEC', 'scan_job:customer', 'customer_count:customer'].indexOf(kind) >= 0), readStep.ok, readStep.request || null, readStep.status.phase, readFlow.hop.FbmSync.stateRead().counts.succeeded
  ], [[
     'session_probe:user', 'authorize:customer', 'authorize:activity', 'scan_job:customer', 'customer_count:customer'
  ], 5, true, true, null, 'done', 0]);

  // Extension cũ không ghi mã hợp đồng vào response; trang Customer có khách thật vẫn không được đi tới cửa ghi Sheet.
  const contractRun = async (contract) => {
    const logs = [];
    const flow = workflowGas({ logEvent: (event) => { logs.push(event); } });
    let sheetWrites = 0;
    flow.hop.FbmSync.prepareCategoryGate = () => ({ map: {} });
    flow.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
    flow.hop.FbmSync.pullPageApply = (entity, records) => { sheetWrites += records.length; return { ok: true, written: records.length, conflicts: 0, skipped: 0, identityBlocks: [] }; };
    datState(flow.hop.FbmSync, { session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
    const fields = ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ten_cv', 'ngay_gd', 'datetime0', 'xorder'];
    let step = flow.hop.FbmSync.runSlice(() => flow.hop.FbmSync.start({ mode: 'read', origin: 'manual', manual: true }, flow.hop.FbmSync.stateRead())), last = step;
    for (let hop = 0; step && step.request && hop < 12; hop += 1) {
      const request = step.request, grid = request.meta.kind === 'scan_job';
      let body = USER_BODY;
      if (request.meta.kind === 'authorize') { body = JSON.stringify({ d: { Authorized: 'auth-' + request.meta.entity } }); }
      if (grid) { body = luoiFbm(fields, [dongFbm(fields, { stt_rec_kh: 'KH-REC-1', ma_kh: 'KH001', ten_kh: 'Khách thử' })], 1); }
      const raw = rawExecutor((await tabGia().send(request, body)).reply, request.id);
      if (grid) { raw.transport.contract = contract; }
      step = flow.hop.FbmSync.runSlice(() => flow.hop.FbmSync.continue(raw)); last = step;
      if (grid) { break; }
    }
    return { last, logs, sheetWrites, state: flow.hop.FbmSync.stateRead() };
  };
  const oldExtension = await contractRun(undefined), sameContract = await contractRun(MA_HOP_DONG);
  const mismatchLog = oldExtension.logs.find((event) => event.action === 'extension_contract_mismatch') || {};
  check(so, 'Extension lệch mã hợp đồng: GAS dừng phiên, không ghi Sheet, Sidebar nhận lỗi và Log ghi lời nhắc tải lại Extension"', [
    oldExtension.last.ok, oldExtension.last.code, oldExtension.last.request, oldExtension.sheetWrites,
    oldExtension.last.status.phase, String(oldExtension.last.status.lastError || '').indexOf('hãy tải lại Extension') >= 0,
    mismatchLog.reason, mismatchLog.detail && mismatchLog.detail.received, oldExtension.state.activeRequestId,
    sameContract.last.ok
  ], [false, 'EXTENSION_PROTOCOL_MISMATCH', null, 0, 'error', true, 'Extension trên máy này đang dùng bản giao thức khác GAS, hãy tải lại Extension (chrome://extensions → ShinCRM → Tải lại).', '(Extension không gửi mã)', '', true]);
  check(so, 'Danh sách toàn bộ khách chỉ đánh dấu: lượt chỉ qua trang danh sách khách thì không ghi Sheet lần nào, request kế là lô cửa ghi đọc chi tiết khách vừa đánh dấu', [
    sameContract.sheetWrites, sameContract.last.request && sameContract.last.request.meta.kind, sameContract.last.request && sameContract.last.request.items.length
  ], [0, 'batch', 2]);
}

module.exports = { chay };
