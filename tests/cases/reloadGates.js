const { dungHop, ghiO } = require('../lib/dung-hop');
const { napServer, trongLanChay, dongSoCuoi } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

function taoHop() {
  const nen = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'] });
  const hop = nen.hop;
  ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'KH000001');
  hop.shinViewSheetNames = () => ['!Lead', '!Chăm sóc'];
  hop.rendered = 0;
  hop.renderedWhileLocked = false;
  hop.renderAllManagedViews = () => { hop.rendered += 1; return { ok: true }; };
  hop.renderViewSheet = () => { hop.rendered += 1; return { ok: true }; };
  return { nen, hop };
}

function chay(so) {
  section('Cổng ghi/xóa — mọi ghi thành công đều phát signal, làm view cũ và không tự vẽ');

  let env;
  try { env = taoHop(); } catch (err) { return ghiLoiNap(so, 'dựng hộp cát reload gate', err); }

  const saved = trongLanChay(env.hop, () => env.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000111' }], source: 'pull' }));
  check(so, 'writeGateSave pull phát signal bản ghi, làm mọi view cũ và không gọi bộ vẽ',
    [saved.ok, saved.recordIds, saved.reloadDecision.kind, dongSoCuoi(env.hop).customer, (env.hop.reloadStateRead().viewsStaleRevision === env.hop.reloadStateRead().revision), env.hop.rendered],
    [true, ['KH000001'], 'records', ['KH000001'], true, 0]);
  check(so, 'signal tăng một revision và nhả document lock',
    [env.hop.reloadStateRead().revision, env.nen.stubs._khoa.dangGiu],
    [1, false]);

  const userEnv = taoHop();
  const userSaved = trongLanChay(userEnv.hop, () => userEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000112' }], source: 'user' }));
  check(so, 'writeGateSave user cũng dùng signal chung',
    [userSaved.ok, userSaved.reloadDecision.kind, dongSoCuoi(userEnv.hop).customer, (userEnv.hop.reloadStateRead().viewsStaleRevision === userEnv.hop.reloadStateRead().revision)],
    [true, 'records', ['KH000001'], true]);

  const batchEnv = taoHop();
  ghiO(batchEnv.nen, 'Customer', 5, '@CUS_MA_KH', 'KH000002');
  const batchSaved = trongLanChay(batchEnv.hop, () => batchEnv.hop.writeGateSave({ entity: 'customer', records: [
    { id: 'KH000001', phone: '0987000113' },
    { id: 'KH000002', phone: '0987000114' }
  ], source: 'pull' }));
  check(so, 'batch nhiều mã hợp nhất thành một signal và một revision',
    [batchSaved.recordIds, dongSoCuoi(batchEnv.hop).customer, batchEnv.hop.reloadStateRead().revision],
    [['KH000001', 'KH000002'], ['KH000001', 'KH000002'], 1]);

  const newEnv = taoHop();
  const newSaved = trongLanChay(newEnv.hop, () => newEnv.hop.writeGateSave({ entity: 'customer', records: [{ companyName: 'Khách mới', phone: '0987000115' }], source: 'pull' }));
  check(so, 'cấp mã mới chỉ phát signal bản ghi đó, không nâng config và allCore; phản hồi mang bộ đếm mới',
    [newSaved.reloadDecision.ram.mode, dongSoCuoi(newEnv.hop).config, dongSoCuoi(newEnv.hop).core, dongSoCuoi(newEnv.hop).customer, newSaved.counters],
    ['records', undefined, undefined, newSaved.recordIds, newEnv.hop.idGateCounterValues()]);
  check(so, 'lưu chỉ sửa bản ghi cũ không gửi bộ đếm', batchSaved.counters, undefined);

  const pushedEnv = taoHop();
  const pushed = trongLanChay(pushedEnv.hop, () => pushedEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000222' }], source: 'push' }));
  check(so, 'writeGateSave push dùng cùng cổng signal với pull',
    [pushed.ok, pushed.reloadDecision.kind, dongSoCuoi(pushedEnv.hop).customer, (pushedEnv.hop.reloadStateRead().viewsStaleRevision === pushedEnv.hop.reloadStateRead().revision), pushedEnv.hop.rendered],
    [true, 'records', ['KH000001'], true, 0]);

  const backgroundEnv = taoHop();
  const background = trongLanChay(backgroundEnv.hop, () => backgroundEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000333' }], source: 'background' }));
  check(so, 'writeGateSave background không cần Sidebar vẫn phát signal, không vẽ',
    [background.ok, background.reloadDecision.kind, dongSoCuoi(backgroundEnv.hop).customer, (backgroundEnv.hop.reloadStateRead().viewsStaleRevision === backgroundEnv.hop.reloadStateRead().revision), backgroundEnv.hop.rendered],
    [true, 'records', ['KH000001'], true, 0]);

  const statusEnv = taoHop();
  napServer(statusEnv.hop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/SyncSchema.js', 'server/sheet/SyncColumnSetup.js');
  trongLanChay(statusEnv.hop, () => statusEnv.hop.fbmEnsureSyncColumns('background'));
  const statusRevision = statusEnv.hop.reloadStateRead().revision;
  const statusNames = ['pending', 'notApplied', 'conflict', 'missing', 'error'];
  const statusResults = statusNames.map((statusName) => {
    const savedStatus = trongLanChay(statusEnv.hop, () => statusEnv.hop.writeGateSave({
      entity: 'customer',
      records: [{ id: 'KH000001', syncStatus: statusEnv.hop.FbmSync.SYNC_STATUS[statusName] }],
      source: 'push',
      schemas: [statusEnv.hop.DATA_SCHEMA, statusEnv.hop.SYNC_SCHEMA]
    }));
    return [statusName, savedStatus.reloadDecision, statusEnv.hop.reloadStateRead().revision - statusRevision];
  });
  check(so, 'push chỉ đổi cột trạng thái đồng bộ (ngoài RAM) thì không phát tín hiệu nạp lại',
    statusResults,
    statusNames.map((statusName) => [statusName, undefined, 0]));

  const sameEnv = taoHop();
  ghiO(sameEnv.nen, 'Customer', 5, '@CUS_MA_KH', 'KH000002');
  trongLanChay(sameEnv.hop, () => sameEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000444' }, { id: 'KH000002', phone: '0987000445' }], source: 'pull' }));
  const revisionTruoc = sameEnv.hop.reloadStateRead().revision;
  const same = trongLanChay(sameEnv.hop, () => sameEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000444' }, { id: 'KH000002', phone: '0987000999' }], source: 'pull' }));
  check(so, 'lượt kéo ghi lại y hệt một bản ghi và đổi một bản ghi: chỉ bản ghi đổi vào tín hiệu, một revision',
    [same.recordIds, same.changedIds, dongSoCuoi(sameEnv.hop).customer, sameEnv.hop.reloadStateRead().revision - revisionTruoc],
    [['KH000001', 'KH000002'], ['KH000002'], ['KH000002'], 1]);
  const unchanged = trongLanChay(sameEnv.hop, () => sameEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000444' }], source: 'pull' }));
  check(so, 'lượt kéo không đổi giá trị nào thì revision giữ nguyên, Sidebar không nạp',
    [unchanged.ok, unchanged.changedIds, unchanged.reloadDecision, sameEnv.hop.reloadStateRead().revision - revisionTruoc],
    [true, [], undefined, 1]);

  const schemaEnv = taoHop();
  napServer(schemaEnv.hop, 'fbm_sync/SyncSchema.js', 'server/sheet/SyncColumnSetup.js');
  schemaEnv.hop.shinViewSheetNames = () => ['!Lead'];
  schemaEnv.hop.rendered = 0;
  schemaEnv.hop.renderAllManagedViews = () => { schemaEnv.hop.rendered += 1; return { ok: true }; };
  const schema = trongLanChay(schemaEnv.hop, () => schemaEnv.hop.fbmEnsureSyncColumns('background'));
  const schemaState = schemaEnv.hop.reloadStateRead();
  const schemaEntry = dongSoCuoi(schemaEnv.hop);
  check(so, 'bổ sung cột sync bằng GAS phát signal schema/allCore và làm view cũ qua cổng schema, không vẽ',
    [schema.ok, schema.changed, schema.reload.kind, schemaEntry.core, schemaEntry.core, schemaState.viewsStaleRevision === schemaState.revision, schemaEnv.hop.rendered],
    [true, true, 'schema', true, true, true, 0]);

  const deletedEnv = taoHop();
  const deleted = trongLanChay(deletedEnv.hop, () => deletedEnv.hop.deleteGateRemove({ entity: 'customer', ids: ['KH000001'] }));
  check(so, 'DeleteGate hard delete cũng phát signal cho mã biến mất, không vẽ',
    [deleted.ok, deleted.hard, deleted.recordIds, deleted.reloadDecision.kind, dongSoCuoi(deletedEnv.hop).customer, (deletedEnv.hop.reloadStateRead().viewsStaleRevision === deletedEnv.hop.reloadStateRead().revision), deletedEnv.hop.rendered],
    [true, ['KH000001'], ['KH000001'], 'records', ['KH000001'], true, 0]);

  const softEnv = taoHop();
  softEnv.hop.beforeHardDelete = () => ({ allowed: false, reason: 'FBM còn giữ bản ghi' });
  const softDeleted = trongLanChay(softEnv.hop, () => softEnv.hop.deleteGateRemove({ entity: 'customer', ids: ['KH000001'] }));
  check(so, 'DeleteGate soft delete cũng phát signal cho mã bị đổi trạng thái',
    [softDeleted.ok, softDeleted.soft.rows.length, softDeleted.recordIds, softDeleted.reloadDecision.kind, dongSoCuoi(softEnv.hop).customer, (softEnv.hop.reloadStateRead().viewsStaleRevision === softEnv.hop.reloadStateRead().revision)],
    [true, 1, ['KH000001'], 'records', ['KH000001'], true]);

  const failedEnv = taoHop();
  let invalid;
  try {
    invalid = trongLanChay(failedEnv.hop, () => failedEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH-MISSING', phone: '1' }], source: 'pull' }));
  } catch (err) {
    invalid = { ok: false, error: err.message };
  }
  check(so, 'ghi thất bại không phát signal thành công và không render',
    [invalid.ok, invalid.reloadDecision, failedEnv.hop.reloadStateRead().revision, failedEnv.hop.rendered],
    [false, undefined, 0, 0]);

  const missingCommitEnv = taoHop();
  missingCommitEnv.hop.reloadDecisionForChange = undefined;
  check(so, 'thiếu hậu xử lý reload thì cửa ghi dừng trước khi chạm Sheet',
    (function () {
      try {
        trongLanChay(missingCommitEnv.hop, () => missingCommitEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000555' }], source: 'background' }));
        return { threw: false, value: missingCommitEnv.nen.Customer.sheet.getRange(4, 5).getValue(), locked: missingCommitEnv.nen.stubs._khoa.dangGiu };
      } catch (error) {
        return { threw: true, value: missingCommitEnv.nen.Customer.sheet.getRange(4, 5).getValue(), locked: missingCommitEnv.nen.stubs._khoa.dangGiu };
      }
    }()),
    { threw: true, value: '', locked: false });

  section('saveRecord — hỏi khóa đồng bộ FBM và ghi trong cùng một lời gọi, cùng một lần giữ khóa điều phối');
  let saveEnv;
  try {
    saveEnv = taoHop();
    napServer(saveEnv.hop, 'server/service/SaveService.js', 'server/service/FbmSyncService.js');
  } catch (err) { return ghiLoiNap(so, 'nạp SaveService', err); }
  const sh = saveEnv.hop;
  const nhatKy = [];
  let giuKhoa = false;
  let traLoiKhoa = { ok: true };
  sh.FbmSync = { withOrchestrationLock: (work) => { nhatKy.push('lock'); giuKhoa = true; try { return work(); } finally { giuKhoa = false; nhatKy.push('unlock'); } } };
  sh.fbmSyncSaveAllowed = (entity, id, revision) => { nhatKy.push(['check', entity, id, revision, giuKhoa]); return traLoiKhoa; };
  const ghiGoc = sh.writeGateSave;
  sh.writeGateSave = function (req) { nhatKy.push(['write', giuKhoa]); return ghiGoc.apply(this, arguments); };

  const ok = sh.saveRecord('customer', { id: 'KH000001', phone: '0987000111', fbmHash: 'h1' });
  check(so, 'sửa bản ghi cũ: kiểm tra rồi ghi, cả hai bên trong khóa điều phối, rồi mới nhả khóa',
    [ok.ok, nhatKy, saveEnv.nen.Customer.sheet.getRange(4, saveEnv.nen.Customer.codes.indexOf('@CUS_SDT') + 1).getValue()],
    [true, ['lock', ['check', 'customer', 'KH000001', 'h1', true], ['write', true], 'unlock'], '0987000111']);

  nhatKy.length = 0;
  traLoiKhoa = { ok: false, code: 'RECORD_BUSY', message: 'Bản ghi đang được đồng bộ; hãy lưu lại sau khi đồng bộ xong.' };
  const chan = sh.saveRecord('customer', { id: 'KH000001', phone: '0987000222', fbmHash: 'h1' });
  check(so, 'đồng bộ đang khóa bản ghi: trả blocked kèm câu báo, không ghi Sheet',
    [chan.ok, chan.blocked, chan.code, chan.message, nhatKy.some((item) => item[0] === 'write'), saveEnv.nen.Customer.sheet.getRange(4, saveEnv.nen.Customer.codes.indexOf('@CUS_SDT') + 1).getValue()],
    [false, true, 'RECORD_BUSY', traLoiKhoa.message, false, '0987000111']);

  nhatKy.length = 0;
  sh.FbmSync.withOrchestrationLock = () => ({ ok: false, code: 'BUSY', message: 'GAS đang xử lý một lượt đồng bộ khác; chưa thay đổi state.' });
  const ban = sh.saveRecord('customer', { id: 'KH000001', phone: '0987000333' });
  check(so, 'không lấy được khóa điều phối: trả blocked, không kiểm tra, không ghi', [ban.blocked, ban.code, nhatKy], [true, 'BUSY', []]);

  const moi = sh.saveRecord('customer', { companyName: 'Công ty Mới', leadSource: 'Tự tìm', verifyStatus: 'Đã xác thực', fbmSyncPermission: 'Cho phép' });
  check(so, 'thêm bản ghi mới ghi thẳng, không hỏi khóa đồng bộ (chưa có mã nên không thể đang đồng bộ)', nhatKy, [['write', false]]);
  void moi;
}

module.exports = { chay };
