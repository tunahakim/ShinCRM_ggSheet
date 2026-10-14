const { dungHop, ghiO } = require('../lib/dung-hop');
const { napServer } = require('../lib/load-gas');
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

  const saved = env.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000111' }], source: 'pull' });
  check(so, 'writeGateSave pull phát signal bản ghi, làm mọi view cũ và không gọi bộ vẽ',
    [saved.ok, saved.recordIds, saved.reloadDecision.kind, saved.dirty.records, (saved.dirty.viewsStaleRevision === saved.dirty.revision), env.hop.rendered],
    [true, ['KH000001'], 'records', ['KH000001'], true, 0]);
  check(so, 'signal tăng một revision và nhả document lock',
    [env.hop.reloadStateRead().revision, env.nen.stubs._khoa.dangGiu],
    [1, false]);

  const userEnv = taoHop();
  const userSaved = userEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000112' }], source: 'user' });
  check(so, 'writeGateSave user cũng dùng signal chung',
    [userSaved.ok, userSaved.reloadDecision.kind, userSaved.dirty.records, (userSaved.dirty.viewsStaleRevision === userSaved.dirty.revision)],
    [true, 'records', ['KH000001'], true]);

  const batchEnv = taoHop();
  ghiO(batchEnv.nen, 'Customer', 5, '@CUS_MA_KH', 'KH000002');
  const batchSaved = batchEnv.hop.writeGateSave({ entity: 'customer', records: [
    { id: 'KH000001', phone: '0987000113' },
    { id: 'KH000002', phone: '0987000114' }
  ], source: 'pull' });
  check(so, 'batch nhiều mã hợp nhất thành một signal và một revision',
    [batchSaved.recordIds, batchSaved.dirty.records, batchEnv.hop.reloadStateRead().revision],
    [['KH000001', 'KH000002'], ['KH000001', 'KH000002'], 1]);

  const newEnv = taoHop();
  const newSaved = newEnv.hop.writeGateSave({ entity: 'customer', records: [{ companyName: 'Khách mới', phone: '0987000115' }], source: 'pull' });
  check(so, 'cấp mã mới chỉ phát signal bản ghi đó, không nâng config và allCore; phản hồi mang bộ đếm mới',
    [newSaved.reloadDecision.ram.mode, newSaved.dirty.config, newEnv.hop.reloadStateRead().allCore, newSaved.dirty.records, newSaved.counters],
    ['records', false, false, newSaved.recordIds, newEnv.hop.idGateCounterValues()]);
  check(so, 'lưu chỉ sửa bản ghi cũ không gửi bộ đếm', batchSaved.counters, undefined);

  const pushedEnv = taoHop();
  const pushed = pushedEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000222' }], source: 'push' });
  check(so, 'writeGateSave push dùng cùng cổng signal với pull',
    [pushed.ok, pushed.reloadDecision.kind, pushed.dirty.records, (pushed.dirty.viewsStaleRevision === pushed.dirty.revision), pushedEnv.hop.rendered],
    [true, 'records', ['KH000001'], true, 0]);

  const backgroundEnv = taoHop();
  const background = backgroundEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000333' }], source: 'background' });
  check(so, 'writeGateSave background không cần Sidebar vẫn phát signal, không vẽ',
    [background.ok, background.reloadDecision.kind, background.dirty.records, (background.dirty.viewsStaleRevision === background.dirty.revision), backgroundEnv.hop.rendered],
    [true, 'records', ['KH000001'], true, 0]);

  const statusEnv = taoHop();
  napServer(statusEnv.hop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/SyncSchema.js', 'server/sheet/SyncColumnSetup.js');
  statusEnv.hop.fbmEnsureSyncColumns('background');
  statusEnv.hop.dirtyStateClear();
  const statusNames = ['pending', 'notApplied', 'conflict', 'missing', 'error'];
  const statusResults = statusNames.map((statusName) => {
    const savedStatus = statusEnv.hop.writeGateSave({
      entity: 'customer',
      records: [{ id: 'KH000001', syncStatus: statusEnv.hop.FbmSync.SYNC_STATUS[statusName] }],
      source: 'push',
      schemas: [statusEnv.hop.DATA_SCHEMA, statusEnv.hop.SYNC_SCHEMA]
    });
    return [statusName, savedStatus.reloadDecision.kind, savedStatus.dirty.records, (savedStatus.dirty.viewsStaleRevision === savedStatus.dirty.revision)];
  });
  check(so, 'push chỉ đổi trạng thái pending/notApplied/conflict/missing/error vẫn phát dirty record và làm view cũ',
    statusResults,
    statusNames.map((statusName) => [statusName, 'records', ['KH000001'], true]));

  const schemaEnv = taoHop();
  napServer(schemaEnv.hop, 'fbm_sync/SyncSchema.js', 'server/sheet/SyncColumnSetup.js');
  schemaEnv.hop.shinViewSheetNames = () => ['!Lead'];
  schemaEnv.hop.rendered = 0;
  schemaEnv.hop.renderAllManagedViews = () => { schemaEnv.hop.rendered += 1; return { ok: true }; };
  const schema = schemaEnv.hop.fbmEnsureSyncColumns('background');
  const schemaState = schemaEnv.hop.reloadStateRead();
  check(so, 'bổ sung cột sync bằng GAS phát signal schema/allCore và làm view cũ qua cổng schema, không vẽ',
    [schema.ok, schema.changed, schema.reload.kind, schemaState.schema, schemaState.allCore, schemaState.viewsStaleRevision === schemaState.revision, schemaEnv.hop.rendered],
    [true, true, 'schema', true, true, true, 0]);

  const deletedEnv = taoHop();
  const deleted = deletedEnv.hop.deleteGateRemove({ entity: 'customer', ids: ['KH000001'] });
  check(so, 'DeleteGate hard delete cũng phát signal cho mã biến mất, không vẽ',
    [deleted.ok, deleted.hard, deleted.recordIds, deleted.reloadDecision.kind, deleted.dirty.records, (deleted.dirty.viewsStaleRevision === deleted.dirty.revision), deletedEnv.hop.rendered],
    [true, ['KH000001'], ['KH000001'], 'records', ['KH000001'], true, 0]);

  const softEnv = taoHop();
  softEnv.hop.beforeHardDelete = () => ({ allowed: false, reason: 'FBM còn giữ bản ghi' });
  const softDeleted = softEnv.hop.deleteGateRemove({ entity: 'customer', ids: ['KH000001'] });
  check(so, 'DeleteGate soft delete cũng phát signal cho mã bị đổi trạng thái',
    [softDeleted.ok, softDeleted.soft.rows.length, softDeleted.recordIds, softDeleted.reloadDecision.kind, softDeleted.dirty.records, (softDeleted.dirty.viewsStaleRevision === softDeleted.dirty.revision)],
    [true, 1, ['KH000001'], 'records', ['KH000001'], true]);

  const failedEnv = taoHop();
  let invalid;
  try {
    invalid = failedEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH-MISSING', phone: '1' }], source: 'pull' });
  } catch (err) {
    invalid = { ok: false, error: err.message };
  }
  check(so, 'ghi thất bại không phát signal thành công và không render',
    [invalid.ok, invalid.reloadDecision, invalid.dirty, failedEnv.hop.rendered],
    [false, undefined, undefined, 0]);

  const missingCommitEnv = taoHop();
  missingCommitEnv.hop.reloadDecisionForChange = undefined;
  check(so, 'thiếu hậu xử lý reload thì cửa ghi dừng trước khi chạm Sheet',
    (function () {
      try {
        missingCommitEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000555' }], source: 'background' });
        return { threw: false, value: missingCommitEnv.nen.Customer.sheet.getRange(4, 5).getValue(), locked: missingCommitEnv.nen.stubs._khoa.dangGiu };
      } catch (error) {
        return { threw: true, value: missingCommitEnv.nen.Customer.sheet.getRange(4, 5).getValue(), locked: missingCommitEnv.nen.stubs._khoa.dangGiu };
      }
    }()),
    { threw: true, value: '', locked: false });
}

module.exports = { chay };
