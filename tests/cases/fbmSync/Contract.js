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
  check(so, 'GAS coi response không mang mã hoặc mang mã khác là lệch, đúng mã thì cho qua', [
    hop.FbmSync.protocol.contractMismatch({ status: 200, body: '{}' }).code,
    hop.FbmSync.protocol.contractMismatch({ status: 200, body: '{}', transport: { contract: 'ma-khac' } }).received,
    hop.FbmSync.protocol.contractMismatch({ status: 200, body: '{}', transport: { contract: hop.FbmSync.protocol.contract } })
  ], ['FBM_EXTENSION_CONTRACT_MISMATCH', 'ma-khac', null]);
}

module.exports = { chay };
