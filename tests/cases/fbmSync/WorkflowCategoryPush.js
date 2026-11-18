/**
 * Chiều đẩy đọc lại danh mục FBM giữa các lô: FBM đổi tên một mã giữa lượt thì chỉ bản ghi dùng mã đó bị chặn; không lấy được danh mục hoặc chạm trần lỗi đẩy thì lượt dừng paused chứ không đẩy mù.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas, trongLat } = require('../../lib/fbm/hop-dong-bo');
const { datPhan } = require('../../lib/fbm/cai-dat-thu');
const { buocDayLoi } = require('../../lib/fbm/buoc-day');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

async function chay(so) {
  section('FBM sync — kiểm lại danh mục FBM giữa các lô đẩy');
  // Chiều đẩy kiểm lại danh mục FBM giữa các lô: FBM đổi tên một mã giữa lượt thì chỉ bản ghi dùng mã đó bị chặn.
  const categoryPushRun = (options) => {
    const flow = workflowGas(), F = flow.hop.FbmSync, logs = [], sheetSaves = [], fbmNames = { WEB: 'Web', HDDV: 'Hóa đơn dịch vụ' }, lookupAt = [], issued = [];
    // Ca này thử danh mục giữa các lô, không thử cổng chấp thuận: nâng ngưỡng qua cổng cài đặt để 25 bản ghi đi thẳng.
    datPhan(flow.hop, 'run', { approvalThreshold: 1000 });
    flow.hop.logEvent = (event) => logs.push(event);
    F.readCategoryGate = () => ({ map: {}, names: {}, valid: {}, warnings: [], namesBySource: { '@CAT_TINH_THANH': {}, '@CAT_NGUON_KH': { WEB: 'Web', HDDV: 'Hóa đơn dịch vụ' }, '@CAT_CONG_VIEC': {} } });
    // 25 khách vừa sửa trên Sheet (hash khác mốc); chặng đẩy tự quét và xét bằng phép xét thật.
    const rows = Array.from({ length: 25 }, (_, index) => {
      const id = 'C-' + String(index + 1).padStart(2, '0');
      return { id, fbmId: 'F-' + id, fbmHash: 'h', fbmSyncPermission: 'Cho phép', leadCode: ['C-03', 'C-22', 'C-23'].indexOf(id) >= 0 ? 'HDDV' : 'WEB' };
    });
    ['pushConfigErrors', 'ownerCheck'].forEach((name) => { F[name] = () => ''; });
    F.pushEligibilityErrors = () => [];
    F.readLocal = (entity) => entity === 'customer' ? rows : [];
    // Mỗi lệnh đẩy giả lập đều lỗi để đi tiếp hàng đợi; nâng trần cầu dao để không cắt ngang 25 bản ghi.
    if (!(options && options.realBreaker)) { F.BUDGET = Object.assign({}, F.BUDGET, { pushFailuresMax: 100 }); }
    F.categoryGateCheck = (record, entity, gate) => {
      const reason = gate.blocked['@CAT_NGUON_KH\u001f' + record.leadCode];
      return reason ? [{ result: { ok: false, reason } }] : [];
    };
    F.customerEditOpenRequest = (fbmId) => ({ url: 'https://fbm.test/edit', body: { id: fbmId }, meta: { kind: 'customer_edit_open' } });
    // Sheet giả giữ trạng thái vừa ghi, như Sheet thật: dòng đã đánh dấu chờ sửa thì lần quét lại không chọn lại.
    flow.hop.writeGateSave = (input) => { sheetSaves.push(...input.records); input.records.forEach((saved) => { const row = rows.find((item) => item.id === saved.id); if (row) { Object.assign(row, saved); } }); return { ok: true }; };
    const verified = { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' };
    const state = F.runOpen({ phase: 'push' });
    state.mode = 'push'; state.phase = 'push'; state.entity = 'customer'; state.session = verified; state.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
    F.stateWrite(state);
    const resumed = trongLat(F, () => F.pushStageResume(F.stateRead()));
    let envelope = F.sliceIssue(F.stateRead(), resumed), lastStep = null;
    for (let guard = 0; envelope && guard < 60; guard += 1) {
      if (envelope.meta.kind !== 'batch') {
        const current = F.stateRead(); issued.push(current.cursor.candidate.id);
        lastStep = buocDayLoi(F, { reason: options && options.longReason ? 'FBM từ chối trường địa chỉ liên hệ của khách. '.repeat(30) : 'Giả lập FBM từ chối để đi tiếp hàng đợi', code: 'FBM_ERROR' });
        envelope = lastStep.request; continue;
      }
      lookupAt.push(F.stateRead().cursor.at);
      if (lookupAt.length === 2) { fbmNames.HDDV = 'Hóa đơn đầu vào'; }
      const items = [0, 1, 2].map((id) => (lookupAt.length === 2 && options && options.failSecond && id === 1)
        ? { id: String(id), ok: false, status: 500, body: '' }
        : { id: String(id), ok: true, status: 200, body: JSON.stringify({ d: id === 1 ? Object.keys(fbmNames).map((code) => [code, fbmNames[code]]) : [['X', 'x']] }) });
      lastStep = F.runSlice(() => F.continue({ ok: true, status: 200, items, transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: envelope.id }] } }));
      envelope = lastStep.request;
    }
    return { F, logs, sheetSaves, lookupAt, issued, lastStep };
  };
  const renamed = categoryPushRun();
  const unknownStatus = renamed.F.SYNC_STATUS.unknownCategory;
  check(so, 'FBM đổi tên một mã giữa hai lô đẩy: lô danh mục đọc lại đúng chỗ dừng, bản ghi dùng mã đó bị chặn và vào Log, bản ghi khác vẫn đẩy', [
    renamed.lookupAt,
    renamed.issued,
    renamed.sheetSaves.filter((row) => row.syncStatus === unknownStatus).map((row) => row.id),
    renamed.logs.filter((event) => event.action === 'category_block').map((event) => event.recordId + ':' + event.outcome),
    renamed.F.stateRead().phase
  ], [
    [0, 20],
    Array.from({ length: 21 }, (_, index) => 'C-' + String(index + 1).padStart(2, '0')).concat(['C-24', 'C-25']),
    ['C-22', 'C-23'],
    ['HDDV:warn'],
    'done'
  ]);
  const lookupLost = categoryPushRun({ failSecond: true });
  const lostState = lookupLost.F.stateRead();
  check(so, 'giữa lượt đẩy không lấy được danh mục FBM thì dừng paused, không đẩy tiếp, Sidebar thấy lý do và Log ghi lỗi', [
    lookupLost.issued.length, lostState.phase, lookupLost.lastStep.request, lookupLost.F.statusView().phase,
    lookupLost.logs.filter((event) => event.action === 'category_block' && event.outcome === 'error').map((event) => event.reason),
    (lookupLost.F.statusView().metadata.categoryBlocks || []).map((block) => block.source + ': ' + block.reason)
  ], [20, 'paused', null, 'paused', ['@CAT_NGUON_KH: Không lấy được danh mục FBM (TRANSPORT_ERROR). Bỏ toàn bộ chiều đẩy kỳ này.'], ['@CAT_NGUON_KH: Không lấy được danh mục FBM (TRANSPORT_ERROR).']]);
  const breaker = categoryPushRun({ realBreaker: true, longReason: true }), breakerState = breaker.F.stateRead();
  const breakerStoreText = breaker.F.props().getProperty(breaker.F.PUSH_FAILURES_KEY), breakerStore = JSON.parse(breakerStoreText);
  check(so, 'bản ghi đẩy lỗi chạm pushFailuresMax thì dừng paused, không gửi thêm lệnh FBM, Sidebar thấy tổng và lý do, Log ghi lỗi; khóa lỗi đẩy vẫn dưới 9.000 byte dù lý do dài', [
    breaker.issued.length, breakerState.phase, breakerState.lastFailureCode, breaker.lastStep.request, breaker.F.statusView().metadata.pushFailureCount,
    /20 bản ghi đẩy lỗi/.test(breaker.F.statusView().message), breaker.logs.filter((event) => event.action === 'push_failures_limit' && event.outcome === 'error').length,
    Buffer.byteLength(breakerStoreText, 'utf8') <= 9000, Object.keys(breakerStore.details).length, Object.keys(breakerStore.details).slice(-1)[0],
    breaker.F.props().getProperty('FBM_SYNC_STATE_V1').indexOf('pushFailure') < 0
  ], [breaker.F.BUDGET.pushFailuresMax, 'paused', 'PUSH_FAILURES_LIMIT', null, 20, true, 1, true, breaker.F.BUDGET.pushFailureDetailsMax, 'customer:C-20', true]);
  const dueState = { metadata: { categoryCheck: { at: 1000, pushed: 3 } } }, dueBudget = renamed.F.BUDGET;
  check(so, 'danh mục đọc quá lookupMaxAgeMs thì phải đọc lại trước bản ghi đẩy kế, kể cả khi chưa đủ pushBatchRecords', [
    renamed.F.pushLookupDue(dueState, 1000 + dueBudget.lookupMaxAgeMs - 1), renamed.F.pushLookupDue(dueState, 1000 + dueBudget.lookupMaxAgeMs), renamed.F.pushLookupDue({ metadata: {} }, 1000)
  ], [false, true, true]);
}

module.exports = { chay };
