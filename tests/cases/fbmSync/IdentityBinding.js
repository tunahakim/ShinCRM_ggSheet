/** Liên kết Spreadsheet với tài khoản FBM: yêu cầu REBIND khi file có FBM ID chưa liên kết, không tự nâng cấp liên kết cũ, không ghi đè khi còn dữ liệu FBM cũ. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');

function chay(so) {
  section('FBM sync — Liên kết Spreadsheet với tài khoản FBM');
  const bindingStore = {};
  const identity = taoHopCat({ FbmSync: {}, PropertiesService: taoPropertiesService({ doc: bindingStore }) });
  napServer(identity, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  identity.FbmSync.currentSpreadsheetId = () => 'sheet-a';
  identity.FbmSync.configValue = () => '';
  identity.FbmSync.readLocal = () => [{ id: 'CUS-LINKED', fbmId: 'FBM-A' }];
  check(so, 'file co FBM ID nhung chua lien ket phai yeu cau REBIND',
    [identity.FbmSync.identityStatus().status, identity.FbmSync.identityPreflight('read').blocking, identity.FbmSync.identityPreflight('write').blocking, identity.FbmSync.identityPreflight('background').blocking, identity.FbmSync.identityPreflight('identity_check').blocking],
    ['REBIND_REQUIRED', true, true, true, false]);
  const savedBinding = identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' });
  check(so, 'luu lien ket dung Spreadsheet va tai khoan',
    [savedBinding.ok, identity.FbmSync.identityStatus({ userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' }).status],
    [true, 'BOUND']);
  bindingStore[identity.FbmSync.BINDING_KEY] = JSON.stringify({ spreadsheetId: 'sheet-a', userId: 'user-a', accountName: 'Tai khoan A' });
  const legacyBeforeRead = bindingStore[identity.FbmSync.BINDING_KEY];
  const legacyStatus = identity.FbmSync.identityStatus({ userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' });
  check(so, 'doc binding cu thieu username khong tu ghi nang cap',
    [legacyStatus.status, bindingStore[identity.FbmSync.BINDING_KEY]],
    ['REBIND_REQUIRED', legacyBeforeRead]);
  const upgradedLegacyBinding = identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' });
  check(so, 'chi thao tac luu ro rang moi nang cap username cho binding cu',
    [upgradedLegacyBinding.ok, JSON.parse(bindingStore[identity.FbmSync.BINDING_KEY]).username],
    [true, 'ANHLT']);
  check(so, 'khong cho ghi de lien ket khi du lieu FBM cu van con',
    [identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }).ok, identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }).code],
    [false, 'REBIND_REQUIRED']);
  identity.FbmSync.readLocal = () => [];
  check(so, 'sau khi xu ly du lieu cu moi cho doi lien ket',
    identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }).ok,
    true);
  identity.FbmSync.readLocal = () => [{ id: 'CUS-LINKED-NEW', fbmId: 'FBM-B' }];
  check(so, 'runtime tai khoan lech lien ket moi thi fail-closed',
    identity.FbmSync.identityStatus({ userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' }).status,
    'REBIND_REQUIRED');

  return so;
}

module.exports = { chay };
