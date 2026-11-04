/** Kiểm liên kết tài khoản FBM với Sheet: xem trạng thái không đọc Sheet, hủy liên kết bị chặn khi request FBM đang bay. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');

async function chay(so) {
  section("FBM sync — liên kết tài khoản");
  const bindingData = {};
  const identity = taoHopCat({
    FbmSync: {},
    PropertiesService: taoPropertiesService({ doc: bindingData }),
    shinOpenBook: () => ({ getId: () => 'sheet-binding-test' })
  });
  napServer(identity, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  identity.FbmSync.configValue = () => '';
  let identityLocalReads = 0;
  identity.FbmSync.readLocal = () => { identityLocalReads += 1; return []; };
  bindingData[identity.FbmSync.BINDING_KEY] = JSON.stringify({ spreadsheetId: 'sheet-binding-test', userId: '2037', username: 'anhlt', accountName: 'Le Tuan Anh' });
  const boundStatus = identity.FbmSync.identityStatus();
  check(so, 'bản chụp Sheet: đã liên kết thì xem trạng thái liên kết (Sidebar mở) không đọc Sheet Customer/Activity',
    [boundStatus.status, identityLocalReads],
    ['BOUND', 0]);
  const clearedBinding = identity.FbmSync.bindingWrite({});
  check(so, 'lưu liên kết rỗng xóa binding và khóa mọi đồng bộ thường',
    [clearedBinding.ok, clearedBinding.code, bindingData[identity.FbmSync.BINDING_KEY], clearedBinding.identityStatus.status],
    [true, 'IDENTITY_BINDING_CLEARED', undefined, 'UNBOUND']);
  bindingData[identity.FbmSync.BINDING_KEY] = JSON.stringify({ spreadsheetId: 'sheet-binding-test', userId: '2037', username: 'anhlt', accountName: 'Le Tuan Anh' });
  identity.FbmSync.stateRead = () => ({ runId: 'running-binding-test', phase: 'pull_customer', activeRequestId: 'request-binding-test' });
  const blockedBindingClear = identity.FbmSync.bindingWrite({});
  check(so, 'không hủy liên kết khi request FBM đang bay',
    [blockedBindingClear.ok, blockedBindingClear.code, Boolean(bindingData[identity.FbmSync.BINDING_KEY])],
    [false, 'SYNC_BUSY', true]);
  identity.FbmSync.stateRead = () => ({ runId: 'failed-binding-test', phase: 'error', activeRequestId: '' });
  const clearedFailedBinding = identity.FbmSync.bindingWrite({});
  check(so, 'lỗi cầu nối đã kết thúc vẫn cho phép hủy liên kết',
    [clearedFailedBinding.ok, clearedFailedBinding.code, bindingData[identity.FbmSync.BINDING_KEY]],
    [true, 'IDENTITY_BINDING_CLEARED', undefined]);
}

module.exports = { chay };
