/**
 * Ghi ô lượt hoặc Sheet hỏng ở chặng đẩy thì không phát lệnh ghi FBM: dấu "đang đẩy" phải xuống được Sheet trước khi request rời GAS, khóa đặt trên đúng object state, lỗi ghi trạng thái ném mã FBM_SHEET_WRITE_FAILED.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas, trongLat } = require('../../lib/fbm/hop-dong-bo');
const { datUngVienDay } = require('../../lib/fbm/ung-vien-day');
const { soBan } = require('../../lib/load-gas');

async function chay(so) {
  section('FBM sync — ghi state và Sheet hỏng ở chặng đẩy');
  const orderFlow = workflowGas();
  const orderState = orderFlow.hop.FbmSync.runOpen({ phase: 'push' });
  orderState.metadata.categoryCheck = { at: Date.now(), pushed: 0 };
  orderState.mode = 'write'; orderState.phase = 'push'; orderState.entity = 'activity';
  orderState.cursor = { kind: 'push_scan', entity: 'activity', index: 0 };
  orderFlow.hop.FbmSync.stateWrite(orderState);
  datUngVienDay(orderFlow.hop, () => [{ kind: 'edit', entity: 'activity', id: 'ACT-ORDER', position: 0, record: { id: 'ACT-ORDER', fbmId: 'FBM-ACT-ORDER', taskType: 'GD', content: 'Nội dung', workDate: '2026-09-20', customerId: 'CUS-1', customerFbmCode: 'ALT00001', fbmSyncPermission: 'Cho phép', fbmHash: 'old' } }]);
  orderFlow.hop.FbmSync.pushConfigErrors = () => '';
  orderFlow.hop.FbmSync.ownerCheck = () => '';
  orderFlow.hop.FbmSync.categoryGateCheck = () => [];
  orderFlow.hop.FbmSync.pushEligibilityErrors = () => [];
  orderFlow.hop.FbmSync.activityEditOpenRequest = () => ({ url: 'https://example.test', meta: { kind: 'activity_edit_open' } });
  let orderSheetWrites = 0;
  orderFlow.hop.writeGateSave = () => { orderSheetWrites += 1; return { ok: true }; };
  const orderStateWrite = orderFlow.hop.FbmSync.stateWrite;
  let orderWriteCount = 0;
  orderFlow.hop.FbmSync.stateWrite = (state) => { orderWriteCount += 1; if (orderWriteCount === 1) { const error = new Error('quota'); error.code = 'FBM_DOCUMENT_PROPERTIES_QUOTA'; throw error; } return orderStateWrite(state); };
  let orderError = null, orderRequest = 'chưa chạy';
  try { orderRequest = trongLat(orderFlow.hop.FbmSync, () => orderFlow.hop.FbmSync.pushStageResume(orderState), orderState); } catch (error) { orderError = error; }
  // Chặng chạy trên bản sao nên dòng được đánh dấu trước khi patch ghi xuống kho (trong lát, kho cũng chỉ ghi ở cuối lát). Bất biến cần giữ: ghi ô lượt hỏng thì không request nào rời GAS; dòng "đang đẩy" mà không có lệnh ghi thì lượt sau đi đường khôi phục (FBM-027), không gửi lại mù.
  check(so, 'ghi ô lượt đẩy hỏng thì không phát request ghi FBM, ô lượt giữ dấu trang cũ, dòng ở "đang đẩy" cho lượt sau khôi phục',
    [orderError && orderError.code, orderRequest, orderSheetWrites, orderFlow.hop.FbmSync.stateRead().cursor.kind],
    ['FBM_DOCUMENT_PROPERTIES_QUOTA', 'chưa chạy', 1, 'push_scan']);
  // FBM-045: bước nạp Category gọi nextPushRequest rồi tự ghi lại object state của nó; khóa phải đặt trên chính object đó.
  const aliasFlow = workflowGas();
  const aliasState = aliasFlow.hop.FbmSync.runOpen({ phase: 'push' });
  aliasState.metadata.categoryCheck = { at: Date.now(), pushed: 0 };
  aliasState.mode = 'push'; aliasState.phase = 'push'; aliasState.entity = 'customer'; aliasState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
  aliasFlow.hop.FbmSync.stateWrite(aliasState);
  datUngVienDay(aliasFlow.hop, () => [{ kind: 'edit', id: 'CUS-ALIAS', position: 0, record: { id: 'CUS-ALIAS', fbmId: 'FBM-CUS-ALIAS', fbmHash: 'h0', fbmSyncPermission: 'Cho phép' } }]);
  ['pushConfigErrors', 'ownerCheck'].forEach((name) => { aliasFlow.hop.FbmSync[name] = () => ''; });
  ['categoryGateCheck', 'pushEligibilityErrors'].forEach((name) => { aliasFlow.hop.FbmSync[name] = () => []; });
  aliasFlow.hop.writeGateSave = () => ({ ok: true });
  aliasFlow.hop.FbmSync.customerEditOpenRequest = () => ({ url: 'https://example.test', meta: { kind: 'customer_edit_open' } });
  const aliasRequest = trongLat(aliasFlow.hop.FbmSync, () => aliasFlow.hop.FbmSync.pushStageResume(aliasState), aliasState);
  aliasFlow.hop.FbmSync.stateWrite(aliasState);
  const aliasStored = aliasFlow.hop.FbmSync.stateRead();
  check(so, 'FBM-045: hàm gọi ghi lại object state sau khi phát lệnh đẩy vẫn giữ cursor push_wait; bản ghi nằm trong sổ bận nên ghi đè state không thả nó',
    [aliasRequest && aliasRequest.meta.kind, aliasState.cursor.kind, aliasStored.cursor.kind, (soBan(aliasFlow.hop)['customer:CUS-ALIAS'] || {}).by], ['customer_edit_open', 'push_wait', 'push_wait', 'fbm']);
  // FBM-002: không ghi được `đang đẩy` xuống Sheet thì không phát lệnh ghi FBM.
  const pushingFlow = workflowGas();
  const pushingState = pushingFlow.hop.FbmSync.runOpen({ phase: 'push' });
  pushingState.metadata.categoryCheck = { at: Date.now(), pushed: 0 };
  pushingState.mode = 'write'; pushingState.phase = 'push'; pushingState.entity = 'activity';
  pushingState.cursor = { kind: 'push_scan', entity: 'activity', index: 0 };
  pushingFlow.hop.FbmSync.stateWrite(pushingState);
  ['pushConfigErrors', 'ownerCheck'].forEach((name) => { pushingFlow.hop.FbmSync[name] = () => ''; });
  ['categoryGateCheck', 'pushEligibilityErrors'].forEach((name) => { pushingFlow.hop.FbmSync[name] = () => []; });
  datUngVienDay(pushingFlow.hop, () => [{ kind: 'edit', entity: 'activity', id: 'ACT-PUSHING', position: 0, record: { id: 'ACT-PUSHING', fbmId: 'FBM-ACT-PUSHING', taskType: 'GD', content: 'Nội dung', workDate: '2026-09-20', customerId: 'CUS-1', customerFbmCode: 'ALT00001', fbmSyncPermission: 'Cho phép', fbmHash: 'old' } }]);
  pushingFlow.hop.FbmSync.activityEditOpenRequest = () => ({ url: 'https://example.test', meta: { kind: 'activity_edit_open' } });
  pushingFlow.hop.writeGateSave = () => ({ ok: false, invalid: [{ id: 'ACT-PUSHING', field: 'syncStatus', label: 'Trạng thái đồng bộ', reason: 'Giá trị không hợp lệ.' }] });
  let pushingRequest = 'chưa gọi', pushingError = null;
  try { pushingRequest = trongLat(pushingFlow.hop.FbmSync, () => pushingFlow.hop.FbmSync.pushStageResume(pushingFlow.hop.FbmSync.stateRead())); } catch (error) { pushingError = error; }
  check(so, 'không ghi được trạng thái "đang đẩy" thì không phát lệnh ghi FBM và báo lỗi có tên bản ghi',
    [pushingError && pushingError.code, pushingRequest, /ACT-PUSHING/.test(pushingError && pushingError.message)],
    ['FBM_SHEET_WRITE_FAILED', 'chưa gọi', true]);
  pushingFlow.hop.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-MARK' }] : [];
  ['markPushError', 'markPushSkippedBatch'].forEach((name) => {
    let markError = null;
    const candidate = { kind: 'edit', entity: 'activity', id: 'ACT-MARK', record: { id: 'ACT-MARK' } };
    try {
      if (name === 'markPushError') { pushingFlow.hop.FbmSync.markPushError(pushingFlow.hop.FbmSync.stateRead(), candidate, { reason: 'FBM từ chối', code: 'FBM_ERROR' }, 'activity_edit'); }
      else { pushingFlow.hop.FbmSync.markPushSkippedBatch(pushingFlow.hop.FbmSync.stateRead(), [Object.assign({}, candidate, { hold: { status: 'bỏ qua', reason: 'Chưa đủ điều kiện' } })]); }
    } catch (error) { markError = error; }
    check(so, name + ': không ghi được trạng thái bản ghi xuống Sheet thì ném lỗi để phiên dừng, không đi tiếp như đã ghi (FBM-001)',
      markError && markError.code,
      'FBM_SHEET_WRITE_FAILED');
  });
}

module.exports = { chay };
