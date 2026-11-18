/** Bản ghi bị giữ lại ở chặng đẩy: chỉ tăng số đếm state, Log gom đúng một dòng mỗi lát kèm số lượng và mã, và lô giữ chỉ tốn một lần ghi Sheet trước lần ghi "đang đẩy" (FBM-021). */
const { section, check } = require('../../lib/assert');
const { dungHopDay, moQuetDay } = require('../../lib/fbm/hop-day');
const { datUngVienDay } = require('../../lib/fbm/ung-vien-day');
const { trongLat } = require('../../lib/fbm/hop-dong-bo');

async function chay(so) {
  section('FBM sync — push: bản ghi bị giữ');
  const hop = dungHopDay(), push = hop.push;
  const logs = [];
  push.logEvent = (event) => logs.push(event);
  push.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-SKIP' }] : [];
  const skippedState = { counts: { skipped: 0 }, metadata: {} };
  push.FbmSync.markPushSkippedBatch(skippedState, [{ entity: 'activity', id: 'ACT-SKIP', hold: { status: push.FbmSync.SYNC_STATUS.unknownCategory, reason: 'Category chua khop' } }]);
  check(so, 'Push record bị hoãn chỉ tăng state, không ghi Log chi tiết',
    [skippedState.counts.skipped, logs.length],
    [1, 0]);

  // Nhiều bản ghi bị giữ trong một lát: câu cho người dùng nêu mã (mỗi mã một câu khác nhau), câu cho Log là một câu chung nên bộ gom ra đúng một dòng.
  const flush = () => { logs.length = 0; push.FbmSync.recordIssuesFlush(); return logs.slice(); };
  flush();
  push.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-1' }, { id: 'ACT-2' }, { id: 'ACT-3' }] : [];
  const holdContext = { settings: () => ({ accountName: 'Lê Tuấn Anh' }), categoryGate: {} };
  const skipState = { counts: { skipped: 0 }, metadata: {} }, messages = [], held = [];
  ['ACT-1', 'ACT-2', 'ACT-3'].forEach((id) => {
    const candidate = { entity: 'activity', kind: 'edit', id, record: { id, owner: 'Người khác' } }, hold = push.FbmSync.pushHold(candidate, holdContext);
    candidate.hold = hold; held.push(candidate);
  });
  push.FbmSync.markPushSkippedBatch(skipState, held); messages.push(skipState.message);
  const skipLogs = flush();
  check(so, 'FBM-021: lát có nhiều bản ghi bị giữ thì Log đúng một dòng loại đó, kèm số lượng và danh sách mã; câu trên Sidebar vẫn nêu mã bản ghi',
    [skipState.counts.skipped, skipLogs.length, skipLogs[0] && skipLogs[0].detail.count, skipLogs[0] && skipLogs[0].detail.ids, skipLogs[0] && skipLogs[0].reason.indexOf('ACT-1, ACT-2, ACT-3') >= 0, messages[0].indexOf('ACT-3') >= 0],
    [3, 1, 3, ['ACT-1', 'ACT-2', 'ACT-3'], true, true]);

  // FBM-021: ba bản ghi bị giữ rồi một bản ghi đẩy được thì ba bản ghi giữ chỉ tốn một lần ghi Sheet, lần ghi kế là "đang đẩy" của bản ghi đẩy được.
  const writes = [];
  const hold = (cause) => ({ status: push.FbmSync.SYNC_STATUS.skipped, reason: 'Bỏ qua customer: ' + cause, cause: 'Bỏ qua customer: ' + cause });
  push.FbmSync.readLocal = () => [];
  datUngVienDay(push, () => [
    { kind: 'edit', id: 'H-1', record: { id: 'H-1', fbmId: 'F-H1' }, hold: hold('Thiếu Mã số thuế.') },
    { kind: 'edit', id: 'H-2', record: { id: 'H-2', fbmId: 'F-H2' }, raw: { id: 'H-2', fbmId: 'F-H2', ten: 'bản lúc chọn' }, hold: hold('Thiếu Mã số thuế.') },
    { kind: 'edit', id: 'H-3', record: { id: 'H-3', fbmId: 'F-H3' }, hold: hold('Thiếu Mã số thuế.') },
    { kind: 'edit', id: 'P-1', record: { id: 'P-1', fbmId: 'F-P1', fbmHash: 'h-p1' } }
  ]);
  push.writeGateSave = (request) => { writes.push(request.records.map((row) => row.id + ':' + row.syncStatus)); return { ok: true }; };
  logs.length = 0;
  const batchState = moQuetDay(hop);
  const batchRequest = trongLat(push.FbmSync, () => push.FbmSync.pushStageResume(batchState), batchState), batchAfter = push.FbmSync.stateRead();
  push.FbmSync.recordIssuesFlush();
  check(so, 'FBM-021: ba bản ghi giữ (một dòng đã đổi giữa chừng) chỉ một lần ghi Sheet, rồi mới tới lần ghi "đang đẩy"; dòng đã đổi không được tính',
    [writes, batchRequest && batchRequest.meta.kind, batchAfter.counts.skipped, batchAfter.cursor.progress, batchAfter.current],
    [[['H-1:' + push.FbmSync.SYNC_STATUS.skipped, 'H-3:' + push.FbmSync.SYNC_STATUS.skipped], ['P-1:' + push.FbmSync.SYNC_STATUS.pushing]], 'customer_edit_open', 2, 2, 'P-1']);
  check(so, 'FBM-021: lô giữ đó ra đúng một dòng Log kèm hai mã',
    [logs.length, logs[0] && logs[0].detail.ids],
    [1, ['H-1', 'H-3']]);
}

module.exports = { chay };
