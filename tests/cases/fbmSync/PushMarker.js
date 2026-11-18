/** Tạo và sửa Activity qua dấu #SC: mở form rồi lưu type 1, lệnh tạo nhận ID FBM và đọc xác nhận khớp hash, lệnh dọn dấu (G12) chỉ cảnh báo khi hỏng, lệnh sửa không gắn dấu và ghi "đẩy không ăn" khi FBM vẫn giữ dấu. */
const { section, check } = require('../../lib/assert');
const { dungHopDay, moQuetDay, activityMoi } = require('../../lib/fbm/hop-day');
const { datUngVienDay } = require('../../lib/fbm/ung-vien-day');
const { buocDay, buocDayLoi } = require('../../lib/fbm/buoc-day');
const { trongLat } = require('../../lib/fbm/hop-dong-bo');

async function chay(so) {
  section('FBM sync — push: tạo, sửa Activity và dọn dấu #SC');
  const hop = dungHopDay(), push = hop.push;
  const pushLogs = [];
  push.logEvent = (event) => pushLogs.push(event);
  push.FbmSync.readLocal = () => [];
  datUngVienDay(push, () => [activityMoi(push.FbmSync)]);
  push.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '1.test', accountName: 'Owner' });
  const activityEditState = push.FbmSync.runOpen({ phase: 'push' });
  // Mốc là bản FBM đang có (FBM chưa đổi từ lần đồng bộ trước), nên bước mở form được phép lưu.
  const activityEditBase = push.FbmSync.hash({ fbmId: '174813', content: 'Noi dung cu', taskType: 'GD', workDate: '2026-09-09' }, 'activity', { map: {} });
  activityEditState.cursor = { kind: 'push_wait', operation: 'activity_edit_open', entity: 'activity', index: 0, candidate: { entity: 'activity', id: 'ACT-008600', record: { id: 'ACT-008600', fbmId: '174813', content: 'Noi dung moi', taskType: 'GD', workDate: '2026-09-09', fbmHash: activityEditBase } } };
  push.FbmSync.stateWrite(activityEditState);
  const activitySave = buocDay(push.FbmSync, { d: { Controller: 'zccrAccountTask', Row: (function () { const row = []; row[0] = 174813; row[3] = 'GD'; row[10] = '2026-09-09'; row[15] = 'Noi dung cu'; row[21] = 'Owner'; return row; }()), Showing: "_ticket = 'ticket-1';" } });
  check(so, 'Activity edit tu response mo form tao request type 1',
    [activitySave.body.type, activitySave.body.memvars.length, push.FbmSync.stateRead().cursor.operation, Object.prototype.hasOwnProperty.call(push.FbmSync.stateRead().cursor, 'oldValues')],
    [1, 36, 'activity_edit_save', false]);
  const activityPushState = moQuetDay(hop, 'activity');
  const activityCreate = trongLat(push.FbmSync, () => push.FbmSync.pushStageResume(activityPushState), activityPushState);
  check(so, 'Activity moi dung request New va marker',
    [activityCreate.meta.kind, activityCreate.body.action, activityCreate.body.memvars.filter((item) => item.Name === 'details')[0].NewValue, push.FbmSync.stateRead().cursor.operation],
    ['activity_create', 'New', 'Nội dung #SC-ACT-NEW', 'activity_create']);
  const activityResponse = buocDay(push.FbmSync, { d: { InternalValues: [{ Name: 'id', Value: 42 }] } });
  check(so, 'Activity New nhan ID FBM va tao request doc xac nhan',
    [activityResponse.meta.kind, activityResponse.meta.id, push.FbmSync.stateRead().counts.succeeded, push.FbmSync.stateRead().phase],
    ['activity_edit_open', '42', 0, 'push']);
  const verifyRecord = { id: 'ACT-VERIFY', fbmId: '42', customerFbmCode: 'ALT00010', taskType: 'Goi', content: 'Noi dung', workDate: '2026-09-09', owner: 'Owner', fbmHash: 'base', syncStatus: push.FbmSync.SYNC_STATUS.pushed };
  push.FbmSync.readLocal = () => [verifyRecord];
  push.writeGateSave = () => ({ ok: true });
  const verifyState = push.FbmSync.runOpen({ phase: 'push' });
  verifyState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_verify', sentHash: push.FbmSync.hash(verifyRecord, 'activity', { map: {} }), candidate: { entity: 'activity', kind: 'create', id: verifyRecord.id, record: verifyRecord } };
  push.FbmSync.stateWrite(verifyState);
  const verifyRow = []; verifyRow[0] = 42; verifyRow[3] = 'Goi'; verifyRow[10] = new Date('2026-09-09T00:00:00Z'); verifyRow[15] = 'Noi dung #SC-ACT-VERIFY';
  const markerClean = buocDay(push.FbmSync, { d: { Controller: 'zccrAccountTask', Row: verifyRow } });
  const markerCleanDetails = markerClean && markerClean.body.memvars.filter((item) => item.Name === 'details')[0];
  check(so, 'G12: lệnh tạo Activity xác nhận xong mà FBM còn dấu #SC thì gửi ngay lệnh sửa Edit theo ID FBM với nội dung sạch',
    [markerClean && markerClean.body.action, markerClean && markerClean.body.values[0], markerCleanDetails && markerCleanDetails.OldValue, markerCleanDetails && markerCleanDetails.NewValue, push.FbmSync.stateRead().cursor.operation],
    ['Edit', '42', 'Noi dung #SC-ACT-VERIFY', 'Noi dung', 'activity_marker_clean']);
  check(so, 'Activity chỉ tính đã đẩy sau khi đọc xác nhận khớp hash',
    [push.FbmSync.stateRead().counts.pushed, pushLogs.some((event) => event.action === 'push_record')],
    [1, false]);
  const cleanWrites = [];
  push.writeGateSave = (request) => { cleanWrites.push(request); return { ok: true }; };
  push.FbmSync.recordIssues = {};
  buocDay(push.FbmSync, { d: {} });
  check(so, 'G12: lệnh bỏ dấu thành công thì không ghi lại Sheet, không có cảnh báo và đi tiếp',
    [cleanWrites.length, Object.keys(push.FbmSync.recordIssues).length, push.FbmSync.stateRead().cursor.operation === 'activity_marker_clean'],
    [0, 0, false]);
  const cleanFailState = push.FbmSync.runOpen({ phase: 'push' });
  cleanFailState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_marker_clean', candidate: { entity: 'activity', kind: 'create', id: verifyRecord.id, record: verifyRecord } };
  push.FbmSync.stateWrite(cleanFailState);
  const truocBoDau = pushLogs.length;
  buocDayLoi(push.FbmSync, { code: 'FBM_ERROR', reason: 'Lỗi thử' });
  // Lượt đóng ở cửa ghi state nên nhóm cảnh báo đã được xả ra Log ngay lúc đó.
  const cleanIssue = pushLogs.slice(truocBoDau).filter((event) => /_record_issue$/.test(event.action))[0] || {};
  check(so, 'G12: lệnh bỏ dấu hỏng chỉ cảnh báo ở Log và câu chốt Sidebar, không đánh lỗi giao dịch',
    [cleanIssue.outcome, /Chưa bỏ được dấu nhận diện #SC/.test(cleanIssue.reason || ''), cleanWrites.length, push.FbmSync.stateRead().counts.error, /chưa bỏ được dấu #SC/.test(push.FbmSync.stateRead().message)],
    ['warn', true, 0, 0, true]);
  const keptRecord = Object.assign({}, verifyRecord, { id: 'ACT-KEPT', syncStatus: push.FbmSync.SYNC_STATUS.pushed });
  push.FbmSync.readLocal = () => [keptRecord];
  const keptState = push.FbmSync.runOpen({ phase: 'push' });
  keptState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_verify', sentHash: push.FbmSync.hash(keptRecord, 'activity', { map: {} }), candidate: { entity: 'activity', kind: 'edit', id: keptRecord.id, record: keptRecord } };
  push.FbmSync.stateWrite(keptState);
  const keptRow = verifyRow.slice(); keptRow[15] = 'Noi dung #SC-ACT-KEPT';
  buocDay(push.FbmSync, { d: { Controller: 'zccrAccountTask', Row: keptRow } });
  check(so, 'G12: lệnh sửa không mang dấu mà FBM vẫn giữ dấu thì ghi "đẩy không ăn" để không xếp dọn lại mỗi lượt',
    [cleanWrites.slice(-1)[0].records[0].syncStatus, /chưa bỏ được dấu #SC/.test(push.FbmSync.stateRead().message)],
    [push.FbmSync.SYNC_STATUS.notApplied, true]);
  const cleanEdit = push.FbmSync.activityEditRequest({ id: 'ACT-1', fbmId: 5, content: 'Nội dung' }, { id: 5, details: 'Nội dung #SC-ACT-1' }, {}, push.FbmSync.scriptSettings(push.FbmSync.stateRead()));
  check(so, 'G12: lệnh sửa Activity không gắn dấu #SC, chỉ lệnh tạo gắn',
    cleanEdit.body.memvars.filter((item) => item.Name === 'details')[0].NewValue,
    'Nội dung');
}

module.exports = { chay };
