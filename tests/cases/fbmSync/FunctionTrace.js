/** Kiểm tra cặp log hàm FBM: input/output thường giữ nguyên, payload và bí mật không lọt ra Log. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');

function chay(so) {
  section('FBM sync - detailed function trace');
  const events = [];
  const hop = taoHopCat({
    FbmSync: {},
    PropertiesService: { getDocumentProperties: () => ({ getProperty: () => '[]', setProperty: () => {} }) },
    logTraceCoversSource: () => true,
    logTrace: (entry) => events.push(entry),
    logIsSecretKey: (key) => /password|cookie|token|secret/i.test(String(key || '')),
    logMaskLabel: () => '[secret]'
  });
  napServer(hop, 'fbm_sync/diagnostic/Trace.js');
  hop.FbmSync.traceFunctionTarget = (input) => ({ ordinary: input.ordinary, request: { body: 'actual-fbm-payload' } });
  hop.FbmSync.traceFunctionFailure = () => { throw new Error('trace failure'); };
  hop.FbmSync.functionTraceEnsure();
  hop.FbmSync.traceFunctionTarget({ ordinary: 'actual-input', password: 'do-not-log' });
  try { hop.FbmSync.traceFunctionFailure(); } catch (ignore) {}

  const reasons = events.map((event) => String(event.reason || ''));
  check(so, 'hàm có đủ log khởi chạy và kết thúc thành công', [events.filter((event) => event.action === 'function_started').length, events.filter((event) => event.action === 'function_succeeded').length], [2, 1]);
  check(so, 'hàm lỗi có log kết thúc lỗi', events.filter((event) => event.action === 'function_failed').length, 1);
  check(so, 'input thông thường giữ nguyên giá trị thật', reasons.some((reason) => reason.indexOf('actual-input') >= 0), true);
  check(so, 'password và payload không xuất hiện nguyên văn', [reasons.some((reason) => reason.indexOf('do-not-log') >= 0), reasons.some((reason) => reason.indexOf('actual-fbm-payload') >= 0)], [false, false]);
  check(so, 'payload có dấu tóm tắt', reasons.some((reason) => reason.indexOf('"payload":true') >= 0), true);
  return so;
}

module.exports = { chay };
