/** Mã phiên bản hợp đồng GAS–Extension: hai bên công bố đúng mã tính từ `tests/contracts/gasExtensionContract.js`. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { CONTRACT, contractVersion, extensionContractVersion } = require('../../contracts/gasExtensionContract');

async function chay(so) {
  section('FBM sync — mã phiên bản hợp đồng GAS–Extension');
  const expected = contractVersion();
  const hop = napServer(taoHopCat({ FbmSync: {} }), 'fbm_sync/protocol/Protocol.js');
  const workerCode = extensionContractVersion();
  // Sửa hợp đồng thì mã tính lại đổi; test này đỏ cho tới khi chép mã mới vào cả GAS lẫn Extension.
  check(so, 'GAS và Extension công bố đúng mã tính từ tệp hợp đồng (đổi hợp đồng thì chép mã ' + expected + ' vào Protocol.js và service_worker.js)', [hop.FbmSync.protocol.contract, workerCode], [expected, expected]);
  const envelope = hop.FbmSync.protocol.request('contract-request', 'https://fbo.com.vn:8888/service', { a: 1 }, {});
  check(so, 'envelope GAS gửi Extension mang mã hợp đồng và chỉ dùng trường đã khai trong hợp đồng', [envelope.contract, Object.keys(envelope).filter((key) => CONTRACT.request.fields.indexOf(key) < 0)], [hop.FbmSync.protocol.contract, []]);
  const lo = hop.FbmSync.protocol.batch('lo-1', [{ url: 'https://fbo.com.vn:8888/a', body: { x: 1 }, meta: { kind: 'activity_grid', entity: 'activity', waitMs: 500 } }, { url: 'https://fbo.com.vn:8888/b', body: { x: 2 }, meta: { kind: 'activity_grid' } }], { kind: 'batch', trace: { runId: 'r', requestId: 'lo-1' }, batch: { maxBytes: 10 } });
  const ngoaiHopDong = (keys, allowed) => keys.filter((key) => allowed.indexOf(key) < 0);
  check(so, 'envelope lô chỉ dùng trường đã khai: id phần tử là thứ tự, meta phần tử chỉ kind/waitMs/trace (không lộ entity hay dữ liệu nghiệp vụ)', [
    ngoaiHopDong(Object.keys(lo), CONTRACT.request.fields),
    [].concat(...lo.items.map((item) => ngoaiHopDong(Object.keys(item), CONTRACT.request.item))),
    [].concat(...lo.items.map((item) => ngoaiHopDong(Object.keys(item.meta), CONTRACT.request.itemMeta))),
    ngoaiHopDong(Object.keys(lo.meta.batch), CONTRACT.request.batch),
    lo.items.map((item) => item.id + ':' + item.meta.trace.requestId + ':' + item.meta.trace.item),
    lo.items[0].meta.waitMs
  ], [[], [], [], [], ['0:lo-1:0', '1:lo-1:1'], 500]);
  const nganSach = napServer(taoHopCat({ FbmSync: {} }), 'fbm_sync/transport/Budget.js').FbmSync;
  const B = nganSach.BUDGET;
  check(so, 'ngân sách: hạn Extension = chờ tab + mỗi request một fetch (đăng nhập nhiều fetch, mở lại trang) + waitMs; hạn GAS thu hồi cộng đường về Sidebar và lên GAS; Sidebar chờ GAS bằng trần nền tảng', [
    nganSach.budgetTimeoutMs({ meta: { kind: 'grid' } }),
    nganSach.budgetTimeoutMs({ items: [{ meta: {} }, { meta: { waitMs: 700 } }, { meta: {} }] }),
    nganSach.budgetTimeoutMs({ meta: { kind: 'login', afterLoginUrl: 'x' } }),
    nganSach.budgetDeadlineAt(1000, 25000),
    nganSach.budgetGasReplyMs()
  ], [B.tabReadyMs + B.fetchMs, B.tabReadyMs + 3 * B.fetchMs + 700, 2 * B.tabReadyMs + B.loginFetches * B.fetchMs, 1000 + 25000 + B.bridgeMs + B.gasTransitMs, B.gasHardMs + B.gasTransitMs]);
  nganSach.budgetCallBegin(1000);
  check(so, 'trần mềm lời gọi GAS tính từ lúc lời gọi bắt đầu; chưa mở lời gọi (test gọi thẳng) thì không bao giờ chạm', [nganSach.budgetCallExhausted(1000 + B.gasSoftMs - 1), nganSach.budgetCallExhausted(1000 + B.gasSoftMs), napServer(taoHopCat({ FbmSync: {} }), 'fbm_sync/transport/Budget.js').FbmSync.budgetCallExhausted(Date.now())], [false, true, false]);
  check(so, 'GAS coi response không mang mã hoặc mang mã khác là lệch, đúng mã thì cho qua', [
    hop.FbmSync.protocol.contractMismatch({ status: 200, body: '{}' }).code,
    hop.FbmSync.protocol.contractMismatch({ status: 200, body: '{}', transport: { contract: 'ma-khac' } }).received,
    hop.FbmSync.protocol.contractMismatch({ status: 200, body: '{}', transport: { contract: hop.FbmSync.protocol.contract } })
  ], ['FBM_EXTENSION_CONTRACT_MISMATCH', 'ma-khac', null]);
}

module.exports = { chay };
