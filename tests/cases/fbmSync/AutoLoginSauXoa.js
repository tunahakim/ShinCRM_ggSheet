/** Kiểm Giữ phiên sau lượt bị xóa phiên: probe User trước, lọc quyền theo mã từ grid User, trang FBM lệch hoặc thiếu danh tính, pattern bắt giá trị trang. */
const { section, check } = require('../../lib/assert');
const { vaSoNen } = require('../../lib/fbm/cai-dat-thu');
const { noiNen, hoiNen, dungHopGiuPhien } = require('../../lib/fbm/tu-dang-nhap');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const { datState } = require('../../lib/fbm/dat-state');

async function chay(so) {
  section('FBM sync - auto-login: Giữ phiên sau xóa phiên và danh tính trang FBM');
  const { hop: afterWipe } = dungHopGiuPhien({ sheetId: 'sheet-wipe', binding: { userId: '7777', username: 'WIPE', accountName: 'Tai khoan wipe' }, credential: false });
  // Gặp thật 2026-10-20 00:04: lượt nền mở lượt mới (xóa phiên) rồi hỏng ở request đầu, Giữ phiên 5 phút sau ném "thiếu mã người dùng FBM" vì không qua bước kiểm tra phiên. Giữ phiên phải probe trước, rồi lọc quyền theo mã đọc từ grid User, không theo liên kết hay cookie.
  afterWipe.FbmSync.runOpen({ phase: 'error' });
  datState(afterWipe.FbmSync, { session: Object.assign(afterWipe.FbmSync.stateRead().session, { cookie: '461099999855cFHN_CRM_App' }) });
  vaSoNen(afterWipe.FbmSync, { heartbeat: { doneAt: 1 } });
  const wipedSession = afterWipe.FbmSync.stateRead().session;
  const afterWipeHeartbeat = hoiNen(afterWipe);
  const wipeProbeBody = JSON.stringify({ d: { TotalRowCount: 1, Rows: [[7777, 'WIPE', 'Tai khoan wipe']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] } } });
  const afterWipeCount = noiNen(afterWipe, { ok: true, status: 200, body: wipeProbeBody, transport: { contract: MA_HOP_DONG, captures: { pageUserId: '7777', pageAccountName: 'Tai khoan wipe' }, trace: [{ requestId: afterWipeHeartbeat.request.id }] } });
  const wipedKeys = JSON.stringify(afterWipeCount.request && afterWipeCount.request.body && afterWipeCount.request.body.externalKey || []);
  check(so, 'Giữ phiên sau lượt bị xóa phiên: request đầu là probe User, sau probe mới dựng request đếm khách, lọc quyền theo mã đọc từ grid User (không theo mã đoán từ cookie)', [
    wipedSession.userId, afterWipeHeartbeat.ok, afterWipeHeartbeat.request && afterWipeHeartbeat.request.meta.kind, afterWipeCount.ok, afterWipeCount.request && afterWipeCount.request.meta.kind, wipedKeys.indexOf("GetCustomerValidate('7777')") >= 0, wipedKeys.indexOf("GetCustomerValidate('9999')") >= 0
  ], ['', true, 'session_probe', true, 'customer_count', true, false]);

  // Liên kết phải khớp cả grid User lẫn trang FBM (mã trong payload cookie, tên đầy đủ trong khối menu); hai nơi so với liên kết, không so với nhau.
  // Lưu lại liên kết sau giờ dừng (như người dùng thật kiểm FBM rồi bấm lưu): hết dừng nền D4 để vòng sau chạy được.
  const relink = () => {
    const stopAt = afterWipe.FbmSync.processBookRead().identityStop;
    if (!afterWipe.FbmSync.identityStopActive(afterWipe.FbmSync.processBookRead(), afterWipe.FbmSync.bindingRead())) { return; }
    while (Date.now() <= stopAt) { /* chờ qua mili-giây của giờ dừng */ }
    const saved = afterWipe.FbmSync.connectionSave({ binding: afterWipe.FbmSync.bindingRead() });
    if (!saved.ok) { throw new Error(saved.code); }
  };
  const pageRound = (captures) => {
    relink();
    afterWipe.FbmSync.runOpen({ phase: 'error' });
    vaSoNen(afterWipe.FbmSync, { heartbeat: { doneAt: 1 } });
    const opened = hoiNen(afterWipe);
    return { opened, reply: noiNen(afterWipe, { ok: true, status: 200, body: wipeProbeBody, transport: { contract: MA_HOP_DONG, captures, trace: [{ requestId: opened.request.id }] } }) };
  };
  const pageMismatch = pageRound({ pageUserId: '9999', pageAccountName: 'Tai khoan wipe' }).reply;
  afterWipe.FbmSync.runOpen({ phase: 'error' });
  vaSoNen(afterWipe.FbmSync, { heartbeat: { doneAt: 1 } });
  const stoppedAsk = hoiNen(afterWipe);
  check(so, 'D4: lượt nền lệch danh tính thì nền dừng hẳn (không thử lại theo lịch) tới khi lưu lại liên kết',
    [stoppedAsk.code, stoppedAsk.request],
    ['BACKGROUND_IDENTITY_STOPPED', null]);
  const nameMismatch = pageRound({ pageUserId: '7777', pageAccountName: 'Nguoi khac' }).reply;
  check(so, 'Trang FBM lệch liên kết (mã hoặc tên) dù grid User khớp: dừng SESSION_IDENTITY_MISMATCH, không dựng request đọc khách, phiên không được xác minh', [
    pageMismatch.ok, pageMismatch.code, pageMismatch.request, nameMismatch.code, nameMismatch.request, afterWipe.FbmSync.sessionIdentityIsVerified(afterWipe.FbmSync.stateRead())
  ], [false, 'SESSION_IDENTITY_MISMATCH', null, 'SESSION_IDENTITY_MISMATCH', null, false]);
  const pageEmpty = pageRound({});
  const pageStillEmpty = noiNen(afterWipe, { ok: true, status: 200, body: wipeProbeBody, transport: { contract: MA_HOP_DONG, trace: [{ requestId: pageEmpty.reply.request.id }] } });
  check(so, 'Trang FBM thiếu mã và tên: GAS phát lại probe kèm lệnh tải tab về trang khách hàng; tải lại vẫn thiếu thì dừng FBM_PAGE_IDENTITY_MISSING, không tải lại mãi', [
    pageEmpty.reply.ok, pageEmpty.reply.request.meta.kind, pageEmpty.reply.request.meta.reloadFbmPage, pageStillEmpty.ok, pageStillEmpty.code, pageStillEmpty.request
  ], [true, 'session_probe', 'https://fbo.com.vn:8888/Main/zccrAccount.aspx', false, 'FBM_PAGE_IDENTITY_MISSING', null]);
  const pageAfterReload = pageRound({});
  const pageReloadedOk = noiNen(afterWipe, { ok: true, status: 200, body: wipeProbeBody, transport: { contract: MA_HOP_DONG, captures: { pageUserId: '7777', pageAccountName: 'Tai khoan wipe' }, trace: [{ requestId: pageAfterReload.reply.request.id }] } });
  check(so, 'Tải lại trang xong có đủ mã và tên khớp liên kết: phiên được xác minh, Giữ phiên dựng request đếm khách, request không còn lệnh tải lại', [
    pageReloadedOk.ok, pageReloadedOk.request && pageReloadedOk.request.meta.kind, pageReloadedOk.request && pageReloadedOk.request.meta.reloadFbmPage
  ], [true, 'customer_count', undefined]);
  // Nơi bắt giá trị trên trang: FBM có thể đặt dấu nháy dạng \" trong script, pattern phải bắt cả hai dạng (Nghiên cứu FBM ch02).
  const pageCaptures = afterWipe.FbmSync.payloadCookieTransport().captures, pageHtml = String.raw`<script>x={\"cookie\":\"50202037a947fFHN_CRM_App\"}</script><script>m={"username":"Lê Tuấn Anh","items":[]}</script>`;
  const pagePick = (name) => { const c = pageCaptures.find((item) => item.name === name); const m = pageHtml.match(new RegExp(c.pattern, c.flags)); return m && m[c.group]; };
  check(so, 'Pattern trang FBM: mã người dùng giữa 4 ký tự đầu và 5 ký tự cuối của payload cookie, tên đầy đủ trong khối menu',
    [pagePick('payloadCookie'), pagePick('pageUserId'), pagePick('pageAccountName')],
    ['50202037a947fFHN_CRM_App', '2037', 'Lê Tuấn Anh']);
}

module.exports = { chay };
