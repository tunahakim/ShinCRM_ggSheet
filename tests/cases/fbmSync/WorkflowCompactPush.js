/**
 * State chặng đẩy chỉ giữ dấu trang: không chép bản xem trước Activity dài hay payload ứng viên, dựng lại ứng viên từ Sheet khi cần, xem trước quá lớn tự cắt và probe state chỉ trả kích thước.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas, trongLat } = require('../../lib/fbm/hop-dong-bo');
const { datState } = require('../../lib/fbm/dat-state');
const { datUngVienDay } = require('../../lib/fbm/ung-vien-day');

async function chay(so) {
  section('FBM sync — state chặng đẩy gọn');
  const compactLookupFlow = workflowGas();
  compactLookupFlow.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
  datState(compactLookupFlow.hop.FbmSync, { session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const pushState = compactLookupFlow.hop.FbmSync.stateRead();
  pushState.metadata.categoryBlocks = [];
  pushState.metadata.categoryLookupFailed = false;
  pushState.metadata.categoryCheck = { at: Date.now(), pushed: 0 };
  compactLookupFlow.hop.FbmSync.previewRecords('activity', [{ customerId: 'CUS-1', workDate: '2026-09-20', taskType: 'GD', content: 'x'.repeat(4000) }]);
  pushState.mode = 'write'; pushState.phase = 'push'; pushState.entity = 'activity'; pushState.cursor = { kind: 'push_scan', entity: 'activity', index: 0 };
  compactLookupFlow.hop.FbmSync.stateWrite(pushState);
  datUngVienDay(compactLookupFlow.hop, () => [{ kind: 'edit', entity: 'activity', id: 'ACT-QUOTA', position: 0, record: { id: 'ACT-QUOTA', fbmId: 'FBM-ACT-QUOTA', taskType: 'CODE-3', content: 'Nội dung', workDate: '2026-09-20', customerId: 'CUS-1', customerFbmCode: 'ALT00001', fbmSyncPermission: 'Cho phép', fbmHash: 'old' } }]);
  compactLookupFlow.hop.FbmSync.pushConfigErrors = () => '';
  compactLookupFlow.hop.FbmSync.ownerCheck = () => '';
  compactLookupFlow.hop.FbmSync.categoryGateCheck = () => [];
  compactLookupFlow.hop.FbmSync.pushEligibilityErrors = () => [];
  compactLookupFlow.hop.writeGateSave = () => ({ ok: true });
  compactLookupFlow.hop.FbmSync.activityEditOpenRequest = () => ({ url: 'https://example.test', meta: { kind: 'activity_edit_open' } });
  const pushRequest = trongLat(compactLookupFlow.hop.FbmSync, () => compactLookupFlow.hop.FbmSync.pushStageResume(pushState), pushState);
  const pushWaitState = compactLookupFlow.hop.FbmSync.stateRead();
  const pushRawState = compactLookupFlow.documentProperties.data.FBM_SYNC_STATE_V1 || '';
  let pushRawParsed = null; try { pushRawParsed = JSON.parse(pushRawState); } catch (ignorePushRaw) {}
  check(so, 'state push không lưu preview Activity dài hoặc payload candidate', [
    Buffer.byteLength(JSON.stringify(pushWaitState), 'utf8') < compactLookupFlow.hop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT,
    pushWaitState.cursor.kind,
    pushWaitState.cursor.candidate && Object.prototype.hasOwnProperty.call(pushWaitState.cursor.candidate, 'categoryGate'),
    pushWaitState.cursor.candidate && Object.prototype.hasOwnProperty.call(pushWaitState.cursor.candidate, 'record'),
    compactLookupFlow.hop.FbmSync.previewRead().activities[0].content.length,
    String(pushRawState).indexOf('x'.repeat(4000)),
    Object.prototype.hasOwnProperty.call(pushWaitState.metadata, 'categoryGate'),
    pushState.cursor.kind,
    pushRequest && pushRequest.meta && pushRequest.meta.kind,
    pushRawState.length,
    pushRawParsed && pushRawParsed.cursor && pushRawParsed.cursor.kind
  ], [true, 'push_wait', false, false, 163, -1, false, 'push_wait', 'activity_edit_open', pushRawState.length, 'push_wait']);
  check(so, 'state push raw size remains below quota after candidate compact',
    Buffer.byteLength(pushRawState, 'utf8') < compactLookupFlow.hop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT,
    true);
  compactLookupFlow.hop.FbmSync.readLocal = (entity) => entity === 'activity'
    ? [{ id: 'ACT-QUOTA', fbmId: 'FBM-ACT-QUOTA', content: 'x'.repeat(4000), customerId: 'CUS-1' }]
    : [{ id: 'CUS-1', fbmId: 'FBM-CUS-1', fbmCustomerCode: 'ALT00001' }];
  const hydratedCandidate = compactLookupFlow.hop.FbmSync.hydratePushCandidate(pushWaitState.cursor.candidate);
  check(so, 'candidate compact được dựng lại từ Sheet trước bước push tiếp theo',
    [hydratedCandidate.record.content.length, hydratedCandidate.record.customerFbmCode, hydratedCandidate.record.stt_rec],
    [4000, 'ALT00001', 'FBM-CUS-1']);
  const createCursor = { operation: 'customer_create_open', entity: 'customer', candidate: { kind: 'create', id: 'CUS-COMPACT', entity: 'customer' } };
  const createState = compactLookupFlow.hop.FbmSync.stateRead(); createState.cursor = createCursor;
  compactLookupFlow.hop.FbmSync.customerCreateRequest = () => ({ url: 'https://example.test', meta: { kind: 'customer_create_save' } });
  compactLookupFlow.hop.FbmSync.extractAutoCustomerCode = () => 'ALT00099';
  compactLookupFlow.hop.FbmSync.validateAutoCustomerCode = () => ({ ok: true });
  compactLookupFlow.hop.FbmSync.pushOperationStep(createState, { d: { ClientScript: "_ma_kh_auto = 'ALT00099';" } }, {});
  compactLookupFlow.hop.FbmSync.stateWrite(createState);
  check(so, 'candidate compact giữ mã Customer tự sinh cho nhánh khôi phục',
    compactLookupFlow.hop.FbmSync.stateRead().cursor.candidate.autoCode,
    'ALT00099');
  compactLookupFlow.documentProperties.setProperty('FBM_SYNC_STATE_V1', pushRawState);
  // Chữ có dấu 3 byte: mười khách đủ dài là vượt trần một khóa; bản xem trước phải tự bỏ bớt dòng chứ không làm hỏng lần ghi.
  compactLookupFlow.hop.FbmSync.previewClear();
  compactLookupFlow.hop.FbmSync.previewRecords('customer', Array.from({ length: 10 }, () => ({ fbmCustomerCode: 'Ữ'.repeat(80), companyName: 'Ữ'.repeat(160), fbmId: 'Ữ'.repeat(80) })));
  const previewRaw = compactLookupFlow.documentProperties.data[compactLookupFlow.hop.FbmSync.PREVIEW_KEY] || '';
  check(so, 'preview quá lớn tự cắt dưới trần khóa riêng và không nằm trong state',
    [compactLookupFlow.hop.FbmSync.previewRead().truncated, previewRaw.length > 0 && Buffer.byteLength(previewRaw, 'utf8') <= compactLookupFlow.hop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT, String(compactLookupFlow.documentProperties.data.FBM_SYNC_STATE_V1).indexOf('preview')],
    [true, true, -1]);
  compactLookupFlow.hop.FbmSync.previewClear();
  const probeState = compactLookupFlow.hop.FbmSync.stateRead();
  compactLookupFlow.documentProperties.setProperty('FBM_SYNC_PENDING_PUSHES_V1', 'x'.repeat(42));
  const probe = compactLookupFlow.hop.fbmSyncStateProbe();
  check(so, 'probe state chỉ trả kích thước từng nhánh, không trả payload', [
    probe.ok, probe.state.parseOk, probe.state.cursorKind, 'metadataCategoryGateBytes' in probe.state,
    probe.state.metadataCategoryBlocksBytes > 0, probe.state.branchBytes.metadata > 0, probe.state.sessionLookupsBytes, Array.isArray(probe.extensionResponses), probe.largestProperties.some((item) => item.key === 'FBM_SYNC_STATE_V1'),
    JSON.stringify(probe).indexOf('ACT-QUOTA') < 0
  ], [true, true, 'push_wait', false, true, true, 2, true, true, true]);
}

module.exports = { chay };
