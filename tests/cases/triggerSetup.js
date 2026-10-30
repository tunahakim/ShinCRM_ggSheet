/** Kiểm luật "chỉ chủ tệp cài trigger, mỗi trigger đúng một bản" bằng ScriptApp giả: Node không có trigger thật. */

const { taoHopCat, napServer } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

function dungCanh(opts) {
  const triggers = (opts.handlers || []).map((handler) => ({ getHandlerFunction: () => handler }));
  const created = [];
  const deleted = [];
  const snapshots = [];
  const logs = [];
  const identityReads = [];
  const builder = (handler) => {
    const b = {
      forSpreadsheet: () => b,
      onOpen: () => { b.event = 'onOpen'; return b; },
      onEdit: () => { b.event = 'onEdit'; return b; },
      onChange: () => { b.event = 'onChange'; return b; },
      create: () => { if (opts.createFails) { throw new Error('Google từ chối tạo trigger'); } created.push(handler + ':' + b.event); triggers.push({ getHandlerFunction: () => handler }); }
    };
    return b;
  };
  const book = {
    getOwner: () => { identityReads.push('owner'); return opts.owner === null ? null : { getEmail: () => opts.owner }; },
    getSheets: () => ['Customer', 'Activity'].map((name) => ({ getName: () => name }))
  };
  const hop = taoHopCat({
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      newTrigger: builder,
      deleteTrigger: (trigger) => { deleted.push(trigger.getHandlerFunction()); triggers.splice(triggers.indexOf(trigger), 1); }
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => opts.user }) },
    shinOpenBook: () => book,
    shinHeaderSnapshotWrite: (sheet) => snapshots.push(sheet.getName()),
    logEvent: (entry) => logs.push(entry),
    LOG_OK: 'ok'
  });
  napServer(hop, 'server/entry/TriggerSetup.js');
  return { hop, triggers, created, deleted, snapshots, logs, identityReads };
}

function chay(so) {
  section('Cài trigger — chỉ chủ tệp, mỗi trigger đúng một bản');

  let canh;
  try { canh = dungCanh({ owner: 'Chu@Gmail.com', user: 'chu@gmail.com', handlers: ['shinAutoShowSidebar', 'fbmLegacy'] }); } catch (err) { return ghiLoiNap(so, 'nạp server/entry/TriggerSetup.js', err); }
  const lan1 = canh.hop.triggersEnsure();
  check(so, 'chủ tệp mở Sidebar: cài đúng hai trigger thiếu, giữ trigger khác, chụp hàng 1 mọi sheet, ghi một dòng Log',
    [lan1.installed, canh.created, canh.deleted, canh.snapshots, canh.logs.length],
    [['shinOnEdit', 'shinOnChange'], ['shinOnEdit:onEdit', 'shinOnChange:onChange'], [], ['Customer', 'Activity'], 1]);

  const doc = canh.identityReads.length;
  const lan2 = canh.hop.triggersEnsure();
  check(so, 'lần mở sau khi đã đủ: không cài, không đọc danh tính, không ghi Log',
    [lan2.installed, canh.created.length, canh.identityReads.length - doc, canh.logs.length],
    [[], 2, 0, 1]);

  canh = dungCanh({ owner: 'chu@gmail.com', user: 'nhanvien@gmail.com', handlers: [] });
  const khac = canh.hop.triggersEnsure();
  check(so, 'người khác chủ tệp: không cài trigger nào, không chụp hàng 1, không ghi Log',
    [khac.skipped, canh.created, canh.snapshots, canh.logs.length],
    ['not_owner', [], [], 0]);

  canh = dungCanh({ owner: 'chu@gmail.com', user: 'chu@gmail.com', handlers: ['shinOnEdit', 'shinOnEdit', 'shinAutoShowSidebar', 'shinOnChange', 'shinOnChange', 'shinOnChange'] });
  const thua = canh.hop.triggersEnsure();
  check(so, 'hai lần mở cài trùng: xóa bản thừa, giữ đúng một bản mỗi trigger, không cài thêm, không chụp lại hàng 1',
    [thua.removed, canh.deleted, canh.created, canh.triggers.map((t) => t.getHandlerFunction()).sort(), canh.snapshots],
    [3, ['shinOnEdit', 'shinOnChange', 'shinOnChange'], [], ['shinAutoShowSidebar', 'shinOnChange', 'shinOnEdit'], []]);

  canh = dungCanh({ owner: null, user: 'chu@gmail.com', handlers: [] });
  let loi = null;
  try { canh.hop.triggersEnsure(); } catch (err) { loi = err; }
  check(so, 'tệp không có chủ (Drive dùng chung): ném lỗi có mã, không cài gì',
    [loi && loi.code, canh.created], ['TRIGGER_OWNER_UNKNOWN', []]);

  canh = dungCanh({ owner: 'chu@gmail.com', user: '', handlers: [] });
  loi = null;
  try { canh.hop.triggersEnsure(); } catch (err) { loi = err; }
  check(so, 'không đọc được email người chạy: ném lỗi có mã, không đoán là chủ tệp',
    [loi && loi.code, canh.created], ['TRIGGER_USER_UNKNOWN', []]);
}

module.exports = { chay };
