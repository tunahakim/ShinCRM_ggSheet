/** Kéo Activity về qua cửa ghi: dấu #SC nhận lại bản ghi, xung đột định danh, giao dịch của tài khoản mình, người tạo, nối lại khách cha, thứ tự mã FBM. */
const { section, check } = require('../../lib/assert');
const { giuBanGhiDongBo, soBan } = require('../../lib/load-gas');
const { keoVe } = require('../../lib/fbm/keo-ve');
const { hopKeoVe, congDanhMucThu } = require('../../lib/fbm/hop-keo');

function chay(so) {
  section('FBM sync — Kéo Activity về qua cửa ghi');
  const builders = hopKeoVe();
  const gate = congDanhMucThu();
  builders.FbmSync.readCategoryGate = () => gate;
  let recoveryWrite;
  let recoveryState = { session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' }, metadata: {} };
  builders.FbmSync.stateRead = () => recoveryState;
  giuBanGhiDongBo(builders, 'activity', 'ACT-9');
  builders.FbmSync.stateWrite = (next) => { recoveryState = next; return next; };
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: '', customerId: 'KH-1', syncStatus: builders.FbmSync.SYNC_STATUS.pushing }];
  builders.writeGateSave = (request) => { recoveryWrite = request; return { ok: true }; };
  const recovered = keoVe(builders.FbmSync, 'activity', [builders.FbmSync.activityRecord({ id: 77, ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung #SC-ACT-9' }, gate, { sttRec: 'S9' })], 'write');
  check(so, 'Activity marker recovery vá FBM ID không tạo dòng mới và nhả bản ghi đồng bộ đang giữ',
    [recovered.written, recoveryWrite.records[0].id, recoveryWrite.records[0].fbmId, soBan(builders)['activity:ACT-9']],
    [1, 'ACT-9', '77', undefined]);
  let markerConflictWrite, markerState = { session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' }, metadata: { seen: { customer: {}, activity: {} } }, counts: { conflict: 0 } };
  builders.FbmSync.stateRead = () => markerState;
  builders.FbmSync.stateWrite = (next) => { markerState = next; return next; };
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: 'OLD-FBM', customerId: 'KH-1', content: 'Nội dung cũ', taskType: 'Gọi', workDate: '/Date(1757386800000)/', fbmHash: 'old-hash' }];
  builders.writeGateSave = (request) => { markerConflictWrite = request; return { ok: true }; };
  const markerConflict = keoVe(builders.FbmSync, 'activity', [builders.FbmSync.activityRecord({ id: 'NEW-FBM', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung mới #SC-ACT-9' }, gate, { sttRec: 'S9' })]);
  check(so, 'Activity marker trỏ FBM ID khác ghi trạng thái xung đột chờ quyết lên Sheet, không cất bản ghi vào state',
    [markerConflict.conflicts, 'conflicts' in markerState.metadata, markerConflictWrite.records[0].syncStatus],
    [1, false, builders.FbmSync.SYNC_STATUS.conflict]);
  // Xung đột định danh không so được bằng hash: lượt sau bản FBM của chính dòng về khớp hai phía vẫn không được gỡ xung đột, vì một FBM ID khác vẫn mang dấu trỏ vào dòng đó.
  const markerOwnFbm = builders.FbmSync.activityRecord({ id: 'OLD-FBM', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung cũ' }, gate, { sttRec: 'S9' });
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: 'OLD-FBM', customerId: 'KH-1', content: 'Nội dung cũ', taskType: 'Gọi', workDate: '/Date(1757386800000)/', fbmHash: 'old-hash', syncStatus: builders.FbmSync.SYNC_STATUS.conflict }];
  markerConflictWrite = null;
  const markerAgain = keoVe(builders.FbmSync, 'activity', [markerOwnFbm, builders.FbmSync.activityRecord({ id: 'NEW-FBM', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung mới #SC-ACT-9' }, gate, { sttRec: 'S9' })]);
  check(so, 'Activity đang xung đột định danh (dấu của FBM ID khác trỏ vào) không bị nhánh so ba chiều gỡ, không ghi trạng thái khác lên dòng; ô Xung đột của phiên đếm dòng đó đúng một lần dù cả nhánh dấu và nhánh so cùng chạm',
    [markerAgain.conflicts, markerAgain.conflictsKept, markerAgain.skipped, ((markerConflictWrite && markerConflictWrite.records) || []).filter((r) => r.id === 'ACT-9' && r.syncStatus !== builders.FbmSync.SYNC_STATUS.conflict).length],
    [0, 1, 0, 0]);
  // G12: giao dịch đã đồng bộ của chính tài khoản mà FBM còn dấu #SC thì xếp đẩy sửa để bỏ dấu; của tài khoản khác thì không đụng.
  const settingsBeforeMarker = builders.FbmSync.scriptSettings;
  gate.map['@CAT_CONG_VIECGọi'] = 'GOI'; gate.valid['@CAT_CONG_VIEC'] = { 'Gọi': true, GOI: true };
  const markedIncoming = builders.FbmSync.activityRecord({ id: 'FBM-9', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung #SC-ACT-9', owner: 'Chủ tài khoản' }, gate, { sttRec: 'S9' });
  let markedWrite = null;
  builders.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Chủ tài khoản' });
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: 'FBM-9', customerId: 'KH-1', content: 'Nội dung', taskType: 'Gọi', workDate: '/Date(1757386800000)/', enteredBy: 'Chủ tài khoản', fbmHash: markedIncoming.incomingHash, syncStatus: builders.FbmSync.SYNC_STATUS.synced }];
  builders.writeGateSave = (request) => { markedWrite = request; return { ok: true }; };
  keoVe(builders.FbmSync, 'activity', [Object.assign({}, markedIncoming)]);
  const ownMarked = markedWrite && markedWrite.records[0].syncStatus;
  markedWrite = null;
  builders.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Đồng nghiệp' });
  keoVe(builders.FbmSync, 'activity', [Object.assign({}, markedIncoming)]);
  check(so, 'G12: lượt kéo xếp "chờ đối soát" cho giao dịch của mình còn dấu #SC trên FBM, không đụng giao dịch tài khoản khác',
    [ownMarked, markedWrite && markedWrite.records[0].syncStatus],
    [builders.FbmSync.SYNC_STATUS.pending, null]);
  // Người tạo trên FBM đứng ngoài fingerprint: nội dung không đổi thì hash không lộ, lượt kéo vẫn phải ghi tên người tạo xuống ShinCRM.
  const ownerIncoming = builders.FbmSync.activityRecord({ id: 'FBM-10', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung', owner: 'Sale Cũ' }, gate, { sttRec: 'S9' });
  let ownerWrite = null;
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-10', fbmId: 'FBM-10', customerId: 'KH-1', content: 'Nội dung', taskType: 'Gọi', workDate: '/Date(1757386800000)/', enteredBy: '', fbmHash: ownerIncoming.incomingHash, syncStatus: builders.FbmSync.SYNC_STATUS.synced }];
  builders.writeGateSave = (request) => { ownerWrite = request; return { ok: true }; };
  keoVe(builders.FbmSync, 'activity', [Object.assign({}, ownerIncoming)]);
  check(so, 'Người tạo trên FBM: lượt kéo ghi owner FBM vào enteredBy khi nội dung không đổi, không đổi trạng thái đồng bộ',
    [ownerIncoming.enteredBy, ownerWrite && ownerWrite.records.length, ownerWrite && ownerWrite.records[0].id, ownerWrite && ownerWrite.records[0].enteredBy, ownerWrite && ownerWrite.records[0].syncStatus],
    ['Sale Cũ', 1, 'ACT-10', 'Sale Cũ', undefined]);
  // Người dùng lỡ xóa mã khách ở dòng giao dịch: quan hệ cha đứng ngoài fingerprint nên hash không lộ; lượt kéo phải nối lại theo FBM và để dấu ở Log, nếu không ngày giao dịch cuối của khách lệch FBM mãi.
  const linkIncoming = builders.FbmSync.activityRecord({ id: 'FBM-11', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung', owner: 'Sale Cũ' }, gate, { sttRec: 'S9' });
  let linkWrite = null;
  const linkLogged = [];
  const recordIssueAddBefore = builders.FbmSync.recordIssueAdd;
  builders.FbmSync.recordIssueAdd = (stage, entity, status, id, reason) => { linkLogged.push(id + '|' + reason); return null; };
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-11', fbmId: 'FBM-11', customerId: '', content: 'Nội dung', taskType: 'Gọi', workDate: '/Date(1757386800000)/', enteredBy: 'Sale Cũ', fbmHash: linkIncoming.incomingHash, syncStatus: builders.FbmSync.SYNC_STATUS.synced }];
  builders.writeGateSave = (request) => { linkWrite = request; return { ok: true }; };
  const linkResult = keoVe(builders.FbmSync, 'activity', [Object.assign({}, linkIncoming)]);
  builders.FbmSync.recordIssueAdd = recordIssueAddBefore;
  check(so, 'Giao dịch mất mã khách trên Sheet: lượt kéo nối lại vào khách ShinCRM theo FBM, ghi một dòng Log, tính vào số bản ghi đã ghi Sheet, không đổi nội dung hay trạng thái đồng bộ',
    [linkResult && linkResult.written, linkWrite && linkWrite.records.length, linkWrite && linkWrite.records[0].id, linkWrite && linkWrite.records[0].customerId, linkWrite && linkWrite.records[0].syncStatus, linkLogged.filter((line) => /ACT-11\|.*KH-1/.test(line)).length],
    [1, 1, 'ACT-11', 'KH-1', undefined, 1]);
  // FBM trả mới nhất trước; cửa ghi cấp ACT- theo thứ tự mảng ghi, nên lô phải được sắp theo mã FBM tăng dần (thứ tự nhập thật) trước khi ghi. Mã đổi độ dài (99999 → 100000) phải so như số.
  const fbmOrderIncoming = (fbmId, day) => builders.FbmSync.activityRecord({ id: fbmId, ma_kh: 'ALT99999', end_date: day, ten_cv: 'Gọi', details: 'GD ' + fbmId }, gate, { sttRec: 'S9' });
  let orderWrite = null;
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [];
  builders.writeGateSave = (request) => { orderWrite = request; return { ok: true }; };
  keoVe(builders.FbmSync, 'activity', [fbmOrderIncoming('177397', '/Date(1791828000000)/'), fbmOrderIncoming('177396', '/Date(1791828000000)/'), fbmOrderIncoming('177388', '/Date(1791828000000)/'), fbmOrderIncoming('177398', '/Date(1791655200000)/'), fbmOrderIncoming('100000', '/Date(1791828000000)/'), fbmOrderIncoming('99999', '/Date(1791828000000)/')]);
  check(so, 'Pull Activity mới: lô FBM trả mới nhất trước vẫn được ghi theo mã FBM tăng dần (số, không phải chuỗi) để ACT- tăng theo thứ tự nhập thật',
    orderWrite && orderWrite.records.map((record) => record.fbmId),
    ['99999', '100000', '177388', '177396', '177397', '177398']);
  check(so, 'Cửa ghi kéo về gắn mốc Đồng bộ lúc cho mọi dòng ghi, theo giờ của lời gọi',
    orderWrite && orderWrite.records.every((record) => Object.prototype.toString.call(record.syncedAt) === '[object Date]'),
    true);
  check(so, 'FbmSync.compareFbmId: toàn chữ số so như số, mã không phải số coi là hòa',
    [builders.FbmSync.compareFbmId('99999', '100000'), builders.FbmSync.compareFbmId('177397', '177396'), builders.FbmSync.compareFbmId('7', '007'), builders.FbmSync.compareFbmId('FBM-9', '12')],
    [-1, 1, 0, 0]);
  builders.FbmSync.scriptSettings = settingsBeforeMarker;
  delete gate.map['@CAT_CONG_VIECGọi']; delete gate.valid['@CAT_CONG_VIEC'];

  return so;
}

module.exports = { chay };
