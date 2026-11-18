/**
 * State do bản cũ ghi mà đang giữa lượt thì cửa mở lượt dừng nó và báo chạy lại; sổ bước nghiệp vụ trong Log đúng thứ tự xảy ra.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas, trongLat } = require('../../lib/fbm/hop-dong-bo');
const { napServer } = require('../../lib/load-gas');

async function chay(so) {
  section('FBM sync — state bản cũ và sổ bước trong Log');
  // State do bản cũ ghi (chưa có schemaVersion) mà đang giữa lượt: dù request còn trong hạn, lượt phải dừng và báo chạy lại, dấu chờ đẩy ở khóa riêng còn nguyên.
  for (const [phase, cursorKind] of [['pull_activity', 'activity_grid'], ['awaiting_approval', 'push_plan'], ['push', 'push_wait']]) {
    const nhatKy = [];
    const cu = workflowGas({ logEvent: (row) => nhatKy.push(row)});
    const legacy = cu.hop.FbmSync.stateDefault();
    delete legacy.schemaVersion; legacy.version = 1;
    Object.assign(legacy, { runId: 'legacy-run', phase, cursor: { kind: cursorKind }, activeRequestId: 'req-dang-bay', deadlineAt: Date.now() + 60000, updatedAt: Date.now(), startedAt: Date.now() });
    cu.documentProperties.setProperty(cu.hop.FbmSync.STATE_KEY, JSON.stringify(legacy));
    cu.documentProperties.setProperty('FBM_SYNC_PENDING_PUSHES_V1', JSON.stringify({ 'customer:CUS-000001': { hash: 'h-cho' } }));
    const truocDoc = cu.documentProperties.getProperty(cu.hop.FbmSync.STATE_KEY);
    const trangThai = cu.hop.fbmCommand('status').status;
    const docXong = cu.documentProperties.getProperty(cu.hop.FbmSync.STATE_KEY);
    // Đọc trạng thái không ghi; cửa mở lượt mới thu hồi lượt dở của bản cũ trước khi mở lượt.
    const cuState = cu.hop.FbmSync.stateRead(), verdict = cu.hop.FbmSync.staleRunCheck(cuState, Date.now());
    if (verdict) { cu.hop.FbmSync.staleRunClose(cuState, verdict); }
    const luu = JSON.parse(cu.documentProperties.getProperty(cu.hop.FbmSync.STATE_KEY));
    check(so, 'Lượt dở do bản cũ ghi (' + phase + '): đọc trạng thái không ghi; cửa mở lượt dừng nó, báo chạy lại ở Log, giữ dấu chờ đẩy, state ghi lại theo phiên bản mới', [
      trangThai.phase, docXong === truocDoc, !!verdict, luu.phase, luu.lastFailureCode, /chạy lại lượt/.test(String(luu.lastError || '')), luu.schemaVersion, luu.version, cu.documentProperties.getProperty('FBM_SYNC_PENDING_PUSHES_V1'),
      nhatKy.some((row) => /chạy lại lượt/.test(JSON.stringify(row)))
    ], [phase, true, true, 'error', 'SYNC_STATE_MIGRATED', true, cu.hop.FbmSync.STATE_SCHEMA_VERSION, undefined, JSON.stringify({ 'customer:CUS-000001': { hash: 'h-cho' } }), true]);
  }
  // Sổ bước trong Log phải theo đúng thứ tự xảy ra: bước đã xong đóng ngay khi luồng chuyển chặng, vấn đề theo bản ghi đứng trước dòng đóng bước và dòng đóng phiên.
  const soBuoc = (mode) => {
    const nhatKy = [], ghi = (row) => nhatKy.push(row.action);
    const luong = workflowGas({ logEvent: ghi, logTrace: ghi });
    // Bộ dựng chung không nạp sổ bước vì các ca khác không xét Log theo bước.
    napServer(luong.hop, 'fbm_sync/diagnostic/Trace.js');
    const F = luong.hop.FbmSync, st = F.runOpen({ phase: 'pull_customer' });
    st.mode = mode;
    ['run', 'pull_customer', 'reconcile_customer'].forEach((key) => F.businessStepStart(st, key, { mode }));
    return { nhatKy, F, st };
  };
  const conTrang = soBuoc('read');
  const hetKhach = soBuoc('read');
  hetKhach.F.gateOpen(hetKhach.st, { layer: 'list' }, 'Đang đọc chi tiết', hetKhach.F.scriptSettings(hetKhach.st), null);
  hetKhach.F.recordIssueAdd('pull', 'activity', 'synced', 'ACT-1', 'Nối lại mã khách', 'warn');
  hetKhach.st.phase = 'done'; hetKhach.F.stateWrite(hetKhach.st);
  const viTri = (log, action) => log.indexOf(action);
  check(so, 'Log sổ bước: đang quét danh sách thì bước khách để mở; cửa ghi mở bước giao dịch và giữ bước khách mở vì khách được ghi cùng lô; cảnh báo bản ghi đứng trước dòng đóng phiên', [
    !conTrang.st.metadata.businessSteps.pull_customer.finishedAt,
    viTri(hetKhach.nhatKy, 'pull_activity_started') >= 0 && viTri(hetKhach.nhatKy, 'reconcile_customer_finished') > viTri(hetKhach.nhatKy, 'pull_activity_started'),
    viTri(hetKhach.nhatKy, 'pull_record_issue') >= 0 && viTri(hetKhach.nhatKy, 'pull_record_issue') < viTri(hetKhach.nhatKy, 'reconcile_activity_finished'),
    viTri(hetKhach.nhatKy, 'reconcile_activity_finished') < viTri(hetKhach.nhatKy, 'sync_session_finished')
  ], [true, true, true, true]);
  const sangDay = soBuoc('write');
  ['pull_activity', 'reconcile_activity'].forEach((key) => sangDay.F.businessStepStart(sangDay.st, key, {}));
  sangDay.F.pushNext = (state) => { sangDay.F.businessStepStart(state, 'push_customer', {}); return { end: { kind: 'done', remaining: 0 } }; };
  trongLat(sangDay.F, () => sangDay.F.pullFinishOrPush(sangDay.st, {}), sangDay.st);
  check(so, 'Log sổ bước: lượt hai chiều đóng mọi bước Lấy trước khi mở bước đẩy',
    ['pull_customer_finished', 'reconcile_customer_finished', 'pull_activity_finished', 'reconcile_activity_finished'].every((action) => viTri(sangDay.nhatKy, action) >= 0 && viTri(sangDay.nhatKy, action) < viTri(sangDay.nhatKy, 'push_customer_started')),
    true);
}

module.exports = { chay };
