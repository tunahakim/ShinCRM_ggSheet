/** Ma trận đẩy: FBM-032 không bỏ sót bản ghi giữa chừng và FBM-027 khôi phục lệnh tạo không biết kết quả (tra theo dấu #SC hoặc MST). */
const { trongLat } = require('../../lib/fbm/hop-dong-bo');
const { section, check } = require('../../lib/assert');
const { buocDay, buocDayLoi } = require('../../lib/fbm/buoc-day');
const { makeSync, pushQueue, editCustomer } = require('../../lib/fbm/hang-day');
const { NO_CATEGORY, COT_LUOI_KHACH, luoiTheoTen } = require('../../lib/fbm/ma-tran');

async function chay(so) {
  section('FBM sync — ma trận đẩy: lỗi từ chối và khôi phục lệnh tạo');
  const sync = makeSync();
  const skipOnError = pushQueue(['A', 'B', 'C'].map(editCustomer));
  const triedOnError = [];
  let errorRequest = trongLat(skipOnError.F, () => skipOnError.F.pushStageResume(skipOnError.F.stateRead()));
  for (let guard = 0; guard < 5 && errorRequest; guard += 1) {
    const current = skipOnError.F.stateRead(); triedOnError.push(current.cursor.candidate.id);
    errorRequest = buocDayLoi(skipOnError.F, { reason: 'FBM từ chối', code: 'FBM_ERROR' }).request;
  }
  check(so, 'FBM-032: ba Customer liên tiếp bị FBM từ chối thì phiên vẫn thử đủ cả ba, không bỏ sót bản ghi ở giữa',
    triedOnError,
    ['CUS-A', 'CUS-B', 'CUS-C']);

  const skipOnSuccess = pushQueue(['A', 'B', 'C'].map(editCustomer));
  const triedOnSuccess = [];
  let successRequest = trongLat(skipOnSuccess.F, () => skipOnSuccess.F.pushStageResume(skipOnSuccess.F.stateRead()));
  for (let guard = 0; guard < 5 && successRequest; guard += 1) {
    const current = skipOnSuccess.F.stateRead(), id = current.cursor.candidate.id;
    triedOnSuccess.push(id);
    // Như pushResultVerify: bản ghi đã đồng bộ rời danh sách ứng viên, cursor tiến qua dòng của nó.
    const row = skipOnSuccess.run.local.customer.find((item) => item.id === id);
    row.syncStatus = 'đã đồng bộ'; row.fbmHash = skipOnSuccess.F.hash(row, 'customer', NO_CATEGORY);
    current.cursor = { kind: 'push_scan', entity: 'customer', index: current.cursor.index + 1 };
    skipOnSuccess.F.stateWrite(current);
    successRequest = trongLat(skipOnSuccess.F, () => skipOnSuccess.F.pushStageResume(skipOnSuccess.F.stateRead()));
  }
  check(so, 'FBM-032: bản ghi vừa đẩy xong rời danh sách ứng viên thì bản ghi kế tiếp vẫn được đẩy',
    triedOnSuccess,
    ['CUS-A', 'CUS-B', 'CUS-C']);

  // FBM-027 Giao dịch: dòng "đang đẩy" chưa có ID FBM là lệnh tạo không biết kết quả; tra giao dịch của khách cha theo dấu #SC rồi mới nối hoặc tạo lại.
  const stuckActivity = { id: 'ACT-STUCK', customerId: 'CUS-A', fbmId: '', workDate: '2026-09-19', taskType: 'Gọi điện', content: 'Gọi lại', owner: 'Le Tuan Anh', fbmSyncPermission: 'Cho phép', syncStatus: 'đang đẩy' };
  const stuckGridFields = sync.hop.FbmSync.scanFields('activity');
  const activityRows = (rows) => luoiTheoTen(sync.hop.FbmSync, 'activity', stuckGridFields, rows);
  const stuckQueue = (extra) => {
    const queue = pushQueue([editCustomer('A')], [Object.assign({}, stuckActivity, extra || {})]);
    queue.run.local.customer[0].fbmHash = queue.F.hash(queue.run.local.customer[0], 'customer', NO_CATEGORY);
    return queue;
  };
  const stuckFound = stuckQueue();
  const activityLookup = trongLat(stuckFound.F, () => stuckFound.F.pushStageResume(stuckFound.F.stateRead()));
  check(so, 'FBM-027: Giao dịch "đang đẩy" chưa có ID FBM (đã qua khoảng chờ) chỉ phát request đọc giao dịch của đúng khách cha, không phát lệnh tạo',
    [activityLookup && activityLookup.meta && activityLookup.meta.kind, JSON.stringify(activityLookup && activityLookup.body && activityLookup.body.externalKey), stuckFound.F.stateRead().cursor.operation],
    ['grid', JSON.stringify([{ Name: 'stt_rec', Opr: '=', Value: 'F-A', Type: 'String', Ignore: false }]), 'activity_create_recover']);
  const afterActivityFound = buocDay(stuckFound.F, await activityRows([{ id: 9000, details: 'Việc khác #SC-ACT-OTHER' }, { id: 9001, details: 'Gọi lại #SC-ACT-STUCK' }]));
  const linkedActivity = stuckFound.run.local.activity[0];
  check(so, 'FBM-027: tra thấy đúng một giao dịch mang dấu #SC của dòng thì nối ID FBM, mốc rỗng, không tạo lại; lần quét lại mở form để so hai bên',
    [linkedActivity.fbmId, linkedActivity.fbmHash, afterActivityFound && afterActivityFound.meta && afterActivityFound.meta.kind, stuckFound.F.stateRead().counts.error],
    ['9001', '', 'activity_edit_open', 0]);
  const stuckMissing = stuckQueue();
  trongLat(stuckMissing.F, () => stuckMissing.F.pushStageResume(stuckMissing.F.stateRead()));
  const recreate = buocDay(stuckMissing.F, await activityRows([{ id: 9000, details: 'Việc khác #SC-ACT-OTHER' }]));
  const recreated = stuckMissing.run.local.activity[0];
  check(so, 'FBM-027: tra hết giao dịch của khách cha không thấy dấu #SC thì tạo lại đúng một lần, dòng về "đang đẩy" với mốc giờ mới',
    [recreate && recreate.meta && recreate.meta.kind, recreated.syncStatus, recreated.fbmId, recreated.syncedAt instanceof Date, stuckMissing.F.stateRead().counts.error],
    ['activity_create', 'đang đẩy', '', true, 0]);
  const stuckWaiting = stuckQueue({ syncedAt: new Date() });
  const waitingRequest = trongLat(stuckWaiting.F, () => stuckWaiting.F.pushStageResume(stuckWaiting.F.stateRead()));
  check(so, 'FBM-027: lệnh tạo vừa mất phản hồi, chưa qua khoảng chờ thì không tra, không tạo, không báo lỗi; dòng giữ "đang đẩy"',
    [waitingRequest, stuckWaiting.run.local.activity[0].syncStatus, stuckWaiting.F.stateRead().counts.error, stuckWaiting.F.pushEligible('activity', stuckWaiting.run.local.activity[0], stuckWaiting.run.local.customer[0], stuckWaiting.F.pushReviewContext(stuckWaiting.F.stateRead(), null)).reason],
    [null, 'đang đẩy', 0, 'recoverWait']);
  const stuckFailed = stuckQueue();
  stuckFailed.F.pushFailureAdd('activity:ACT-STUCK', stuckFailed.F.hash(stuckFailed.run.local.activity[0], 'activity', NO_CATEGORY), { code: 'FBM_ERROR', reason: 'Mất phản hồi' });
  const failedLookup = trongLat(stuckFailed.F, () => stuckFailed.F.pushStageResume(stuckFailed.F.stateRead()));
  check(so, 'FBM-027: sổ lỗi đẩy không chặn lệnh tạo chưa xác nhận; lượt sau tự tra lại, không chờ người bấm',
    failedLookup && failedLookup.meta && failedLookup.meta.kind,
    'grid');

  // FBM từ chối rõ ràng lệnh tạo giao dịch (lỗi nghiệp vụ): tra ngay theo dấu, không thấy thì lỗi thường, không giữ "đang đẩy" để khỏi lặp mỗi lượt.
  const rejectQueue = pushQueue([editCustomer('A')], [Object.assign({}, stuckActivity, { syncStatus: '' })]);
  rejectQueue.run.local.customer[0].fbmHash = rejectQueue.F.hash(rejectQueue.run.local.customer[0], 'customer', NO_CATEGORY);
  const rejectCreate = trongLat(rejectQueue.F, () => rejectQueue.F.pushStageResume(rejectQueue.F.stateRead()));
  const rejectLookup = buocDayLoi(rejectQueue.F, { code: 'FBM_BUSINESS_ERROR', reason: 'Thiếu công việc' }, true).request;
  buocDay(rejectQueue.F, await activityRows([]));
  const rejectReason = (rejectQueue.F.pushFailuresRead().details['activity:ACT-STUCK'] || {}).reason || '';
  check(so, 'FBM-027: FBM từ chối lệnh tạo giao dịch thì tra ngay theo dấu #SC; không thấy thì "đẩy lỗi" kèm lý do FBM, không giữ "đang đẩy"',
    [rejectCreate && rejectCreate.meta && rejectCreate.meta.kind, rejectQueue.F.stateRead().cursor.operation === 'activity_create_recover' || /grid/.test(JSON.stringify(rejectLookup && rejectLookup.meta || {})), rejectQueue.run.local.activity[0].syncStatus, /FBM từ chối lệnh tạo: Thiếu công việc/.test(rejectReason)],
    ['activity_create', true, 'đẩy lỗi', true]);

  // Lượt chết giữa pha 1 (đã ghi ID FBM) và pha 2: dòng "đã đẩy chờ xác nhận" có ID nên không bao giờ là lệnh tạo lại; chiều kéo về so ba chiều.
  const halfDone = stuckQueue({ fbmId: '9001', syncStatus: 'đã đẩy chờ xác nhận', fbmHash: '' });
  check(so, 'FBM-027: lượt chết giữa pha 1 và pha 2 thì dòng chờ chiều kéo về xác nhận, chiều đẩy không chọn lại',
    halfDone.F.pushEligible('activity', halfDone.run.local.activity[0], halfDone.run.local.customer[0], halfDone.F.pushReviewContext(halfDone.F.stateRead(), null)).reason, 'awaitingConfirmation');

  const lostCustomer = Object.assign(editCustomer('N'), { id: 'CUS-LOST', fbmId: '', fbmCustomerCode: '', taxNumber: '0101234567', syncStatus: 'đang đẩy', fbmHash: '' });
  const taxRows = (rows) => luoiTheoTen(sync.hop.FbmSync, 'customer', COT_LUOI_KHACH, rows);
  const recoverFound = pushQueue([lostCustomer]);
  const lookup = trongLat(recoverFound.F, () => recoverFound.F.pushStageResume(recoverFound.F.stateRead()));
  check(so, 'FBM-027: Customer "đang đẩy" chưa có ID FBM ở phiên sau chỉ phát request tra theo MST, không phát lệnh tạo',
    [lookup && lookup.meta && lookup.meta.kind, JSON.stringify(lookup && lookup.body && lookup.body.filter), recoverFound.F.stateRead().cursor.operation],
    ['grid', JSON.stringify(['ma_so_thue:**0101234567']), 'customer_create_recover']);
  const afterFound = buocDay(recoverFound.F, await taxRows([{ stt_rec_kh: 'FBM-OTHER', ma_kh: 'ALT00078', ma_so_thue: '01012345678' }, { stt_rec_kh: 'FBM-LOST', ma_kh: 'ALT00077', ma_so_thue: '0101234567', ten_kh: 'Tên đã sửa bên FBM' }]));
  const foundRow = recoverFound.run.local.customer[0];
  check(so, 'FBM-027: tra thấy đúng một Customer khớp chính xác MST thì vá stt_rec_kh và ma_kh, baseline rỗng, không tạo lại; lần quét lại của chặng mở form để so hai bên chứ không lưu',
    [foundRow.fbmId, foundRow.fbmCustomerCode, foundRow.fbmHash, afterFound && afterFound.meta && afterFound.meta.kind, recoverFound.F.stateRead().counts.error],
    ['FBM-LOST', 'ALT00077', '', 'customer_edit_open', 0]);

  const recoverMissing = pushQueue([Object.assign({}, lostCustomer)]);
  trongLat(recoverMissing.F, () => recoverMissing.F.pushStageResume(recoverMissing.F.stateRead()));
  const afterMissing = buocDay(recoverMissing.F, await taxRows([{ stt_rec_kh: 'FBM-OTHER', ma_kh: 'ALT00078', ma_so_thue: '01012345678' }]));
  check(so, 'FBM-027: tra không thấy Customer khớp chính xác MST thì tạo lại như Tạo khách (FBM chặn trùng MST nên không thể ra hai khách), không báo lỗi',
    [afterMissing && afterMissing.meta && afterMissing.meta.kind, recoverMissing.run.local.customer[0].syncStatus, recoverMissing.run.local.customer[0].fbmId, recoverMissing.F.stateRead().counts.error],
    ['customer_create_open', 'đang đẩy', '', 0]);

  const openFailed = pushQueue([Object.assign({}, lostCustomer)]);
  openFailed.F.markPushError(openFailed.F.stateRead(), { entity: 'customer', kind: 'create', id: 'CUS-LOST', record: lostCustomer }, { reason: 'Không mở được form tạo', code: 'FBM_ERROR' }, 'customer_create_open');
  const sentFailed = pushQueue([Object.assign({}, lostCustomer)]);
  sentFailed.F.markPushError(sentFailed.F.stateRead(), { entity: 'customer', kind: 'create', id: 'CUS-LOST', record: lostCustomer }, { reason: 'Mất phản hồi', code: 'FBM_ERROR' }, 'customer_create_save');
  check(so, 'FBM-027: lỗi ở bước mở form tạo (lệnh lưu chưa phát) thì chuyển "đẩy lỗi"; lỗi sau khi đã phát lệnh lưu thì giữ "đang đẩy"',
    [openFailed.run.local.customer[0].syncStatus, sentFailed.run.local.customer[0].syncStatus], ['đẩy lỗi', 'đang đẩy']);
}

module.exports = { chay };
