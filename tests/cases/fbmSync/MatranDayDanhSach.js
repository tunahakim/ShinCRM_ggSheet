/** Ma trận chặng đẩy theo danh sách mã (C0): quét lại tới khi sạch, danh sách chia khóa, khóa hỏng, trần vòng, dòng thiếu trường, shardListWrite. */
const { trongLat } = require('../../lib/fbm/hop-dong-bo');
const { section, check } = require('../../lib/assert');
const { makeSync, pushQueue, editCustomer, pushOk, pushDrive } = require('../../lib/fbm/hang-day');

async function chay(so) {
  section('FBM sync — ma trận đẩy theo danh sách mã');
  const pushListKey = (q) => String(q.run.documentProperties.data.FBM_SYNC_PUSH_LIST_0 || '');
  {
    const scanBox = pushQueue(['A', 'B'].map(editCustomer).concat([Object.assign(editCustomer('C'), { fbmHash: '' }), Object.assign(editCustomer('D'), { phone: '' })]), [Object.assign({ id: 'ACT-1', customerId: 'CUS-A', fbmId: '9001', workDate: '2026-10-01', taskType: 'Gọi điện', content: 'Gọi', owner: 'Người khác', fbmSyncPermission: 'Cho phép', fbmHash: 'cũ' })]);
    const SF = scanBox.F, scan = SF.localScan(), context = SF.pushReviewContext(SF.stateRead(), scan);
    const byScan = SF.pushCandidatesAll(scan, context).map((c) => [c.entity, c.id, c.kind, c.hold ? c.hold.code : '']);
    const byId = byScan.map((row) => { const record = SF.readLocalById(row[0], row[1]), parent = row[0] === 'activity' ? SF.readLocalById('customer', record.customerId) : null, c = SF.pushReview(row[0], record, parent, SF.pushReviewContext(SF.stateRead())).candidate; return [c.entity, c.id, c.kind, c.hold ? c.hold.code : '']; });
    check(so, 'C0: phép xét trên lần quét cả sheet và trên dòng đọc lại theo mã cho cùng kết quả (cùng mã, cùng loại, cùng lý do chờ sửa)',
      [byScan, byId],
      [byScan, byScan]);
  }
  {
    const q = pushQueue(['A', 'B', 'C'].map(editCustomer));
    const { tried, request } = pushDrive(q, (id, n) => {
      if (n === 1) { q.run.local.customer.unshift(editCustomer('D')); q.run.local.customer.find((row) => row.id === 'CUS-C').recordStatus = 'deleted'; }
      if (n === 2) { q.run.local.customer.find((row) => row.id === 'CUS-A').companyName = 'Cty A sửa lại'; }
    });
    const end = q.F.stateRead();
    check(so, 'C0: chặng đẩy quét lại tới khi sạch; dòng chèn lên đầu, dòng phía trên vừa sửa lại đều được đẩy ở vòng sau, dòng xóa giữa chặng không đẩy; hết việc thì xóa danh sách',
      [tried, request, end.phase, /Còn \d+ bản ghi/.test(end.message), pushListKey(q)], [['CUS-A', 'CUS-B', 'CUS-D', 'CUS-A'], null, 'done', false, '']);
  }
  {
    const q = pushQueue(['A', 'B', 'C', 'D', 'E'].map(editCustomer));
    q.F.SHARD_LIST_BYTES = 40;
    const first = trongLat(q.F, () => q.F.pushStageResume(q.F.stateRead())), firstCursor = q.F.stateRead().cursor;
    const { tried } = (() => { const out = [q.F.stateRead().cursor.candidate.id]; let r = first; for (let g = 0; g < 20 && r; g += 1) { r = pushOk(q); if (r) { out.push(q.F.stateRead().cursor.candidate.id); } } return { tried: out }; })();
    check(so, 'C0: danh sách không vừa một khóa thì chỉ ghi phần đầu; lần quét lại nhặt phần còn lại, không sót bản ghi',
      [firstCursor.size, tried, q.F.stateRead().phase, pushListKey(q)], [2, ['CUS-A', 'CUS-B', 'CUS-C', 'CUS-D', 'CUS-E'], 'done', '']);
  }
  {
    const broken = pushQueue(['A', 'B'].map(editCustomer));
    trongLat(broken.F, () => broken.F.pushStageResume(broken.F.stateRead()));
    broken.run.documentProperties.setProperty('FBM_SYNC_PUSH_LIST_0', 'hỏng');
    pushOk(broken);
    const brokenLog = broken.run.logs.filter((event) => event.action === 'push_list_read');
    const missing = pushQueue(['A', 'B'].map(editCustomer));
    trongLat(missing.F, () => missing.F.pushStageResume(missing.F.stateRead()));
    missing.run.documentProperties.deleteProperty('FBM_SYNC_PUSH_LIST_0'); missing.run.documentProperties.deleteProperty('FBM_SYNC_PUSH_LIST_SHARDS');
    pushOk(missing);
    check(so, 'C0: khóa danh sách hỏng thì ghi Log lỗi rồi quét lại; khóa mất thì quét lại không cần Log; cả hai vẫn đẩy tiếp bản ghi còn lại',
      [brokenLog.length, brokenLog[0] && brokenLog[0].outcome, broken.F.stateRead().cursor.candidate.id, missing.run.logs.filter((event) => event.action === 'push_list_read').length, missing.F.stateRead().cursor.candidate.id],
      [1, 'error', 'CUS-B', 0, 'CUS-B']);
  }
  {
    const capped = pushQueue(['A', 'B'].map(editCustomer));
    capped.F.SHARD_LIST_BYTES = 8; capped.F.BUDGET.pushPassesMax = 1;
    trongLat(capped.F, () => capped.F.pushStageResume(capped.F.stateRead()));
    const cappedNext = pushOk(capped), cappedEnd = capped.F.stateRead(), cappedLog = capped.run.logs.find((event) => event.action === 'push_unfinished') || {};
    const busy = pushQueue(['A', 'B'].map(editCustomer));
    busy.F.pushRowChange = () => ({ status: 'busy', busy: { reason: 'đang có người sửa' } });
    const busyRequest = trongLat(busy.F, () => busy.F.pushStageResume(busy.F.stateRead())), busyEnd = busy.F.stateRead(), busyLog = busy.run.logs.find((event) => event.action === 'push_unfinished') || {};
    const paused = pushQueue(['A'].map(editCustomer));
    trongLat(paused.F, () => paused.F.pushStageResume(paused.F.stateRead()));
    trongLat(paused.F, () => paused.F.pushEndApply(paused.F.stateRead(), { kind: 'pause', message: 'Tạm dừng thử' }));
    check(so, 'C0: đạt pushPassesMax hoặc vòng đứng yên (mọi mã đều hoãn) thì dừng không sạch, Log cảnh báo nêu số còn lại; dừng, tạm dừng hay sạch đều xóa danh sách',
      [cappedNext, cappedEnd.phase, /Còn 1 bản ghi/.test(cappedEnd.message), cappedLog.outcome, cappedLog.detail && cappedLog.detail.remaining, cappedLog.detail && cappedLog.detail.stalled, pushListKey(capped),
        busyRequest, busyEnd.phase, busyLog.detail && busyLog.detail.stalled, busyLog.detail && busyLog.detail.remaining, pushListKey(busy), paused.F.stateRead().phase, pushListKey(paused)],
      [null, 'done', true, 'warn', 1, false, '', null, 'done', true, 2, '', 'paused', '']);
  }
  {
    const held = pushQueue([Object.assign(editCustomer('A'), { phone: '' }), editCustomer('B')]);
    const { tried, request } = pushDrive(held);
    held.F.recordIssuesFlush();
    const heldLogs = held.run.logs.filter((event) => event.action === 'push_record_issue' && /CUS-A/.test(JSON.stringify(event)));
    const heldEnd = held.F.stateRead();
    const again = held.F.pushCandidatesAll(held.F.localScan(), held.F.pushReviewContext(heldEnd));
    check(so, 'C0: dòng thiếu trường được đánh dấu "không đủ điều kiện đẩy" đúng một lần, không bị chọn lại ở lần quét lại, chặng vẫn sạch; phép xét sau đó coi dòng là không có việc',
      [tried, request, held.run.local.customer[0].syncStatus, heldLogs.length, heldEnd.phase, /Còn \d+ bản ghi/.test(heldEnd.message), again.length],
      [['CUS-B'], null, 'không đủ điều kiện đẩy', 1, 'done', false, 0]);
  }
  {
    const store = makeSync(), SF = store.hop.FbmSync, data = store.documentProperties.data;
    SF.SHARD_LIST_BYTES = 8;
    const wrote = SF.shardListWrite('T_', ['aaaaaa', 'bbbbbb', 'cccccc']), wide = Object.keys(data).filter((key) => /^T_/.test(key)).sort();
    SF.shardListWrite('T_', ['dddddd']);
    const narrow = [data.T_0, data.T_1, data.T_2, data.T_SHARDS, SF.shardListRead('T_')];
    const capWrote = SF.shardListWrite('T_', ['aaaaaa', 'bbbbbb', 'cccccc'], 1);
    check(so, 'C0: shardListWrite trả số phần tử đã ghi, cắt theo số khóa cho phép; danh sách ngắn lại thì khóa thừa ghi rỗng (gộp được vào một lần gọi kho) và đọc lại đúng',
      [wrote, wide, narrow, capWrote, SF.shardListRead('T_')], [3, ['T_0', 'T_1', 'T_2', 'T_SHARDS'], ['dddddd', '', '', '1', ['dddddd']], 1, ['aaaaaa']]);
  }
}

module.exports = { chay };
