/** Cổng chặng đẩy `FBM_SYNC_PUSH_GATE_V1` (thiết kế K6, 5.8): phép quyết thuần bỏ chặng, ngưỡng chấp thuận và dấu tập; lượt nền khớp dấu thì không đọc Sheet; chạm ngưỡng thì không ghi FBM mà chờ lời duyệt gắn đúng dấu tập. */
const { section, check } = require('../../lib/assert');
const { datPhan } = require('../../lib/fbm/cai-dat-thu');
const { pushQueue, editCustomer, pushOk, pushDrive } = require('../../lib/fbm/hang-day');

async function chay(so) {
  section('FBM sync — cổng chặng đẩy và chấp thuận theo dấu tập');
  // Cổng của chặng đẩy (C1, K6): `FBM_SYNC_PUSH_GATE_V1` giữ trạng thái chặng đẩy gần nhất (sạch, chờ duyệt, đang mở) kèm dấu bốn phần đọc trước lần quét; lượt nền khớp dấu thì không đọc Sheet, không đẩy.
  const gateOf = (q) => q.F.pushGateRead();
  const syncedCustomer = (q, x) => { const row = editCustomer(x); row.fbmHash = q.F.hash(row, 'customer', q.F.stateCategoryGate(q.F.stateRead())); return row; };
  const reopenPush = (q, approved, origin) => { const st = q.F.runOpen({ phase: 'push', origin: origin }); st.approvedFingerprint = approved || ''; st.mode = 'write'; st.phase = 'push'; st.cursor = { kind: 'push_scan', entity: 'customer', index: 0 }; st.metadata.categoryCheck = { at: Date.now(), pushed: 0 }; q.F.stateWrite(st); };
  const approvalNotices = (q) => q.run.hop._notices.filter((row) => row[1] === 'fbm_push_approval').map((row) => row[0]);
  {
    const F = pushQueue([]).F, now = { rev: 7, failures: '', scope: '', account: 'Le Tuan Anh' };
    const bg = { origin: 'background', scan: 'detail' }, gate = (status, extra) => Object.assign({ status, mark: Object.assign({}, now) }, extra || {});
    check(so, 'C1: phép quyết bỏ chặng đẩy: lượt tay và Quét nhanh luôn chạy; chưa có cổng hoặc chặng trước dở dang thì chạy; lệch phần dấu nào thì chạy kèm tên phần; cổng sạch hoặc chờ duyệt mà dấu khớp mới bỏ',
      [F.pushGateSkip({ origin: 'manual', scan: 'detail' }, gate('clean'), now), F.pushGateSkip({ origin: 'background', scan: 'full' }, gate('clean'), now), F.pushGateSkip(bg, null, now),
        F.pushGateSkip(bg, gate('open'), now).reason,
        F.pushGateSkip(bg, gate('clean', { mark: Object.assign({}, now, { rev: 6 }) }), now).reason, F.pushGateSkip(bg, gate('clean', { mark: Object.assign({}, now, { failures: 'customer:CUS-A=h' }) }), now).reason,
        F.pushGateSkip(bg, gate('clean', { mark: Object.assign({}, now, { scope: 'limited:ALT00010', account: '' }) }), now).reason, F.pushGateSkip(bg, gate('clean'), now), F.pushGateSkip(bg, gate('pending'), now)],
      [{ open: true, reason: 'manual' }, { open: true, reason: 'bypass_scan' }, { open: true, reason: 'no_gate' }, 'unfinished', 'changed:rev', 'changed:failures', 'changed:scope,account', { open: false, reason: 'clean' }, { open: false, reason: 'pending' }]);
    const a = { entity: 'customer', id: 'CUS-A', hash: 'h1' }, b = { entity: 'customer', id: 'CUS-B', hash: 'h2' };
    const fp = F.candidateSetFingerprint([a, b]);
    check(so, 'C1: dấu tập không phụ thuộc thứ tự dòng, đổi khi một dòng đổi nội dung; dòng chỉ ghi trạng thái chờ sửa (hold) không tính vào ngưỡng',
      [F.candidateSetFingerprint([b, a]) === fp, F.candidateSetFingerprint([a, Object.assign({}, b, { hash: 'h3' })]) === fp, F.pushGateDecide({ candidates: [a, Object.assign({ hold: true }, b)], threshold: 2, approved: '' }).code],
      [true, false, 'PUSH_RUN']);
    check(so, 'C1: quyết đầu chặng: dưới ngưỡng thì đẩy; chạm ngưỡng chờ duyệt; lượt mang dấu duyệt khớp tập thì đẩy, lệch thì chờ duyệt; 0 là luôn hỏi',
      [F.pushGateDecide({ candidates: [a], threshold: 2, approved: '' }).code, F.pushGateDecide({ candidates: [a, b], threshold: 2, approved: '' }).code, F.pushGateDecide({ candidates: [a, b], threshold: 2, approved: fp }).code,
        F.pushGateDecide({ candidates: [a, b], threshold: 2, approved: 'khac-2' }).code, F.pushGateDecide({ candidates: [a], threshold: 0, approved: '' }).code],
      ['PUSH_RUN', 'PUSH_AWAITING_APPROVAL', 'PUSH_APPROVED_RUN', 'PUSH_AWAITING_APPROVAL', 'PUSH_AWAITING_APPROVAL']);
  }
  {
    const q = pushQueue([]);
    q.run.local.customer.push(syncedCustomer(q, 'A'));
    q.run.hop.reloadJournalRead = () => ({ rev: 41 });
    const end = q.F.pushStageOpen(q.F.stateRead()), clean = gateOf(q);
    const capped = pushQueue(['A', 'B'].map(editCustomer));
    capped.F.pushGateWrite({ status: 'clean', mark: { rev: 1 }, at: 1 });
    capped.F.SHARD_LIST_BYTES = 8; capped.F.BUDGET.pushPassesMax = 1;
    const cappedFirst = capped.F.pushStageOpen(capped.F.stateRead()), openAtBegin = gateOf(capped).status;
    pushOk(capped);
    check(so, 'C1: chặng đẩy quét không còn ứng viên thì ghi cổng sạch kèm dấu đọc trước lần quét; chặng có việc ghi cổng đang mở ngay từ đầu; dừng không sạch thì cổng vẫn đang mở',
      [end, clean.status, clean.mark, !!cappedFirst, openAtBegin, capped.F.stateRead().phase, gateOf(capped).status],
      [null, 'clean', { rev: 41, failures: '', scope: '', account: '' }, true, 'open', 'done', 'open']);
  }
  {
    const q = pushQueue(['A'].map(editCustomer));
    const reads = { count: 0 }, readBefore = q.F.readLocal;
    q.F.readLocal = (entity) => { reads.count += 1; return readBefore(entity); };
    q.F.preflightNeedsLocal = () => true;
    const preflightCalls = [];
    q.F.preflightLocal = (options) => { preflightCalls.push(options.scan); return { ok: true, issues: [], blocking: [], warnings: [], candidateCount: 1 }; };
    q.F.preflightApply = () => null;
    q.run.hop.logTrace = (entry) => q.run.logs.push(entry);
    const mark = q.F.pushGateMark();
    q.F.pushGateWrite({ status: 'clean', mark, at: 1 });
    const st = q.F.stateRead(); st.origin = 'background'; st.scan = 'detail'; q.F.stateWrite(st);
    const stepped = q.F.preflightLocalStep(q.F.stateRead()), gated = q.F.stateRead(), stage = q.F.pushStageOpen(gated);
    const closedTrace = q.run.logs.filter((event) => event.action === 'push_gate_closed');
    const full = q.F.stateRead(); full.scan = 'full'; full.pushGate = undefined; q.F.stateWrite(full);
    const fullState = q.F.stateRead(); q.F.preflightLocalStep(fullState);
    check(so, 'C1: lượt nền khớp dấu thì cổng đóng: không chạy kiểm dữ liệu ShinCRM, không đọc Sheet, không phát request đẩy, giữ cổng, ghi một dòng vết; Quét nhanh nền vẫn kiểm',
      [stepped, gated.pushGate, stage, reads.count, q.F.stateRead().phase, gateOf(q).mark, closedTrace.length, preflightCalls, fullState.pushGate],
      [null, { open: false, reason: 'clean' }, null, 0, 'done', mark, 1, ['full'], { open: true, reason: 'bypass_scan' }]);
  }
  {
    const q = pushQueue(['A'].map(editCustomer));
    q.run.documentProperties.setProperty('FBM_SYNC_PUSH_GATE_V1', 'hỏng');
    const st = q.F.stateRead(); st.origin = 'background'; st.scan = 'detail'; q.F.stateWrite(st);
    const gate = q.F.pushGateCheck(q.F.stateRead(), { origin: 'background', scan: 'detail', mode: 'write' });
    const warn = q.run.logs.filter((event) => event.action === 'push_gate_read');
    q.run.hop.reloadJournalRead = () => ({ rev: 3 });
    q.F.pushGateWrite({ status: 'clean', mark: Object.assign(q.F.pushGateMark(), { rev: 2 }), at: 1 });
    check(so, 'C1: cổng hỏng thì Log cảnh báo rồi chạy chặng đẩy, không coi là chưa có cổng một cách im lặng; sửa Sheet sau lần đẩy sạch (sổ nạp lại tăng) thì chạy',
      [gate, warn.length, warn[0] && warn[0].outcome, q.F.pushGateCheck(q.F.stateRead(), { origin: 'background', scan: 'detail', mode: 'write' })],
      [{ open: true, reason: 'no_gate' }, 1, 'warn', { open: true, reason: 'changed:rev' }]);
  }

  // Chấp thuận theo dấu tập (K6, cách B): chạm ngưỡng thì không phát lệnh ghi nào, lượt kết thúc bình thường với cổng chờ duyệt và thông báo nút Chấp thuận; nút đó mở lượt tay mang dấu tập, chỉ lượt đó được đẩy và chỉ khi tập dựng lại khớp dấu.
  {
    const q = pushQueue(['A', 'B'].map(editCustomer));
    datPhan(q.run.hop, 'run', { approvalThreshold: 2 });
    const first = q.F.pushStageResume(q.F.stateRead()), pending = gateOf(q);
    check(so, 'K6: tập chạm ngưỡng thì không phát lệnh ghi FBM, lượt xong bình thường, cổng chờ duyệt giữ dấu tập và số bản ghi (không có trường lời duyệt), thông báo chờ duyệt bật, Log ghi lý do',
      [first, q.F.stateRead().phase, pending.status, pending.count, /^[0-9a-f]{8}-2$/.test(pending.fingerprint), 'approvedFingerprint' in pending, approvalNotices(q), q.run.logs.filter((e) => e.action === 'push_awaiting_approval').length, q.run.writes.length],
      [null, 'done', 'pending', 2, true, false, ['raise'], 1, 0]);
    const raised = q.run.hop._notices.filter((row) => row[1] === 'fbm_push_approval')[0][2];
    check(so, 'K6: thông báo chờ duyệt chỉ có một nút Chấp thuận mang dấu tập',
      raised.actions, [{ label: 'Chấp thuận', action: 'fbmPushApprove', value: pending.fingerprint }]);
    reopenPush(q, pending.fingerprint);
    const pushed = pushDrive(q);
    check(so, 'K6: lượt tay mang đúng dấu tập thì đẩy cả tập ngay, Log ghi lời duyệt; đẩy xong quét lại sạch thì cổng sạch, thông báo gỡ',
      [pushed.tried, q.run.logs.filter((e) => e.action === 'push_batch_approved').length, gateOf(q).status, approvalNotices(q).slice(-1)],
      [['CUS-A', 'CUS-B'], 1, 'clean', ['resolve']]);
  }
  {
    const q = pushQueue(['A', 'B'].map(editCustomer));
    datPhan(q.run.hop, 'run', { approvalThreshold: 2 });
    q.F.pushStageResume(q.F.stateRead());
    const asked = gateOf(q).fingerprint;
    q.run.local.customer[1].companyName = 'Cty B sửa sau khi hiện thông báo';
    reopenPush(q, asked);
    const again = q.F.pushStageResume(q.F.stateRead());
    check(so, 'K6: có người sửa dòng sau lúc hiện thông báo thì lượt mang dấu cũ không đẩy gì: phiếu mới thay phiếu cũ, thông báo hiện số mới',
      [again, q.run.writes.length, gateOf(q).status, gateOf(q).fingerprint !== asked, q.run.logs.filter((e) => e.action === 'push_batch_approved').length, approvalNotices(q).slice(-1)], [null, 0, 'pending', true, 0, ['raise']]);
  }
  {
    const q = pushQueue(['A', 'B'].map(editCustomer));
    datPhan(q.run.hop, 'run', { approvalThreshold: 2 });
    q.F.pushStageResume(q.F.stateRead());
    const asked = gateOf(q).fingerprint;
    reopenPush(q, '', 'background');
    const bg = q.F.pushStageResume(q.F.stateRead());
    check(so, 'K6: lượt nền không mang lời duyệt nên không bao giờ tự đẩy tập chạm ngưỡng, kể cả khi tập không đổi',
      [bg, q.run.writes.length, gateOf(q).status, gateOf(q).fingerprint], [null, 0, 'pending', asked]);
  }
  {
    const q = pushQueue(['A', 'B', 'C'].map(editCustomer));
    datPhan(q.run.hop, 'run', { approvalThreshold: 2 });
    q.F.pushStageResume(q.F.stateRead());
    reopenPush(q, gateOf(q).fingerprint);
    const pushed = pushDrive(q, (id) => { if (id === 'CUS-A') { q.run.local.customer[1].companyName = 'Cty B sửa giữa lượt'; q.run.local.customer[2].companyName = 'Cty C sửa giữa lượt'; } });
    check(so, 'K6: hai dòng sửa giữa lượt đã duyệt (phần còn lại chạm ngưỡng) thì không đẩy nội dung chưa ai duyệt: hoãn, lần quét lại không nhận phần mới, chặng dừng không sạch và Log ghi lý do',
      [pushed.tried, q.F.stateRead().phase, gateOf(q).status, q.run.logs.filter((e) => e.action === 'push_unfinished').length],
      [['CUS-A'], 'done', 'open', 1]);
  }
  {
    const q = pushQueue(['A', 'B'].map(editCustomer));
    datPhan(q.run.hop, 'run', { approvalThreshold: 2 });
    q.F.pushStageResume(q.F.stateRead());
    q.run.local.customer.splice(0, 2, syncedCustomer(q, 'A'), syncedCustomer(q, 'B'));
    reopenPush(q);
    const end = q.F.pushStageResume(q.F.stateRead());
    check(so, 'K6: Sheet quay về khớp FBM trước khi duyệt thì lượt kế quét sạch: cổng sạch, thông báo chờ duyệt gỡ',
      [end, gateOf(q).status, approvalNotices(q).slice(-1)], [null, 'clean', ['resolve']]);
  }
  {
    const q = pushQueue(['A', 'B'].map(editCustomer));
    datPhan(q.run.hop, 'run', { approvalThreshold: 2 });
    q.F.pushStageResume(q.F.stateRead());
    const options = { origin: 'background', scan: 'detail', mode: 'write' };
    const st = q.F.stateRead(); st.origin = 'background'; st.scan = 'detail'; q.F.stateWrite(st);
    check(so, 'K6/K5: lượt nền gặp cổng chờ duyệt mà không gì đổi thì bỏ chặng đẩy (không quét lại, không hỏi lại)',
      q.F.pushGateCheck(q.F.stateRead(), options), { open: false, reason: 'pending' });
  }

  return so;
}

module.exports = { chay };
