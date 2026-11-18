/**
 * Danh mục FBM lớn không được chép vào state (trần một khóa kho là 9 KB): gate dựng lại từ Sheet Category, mã bị chặn vào Log, state cũ còn bản sao map vẫn ghi được và bỏ bản sao đó.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { datState } = require('../../lib/fbm/dat-state');
const { TRANG_FBM_THU } = require('../../lib/load-gas');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

async function chay(so) {
  section('FBM sync — danh mục FBM không phình state');
  const compactLookupFlow = workflowGas();
  const compactLookupNames = {}, compactLookupMap = {}, compactLookupValid = {}, compactLookupAllNames = {};
  const liveCategoryCounts = [63, 11, 12, 17];
  compactLookupFlow.hop.FbmSync.SYNC_LOOKUPS.forEach((item, index) => {
    compactLookupNames[item.key] = {};
    compactLookupValid[item.key] = {};
    for (let categoryIndex = 0; categoryIndex < liveCategoryCounts[index]; categoryIndex += 1) {
      const code = categoryIndex === 0 ? 'CODE-' + index : 'LIVE-' + index + '-' + categoryIndex;
      const name = 'Tên danh mục live ' + index + ' ' + categoryIndex + ' có tên đủ dài';
      const value = 'Giá trị Sheet ' + index + ' ' + categoryIndex;
      compactLookupNames[item.key][code] = name;
      compactLookupValid[item.key][code] = true;
      compactLookupValid[item.key][value] = true;
      compactLookupMap[item.key + '\u001f' + value] = code;
      compactLookupAllNames[code] = name;
    }
  });
  compactLookupFlow.hop.FbmSync.readCategoryGate = () => ({ map: compactLookupMap, names: compactLookupAllNames, namesBySource: compactLookupNames, valid: compactLookupValid, warnings: [] });
  compactLookupFlow.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
  datState(compactLookupFlow.hop.FbmSync, { session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  compactLookupFlow.hop.FbmSync.runSlice(() => compactLookupFlow.hop.FbmSync.start({ mode: 'write', origin: 'manual', scan: 'full' }, compactLookupFlow.hop.FbmSync.stateRead()));
  const compactContinue = (body, items) => {
    const requestId = compactLookupFlow.hop.FbmSync.stateRead().activeRequestId;
    return compactLookupFlow.hop.FbmSync.runSlice(() => compactLookupFlow.hop.FbmSync.continue(Object.assign({ ok: true, status: 200, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ stage: 'executor_response_sent', requestId }] } }, items ? { items } : { body: JSON.stringify(body) })));
  };
  compactContinue({ d: { TotalRowCount: 1, Rows: [[2037, 'ANHLT', 'Le Tuan Anh']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] } } });
  compactContinue({ d: { Authorized: 'customer-auth' } });
  compactContinue({ d: { Authorized: 'activity-auth' } });
  // Chụp state ngay trước khi đối chiếu Category: đó là lúc danh mục FBM còn nằm trong state.
  let compactLookupSnapshot = '';
  const compactPrepare = compactLookupFlow.hop.FbmSync.prepareCategoryGate;
  compactLookupFlow.hop.FbmSync.prepareCategoryGate = (state, logs) => { compactLookupSnapshot = JSON.stringify(state); return compactPrepare(state, logs); };
  const compactLast = compactContinue(null, compactLookupFlow.hop.FbmSync.SYNC_LOOKUPS.map((item, index) => {
    const rows = Object.keys(compactLookupNames[item.key]).map((code) => [code, compactLookupNames[item.key][code]]);
    rows.push(...Array.from({ length: 700 }, (_, rowIndex) => ['NOISE-' + index + '-' + rowIndex, 'Tên dài để mô phỏng danh mục lớn']));
    return { id: String(index), ok: true, status: 200, body: JSON.stringify({ d: { TotalRowCount: rows.length, Rows: rows } }) };
  }));
  const compactPairValue = JSON.parse(compactLookupSnapshot).session.lookups['@CAT_TINH_THANH'].pairs['CODE-0'];
  const compactState = compactLookupFlow.hop.FbmSync.stateRead();
  const compactStateBytes = Buffer.byteLength(compactLookupSnapshot, 'utf8');
  check(so, 'lookup lớn không chép map Category vào state; gate dựng lại từ Sheet Category vẫn đủ mã (FBM-042)', [
    compactLast.request && compactLast.request.meta.kind,
    compactStateBytes < compactLookupFlow.hop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT,
    compactPairValue,
    compactLookupSnapshot.indexOf('NOISE-') < 0,
    Object.prototype.hasOwnProperty.call(compactState.metadata, 'categoryGate'),
    JSON.stringify(compactState).indexOf('categoryGateOfRun') < 0,
    Object.keys(compactLookupFlow.hop.FbmSync.stateCategoryGate(compactState).map || {}).length,
    Object.keys(compactLookupFlow.hop.FbmSync.stateCategoryGate(compactState).namesBySource || {}).length,
    Object.keys(compactState.session.lookups || {}).length,
    compactLookupFlow.hop.FbmSync.categoryValueAllowed(compactLookupFlow.hop.FbmSync.stateCategoryGate(compactState), '@CAT_TINH_THANH', 'CODE-0')
  ], ['scan_job', true, 'Tên danh mục live 0 0 có tên đủ dài', true, false, true, 86, 3, 0, { ok: true, code: 'CODE-0' }]);
  const blockFlow = workflowGas(), blockLogs = [];
  blockFlow.hop.logEvent = (event) => blockLogs.push(event);
  blockFlow.hop.FbmSync.readCategoryGate = () => ({ map: {}, names: {}, namesBySource: { '@CAT_NGUON_KH': { HDDV: 'Hóa đơn dịch vụ' } }, valid: {}, warnings: [] });
  const blockLookups = {};
  blockFlow.hop.FbmSync.SYNC_LOOKUPS.forEach((item) => { blockLookups[item.key] = { pairs: item.key === '@CAT_NGUON_KH' ? { HDDV: 'Hóa đơn đầu vào - đầu ra' } : { X: 'x' } }; });
  blockLookups['@CAT_CONG_VIEC'] = { pairs: {} };
  blockFlow.hop.FbmSync.prepareCategoryGate({ mode: 'push', metadata: {}, session: { lookups: blockLookups } }, blockLogs);
  const blockRows = blockLogs.filter((event) => event.action === 'category_block');
  check(so, 'mã danh mục bị chặn vào Sheet Log kèm tên FBM hiện tại; thiếu danh sách FBM là lỗi chặn cả chiều đẩy (tài liệu 09/03)',
    [blockRows.length, blockRows.map((event) => event.outcome).sort().join(','), blockRows.some((event) => event.recordId === 'HDDV' && /Hóa đơn đầu vào - đầu ra/.test(event.reason)), blockRows.some((event) => /@CAT_CONG_VIEC/.test(event.reason) && /toàn bộ chiều đẩy/.test(event.reason))],
    [2, 'error,warn', true, true]);
  const legacyGateState = compactLookupFlow.hop.FbmSync.stateRead();
  legacyGateState.metadata.categoryGate = { map: Object.fromEntries(Array.from({ length: 400 }, (_, i) => ['@CAT_TINH_THANH' + String.fromCharCode(31) + 'Tỉnh ' + i, 'CODE-' + i])) };
  let legacyGateError = '';
  try { compactLookupFlow.hop.FbmSync.stateWrite(legacyGateState); } catch (error) { legacyGateError = String(error && error.code || error); }
  check(so, 'state cũ còn bản sao map Category lớn hơn 9 KB vẫn ghi được và bỏ bản sao đó, Sidebar không kẹt (FBM-042)',
    [legacyGateError, Object.prototype.hasOwnProperty.call(compactLookupFlow.hop.FbmSync.stateRead().metadata, 'categoryGate')], ['', false]);
}

module.exports = { chay };
