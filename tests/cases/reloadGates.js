const { dungHop, ghiO } = require('../lib/dung-hop');
const { napServer } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

function taoHop() {
  const nen = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'] });
  const hop = nen.hop;
  ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'KH000001');
  hop.shinViewSheetNames = () => ['!Lead', '!Chăm sóc'];
  hop.rendered = 0;
  hop.renderAllManagedViewsIfAllowed = () => { hop.rendered += 1; return { ok: true, rendered: 2 }; };
  return { nen, hop };
}

function chay(so) {
  section('Cổng ghi/xóa — mọi ghi thành công đều phát signal và render độc lập Sidebar');

  let env;
  try { env = taoHop(); } catch (err) { return ghiLoiNap(so, 'dựng hộp cát reload gate', err); }

  const saved = env.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000111' }], source: 'pull' });
  check(so, 'writeGateSave pull phát signal bản ghi + allViews và render sau lock',
    [saved.ok, saved.recordIds, saved.reloadDecision.kind, saved.dirty.records, saved.dirty.allViews, env.hop.rendered],
    [true, ['KH000001'], 'records', ['KH000001'], true, 1]);

  const pushedEnv = taoHop();
  const pushed = pushedEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000222' }], source: 'push' });
  check(so, 'writeGateSave push dùng cùng cổng signal với pull',
    [pushed.ok, pushed.reloadDecision.kind, pushed.dirty.records, pushed.dirty.allViews, pushedEnv.hop.rendered],
    [true, 'records', ['KH000001'], true, 1]);

  const backgroundEnv = taoHop();
  const background = backgroundEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000333' }], source: 'background' });
  check(so, 'writeGateSave background không cần Sidebar vẫn phát signal và render',
    [background.ok, background.reloadDecision.kind, background.dirty.records, background.dirty.allViews, backgroundEnv.hop.rendered],
    [true, 'records', ['KH000001'], true, 1]);

  const schemaEnv = taoHop();
  napServer(schemaEnv.hop, 'fbm_sync/SyncSchema.js');
  schemaEnv.hop.shinViewSheetNames = () => ['!Lead'];
  schemaEnv.hop.rendered = 0;
  schemaEnv.hop.renderAllManagedViewsIfAllowed = () => { schemaEnv.hop.rendered += 1; return { ok: true }; };
  const schema = schemaEnv.hop.fbmEnsureSyncColumns('background');
  check(so, 'bổ sung cột sync bằng GAS phát signal schema/allCore/allViews qua cổng schema',
    [schema.ok, schema.changed, schema.reload.kind, schemaEnv.hop.reloadStateRead().schema, schemaEnv.hop.reloadStateRead().allCore, schemaEnv.hop.reloadStateRead().allViews, schemaEnv.hop.rendered],
    [true, true, 'schema', true, true, true, 1]);

  const deletedEnv = taoHop();
  const deleted = deletedEnv.hop.deleteGateRemove({ entity: 'customer', ids: ['KH000001'] });
  check(so, 'DeleteGate hard delete cũng phát signal cho mã biến mất và render',
    [deleted.ok, deleted.hard, deleted.recordIds, deleted.reloadDecision.kind, deleted.dirty.records, deleted.dirty.allViews, deletedEnv.hop.rendered],
    [true, ['KH000001'], ['KH000001'], 'records', ['KH000001'], true, 1]);

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
}

module.exports = { chay };
