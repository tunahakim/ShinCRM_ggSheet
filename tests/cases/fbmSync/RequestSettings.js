/** Hàm dựng request nhận cài đặt (`cfg`) và phạm vi khách qua tham số: thiếu thì ném `FBM_REQUEST_SETTINGS_MISSING`, không lùi về tự đọc ô lượt hay Sheet. */
const fs = require('fs');
const path = require('path');
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { stripComments } = require('../../lib/strip-comments');
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');

const GAS = path.join(__dirname, '..', '..', '..', '1_ShinCRM_GAS');

// Hàm dựng request theo tệp. Tên ở đây phải còn định nghĩa trong tệp, để danh sách không mục dần mà test vẫn đạt.
const BUILDERS = {
  'fbm_sync/read/GridRead.js': ['gridRequest', 'ownerLookupRequest', 'customerBatchRequest', 'customerGridRequest', 'identityUserRequest', 'identityCheckCustomerRequest', 'activityGridRequest', 'activityBulkRequest', 'activityByIdRequest', 'conflictRefreshRequest', 'completionRequest'],
  'fbm_sync/write/RequestBuilders.js': ['formEnvelope', 'authorizeRequest', 'activityValues', 'activityCreateRequest', 'activityEditOpenRequest', 'activityEditRequest', 'customerCreateOpenRequest', 'customerCreateRequest', 'customerEditOpenRequest', 'customerEditRequest'],
  'fbm_sync/transport/ScanJob.js': ['customerListRequest', 'scanJobRequest'],
  'fbm_sync/transport/ActivityScan.js': ['activityScanRequest', 'beginActivityBulkPull', 'activityWindowPlan'],
  'fbm_sync/transport/CustomerCount.js': ['customerCountRequest'],
  'fbm_sync/reconcile/CategoryLookup.js': ['lookupBatchRequest'],
  'fbm_sync/transport/ActivityBatch.js': ['activityBatchRequest', 'gateOpen'],
  'fbm_sync/transport/TransportCore.js': ['sessionSystemRequest', 'sessionSystemEnvelope'],
  'fbm_sync/auth/LoginTools.js': ['loginRequestPlan'],
  'fbm_sync/auth/LoginRun.js': ['loginStepRequest'],
  'fbm_sync/transport/PushFlow.js': ['pushConfigErrors', 'validateAutoCustomerCode']
};
// Đọc cài đặt hay phạm vi từ kho: chỉ người điều phối được làm, hàm dựng nhận qua tham số.
const SELF_READ = /\bscriptSettings\s*\(|\bFbmSync\.scope\s*\(|\bstateRead\s*\(|\bsettingsValues?\s*\(/;

/** Thân hàm `FbmSync.<name> = function (...) { ... }` trong mã đã bỏ comment, cắt theo ngoặc khớp. */
function functionBody(src, name) {
  const match = new RegExp('FbmSync\\.' + name + '\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{').exec(src);
  if (!match) { return null; }
  let depth = 1, i = match.index + match[0].length, quote = null;
  for (; i < src.length && depth > 0; i += 1) {
    const c = src[i];
    if (quote) { if (c === '\\') { i += 1; } else if (c === quote) { quote = null; } continue; }
    if (c === '\'' || c === '"' || c === '`') { quote = c; } else if (c === '{') { depth += 1; } else if (c === '}') { depth -= 1; }
  }
  return src.slice(match.index, i);
}

function thrownCode(fn) {
  try { fn(); return 'không ném'; } catch (error) { return String(error && error.code || error && error.message || error); }
}

function chay(so) {
  section('FBM sync — hàm dựng request nhận cài đặt qua tham số');
  const hop = taoHopCat({
    FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {},
    PropertiesService: taoPropertiesService()
  });
  napServer(hop, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/RequestBuilders.js');
  const F = hop.FbmSync, MISSING = 'FBM_REQUEST_SETTINGS_MISSING';
  const state = { session: { cookie: 'cookie-thu', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' } };
  const cfg = F.scriptSettings(state), gate = { map: {}, valid: {} };

  const goi = {
    gridRequest: (c) => F.gridRequest('activity', { type: 0 }, c),
    ownerLookupRequest: (c) => F.ownerLookupRequest('activity', '800001', undefined, c),
    customerBatchRequest: (c) => F.customerBatchRequest(['A1'], undefined, null, c),
    customerGridRequest: (c) => F.customerGridRequest({ type: 0, scope: null }, c),
    identityUserRequest: (c) => F.identityUserRequest(c),
    identityCheckCustomerRequest: (c) => F.identityCheckCustomerRequest({ type: 0 }, c),
    activityGridRequest: (c) => F.activityGridRequest('A1', { type: 0 }, c),
    activityBulkRequest: (c) => F.activityBulkRequest({ type: 0 }, c),
    activityByIdRequest: (c) => F.activityByIdRequest('174813', c),
    conflictRefreshRequest: (c) => F.conflictRefreshRequest('customer', { id: 'CUS-1', fbmId: 'A1' }, c),
    completionRequest: (c) => F.completionRequest('zcfCustomer', 'ma_kh', c),
    authorizeRequest: (c) => F.authorizeRequest('customer', c),
    activityCreateRequest: (c) => F.activityCreateRequest({ id: 'ACT-9', content: 'Nội dung' }, gate, c),
    activityEditOpenRequest: (c) => F.activityEditOpenRequest('174813', c),
    activityEditRequest: (c) => F.activityEditRequest({ id: 'ACT-9', fbmId: '174813', content: 'Nội dung' }, { id: 174813 }, gate, c),
    customerCreateOpenRequest: (c) => F.customerCreateOpenRequest(c),
    customerCreateRequest: (c) => F.customerCreateRequest({ companyName: 'Mới' }, 'ALT99999', '', gate, c),
    customerEditOpenRequest: (c) => F.customerEditOpenRequest('A1', c),
    customerEditRequest: (c) => F.customerEditRequest({ fbmId: 'A1' }, { stt_rec_kh: 'A1' }, gate, c)
  };
  const ten = Object.keys(goi);
  check(so, 'Mọi hàm dựng đủ cfg thì dựng được request', ten.map((name) => [name, thrownCode(() => goi[name](cfg))]).filter((item) => item[1] !== 'không ném'), []);
  check(so, 'Mọi hàm dựng thiếu cfg thì ném FBM_REQUEST_SETTINGS_MISSING, không tự đọc ô lượt', ten.filter((name) => thrownCode(() => goi[name](undefined)) !== MISSING), []);
  // Đặt nhầm vị trí tham số (truyền cổng danh mục vào chỗ cfg) cũng bị chặn, không dựng request thiếu cookie.
  check(so, 'Truyền nhầm một đối tượng khác vào chỗ cfg thì ném, không dựng request rỗng cookie', ten.filter((name) => thrownCode(() => goi[name](gate)) !== MISSING), []);
  check(so, 'Lưới khách thiếu opt.scope thì ném FBM_REQUEST_SETTINGS_MISSING, không đoán thành quét toàn bộ',
    [thrownCode(() => F.customerGridRequest({ type: 0 }, cfg)), thrownCode(() => F.customerBatchRequest(['A1'], undefined, undefined, cfg))], [MISSING, MISSING]);
  check(so, 'scriptSettings thiếu ô lượt thì ném, không tự đọc kho ô lượt', thrownCode(() => F.scriptSettings()), MISSING);
  check(so, 'Request dùng đúng phiên của ô lượt được truyền vào, địa chỉ FBM là hằng',
    [F.identityUserRequest(cfg).body.cookie, F.authorizeRequest('activity', cfg).url.indexOf(F.FBM_BASE_URL) === 0, 'baseUrl' in cfg], ['cookie-thu', true, false]);

  section('FBM sync — hàm dựng request không tự đọc cài đặt hay phạm vi');
  const tuDoc = [], mat = [];
  Object.keys(BUILDERS).forEach((file) => {
    const src = stripComments(fs.readFileSync(path.join(GAS, file), 'utf8'));
    BUILDERS[file].forEach((name) => {
      const body = functionBody(src, name);
      if (body === null) { mat.push(file + ':' + name); } else if (SELF_READ.test(body)) { tuDoc.push(file + ':' + name); }
    });
  });
  check(so, 'Danh sách hàm dựng còn khớp mã (không tên nào đã đổi hay mất)', mat, []);
  check(so, 'Không hàm dựng nào tự gọi scriptSettings, FbmSync.scope, stateRead hay settingsValues', tuDoc, []);
  check(so, 'Phép quét bắt được hàm dựng tự đọc trên mã mẫu',
    SELF_READ.test(functionBody('FbmSync.x = function (a) { var cfg = FbmSync.scriptSettings(); return { a: "}" }; };', 'x')), true);
  return so;
}

module.exports = { chay };
