/** Cửa ghi chiều lấy về: danh sách đọc của lượt, request tra mã không lọc quyền, bảng vắng mặt và chuyển quyền (09/05 Phần 9), xét lại hai trạng thái đóng băng. */
const { section, check } = require('../../lib/assert');
const { scanHarness } = require('./ScanJob');

const gdFbm = (id) => ({ id, details: 'Gọi ' + id, end_date: '2026-09-20', owner: 'Owner', datetime0: '2026-09-20T03:00:00', line_nbr: 1 });

/**
 * Sheet 3 khách, mỗi khách một giao dịch, sau một lượt Quét toàn bộ. `ban` là FBM giả: mã khách → id các giao dịch khách đang giữ, đổi giữa các lượt để giả FBM chuyển giao dịch; `noiDung` đổi nội dung giao dịch trên FBM.
 * `owners` (id giao dịch → khách đang giữ) và `exists` (khách còn tồn tại ngoài quyền) là kết quả tra mã không lọc quyền.
 */
async function sheet3(options) {
  const ban = { 'FBM-C1': ['800001'], 'FBM-C2': ['800002'], 'FBM-C3': ['800003'] }, noiDung = {}, owners = {}, exists = [], gone = [];
  const h = scanHarness(Object.assign({ customers: 3, budget: { activityBatchCustomers: 3 }, activityFor: (key) => (ban[key] || []).map((id) => Object.assign(gdFbm(id), noiDung[id] ? { details: noiDung[id] } : {})), owners, exists, goneCustomers: gone }, options || {}));
  await h.run({ pack: 'all' });
  const cus = (i) => h.local.customer.find((item) => item.fbmId === 'FBM-C' + i);
  const act = (fbmId) => h.local.activity.find((item) => String(item.fbmId) === fbmId) || {};
  /** Một lượt Vòng xoay đọc cả 3 khách theo số CUS tăng dần; `batch` là số khách mỗi lô. */
  const xoay = (batch, hooks) => {
    h.F.BUDGET.activityBatchCustomers = batch;
    ['activityCustomers', 'kinds', 'lookups', 'errors'].forEach((key) => { h.trace[key].length = 0; });
    h.logs.length = 0;
    return h.run(Object.assign({ startOptions: { origin: 'background', scan: 'detail', detail: { customersPerRun: 3 } } }, hooks || {}));
  };
  return Object.assign(h, { ban, noiDung, owners, exists, gone, cus, act, xoay, log: (action) => h.logs.filter((event) => event.action === action) });
}

async function chay(so) {
  section('FBM sync — cửa ghi chiều lấy về');

  // Danh sách đọc chỉ sống trong một lượt.
  const ds = await sheet3();
  const F = ds.F;
  F.stateStart('', 'pull_activity', 0);
  F.readListAdd(['FBM-C1', 'FBM-MOI']);
  F.readWaitWrite({ 'FBM-C2': ['800001'] });
  F.stateFailRun('Lượt hỏng giả lập', 'FBM_TEST');
  const conLai = [F.readListNext(10), F.readWaitRead()];
  F.stateStart('', 'pull_activity', 0);
  F.readListAdd(['FBM-C1']);
  F.readListDone(['FBM-C1']);
  const themLai = F.readListAdd(['FBM-C1']);
  ds.local.customer.push({ id: 'CUS-000004', fbmId: 'FBM-C4', fbmCustomerCode: 'ALT00004', fbmSyncPermission: 'Cho phép', recordStatus: 'active' });
  const docTrongLuot = F.seenStoreReader(F.READ_LIST_STORE);
  check(so, 'Danh sách đọc: lượt hỏng giữa chừng thì lượt sau không còn mã và ghi chú "giao dịch chờ nối" của lượt cũ; khách đã đọc thêm lại không đổi danh sách; khách tạo dòng giữa lượt không bị coi là đã đánh dấu', [
    conLai, themLai, docTrongLuot(ds.local.customer[3]), F.readListNext(10)
  ], [[[], {}], 0, false, []]);

  // Khách mới trong danh sách FBM: tạo dòng cùng giao dịch ở bước ghi của lô; trước đó không ghi Sheet lần nào.
  let ghiTruocLo = -1;
  const moi = scanHarness({ customers: 3 });
  await moi.run({ pack: 'all', beforeSend: (request) => { if (request.meta.kind === 'batch' && ghiTruocLo < 0) { ghiTruocLo = moi.writes.length; } } });
  const chaCua = moi.local.activity.map((item) => (moi.local.customer.find((row) => row.id === item.customerId) || {}).fbmId).sort();
  check(so, 'Khách mới trong danh sách FBM được tạo dòng cùng giao dịch; không có lần ghi Sheet nào trước bước ghi của lô', [ghiTruocLo, moi.local.customer.length, chaCua], [0, 3, ['FBM-C1', 'FBM-C2', 'FBM-C3']]);

  // Request tra mã khách không lọc quyền: hàm dựng riêng, chỉ trả stt_rec_kh, chặn giá trị lạ.
  const traLa = [F.ownerLookupRequest('activity', "1' or '1"), F.ownerLookupRequest('activity', 'A-1'), F.ownerLookupRequest('customer', "A1' or '1"), F.ownerLookupRequest('customer', '')];
  const traDung = F.ownerLookupRequest('activity', '800001');
  const ketQua = F.ownerLookupParse({ ok: true, status: 200, body: JSON.stringify({ d: { TotalRowCount: 1, ViewPage: { Fields: [{ AliasName: 'stt_rec_kh' }, { AliasName: 'ten_kh' }] }, Rows: [['FBM-C9', 'Công ty người khác']] } }) });
  check(so, "Tra mã khách không lọc quyền: id `1' or '1`, id không toàn chữ số, mã khách sai định dạng hoặc rỗng không sinh request; kết quả chỉ có stt_rec_kh, không chứa ten_kh", [
    traLa, traDung.meta.kind, JSON.stringify(traDung.body.externalKey).indexOf('GetCustomerValidate') < 0, ketQua, JSON.stringify(ketQua).indexOf('Công ty người khác') < 0
  ], [[null, null, null, null], 'owner_lookup', true, { ok: true, sttRecs: ['FBM-C9'] }, true]);

  // Khách vắng ở cửa ghi.
  const chuyen = await sheet3();
  chuyen.gone.push('FBM-C2', 'FBM-C3');
  chuyen.exists.push('FBM-C2');
  await chuyen.xoay(3);
  const sync = chuyen.F.SYNC_STATUS;
  check(so, 'Khách vắng ở cửa ghi: kiểm tra tồn tại ra khách thì khách và giao dịch của khách mang "đã chuyển cho người khác", nội dung giữ nguyên; ra rỗng thì "không thấy bên FBM"; khách còn trong quyền giữ "đã đồng bộ"', [
    chuyen.F.stateRead().phase, chuyen.cus(2).syncStatus, chuyen.act('800002').syncStatus, chuyen.act('800002').content, chuyen.cus(3).syncStatus, chuyen.cus(1).syncStatus, chuyen.trace.lookups.length
  ], ['done', sync.transferred, sync.transferred, 'Gọi 800002', sync.missing, sync.synced, 2]);

  const traLoi = await sheet3({ lookupFail: () => true });
  traLoi.gone.push('FBM-C2');
  await traLoi.xoay(3);
  const traLoiState = traLoi.F.stateRead();
  check(so, 'Khách vắng mà request kiểm tra tồn tại lỗi: không gắn cờ, Sidebar có số khách lỗi, Sheet Log ghi activity_customer_failed', [
    traLoiState.phase, traLoi.cus(2).syncStatus, (traLoiState.metadata.customerErrors || {}).total, traLoi.log('activity_customer_failed').length
  ], ['done', sync.synced, 1, 1]);

  // Giao dịch X đổi từ khách A sang khách B: ba thứ tự đọc đều nối X sang B, cùng số ACT, không dòng trùng, A được đọc lại trong lượt.
  const doiCha = async (tu, sang, batch) => {
    const h = await sheet3();
    const x = '80000' + tu, actId = h.act(x).id;
    h.ban['FBM-C' + tu] = []; h.ban['FBM-C' + sang].push(x); h.owners[x] = 'FBM-C' + sang;
    await h.xoay(batch);
    const row = h.act(x);
    return [h.F.stateRead().phase, row.id === actId, row.customerId === h.cus(sang).id, row.syncStatus, h.local.activity.length, h.trace.activityCustomers.indexOf('FBM-C' + tu) >= 0];
  };
  const docA = await doiCha(1, 2, 1), docB = await doiCha(2, 1, 1), cungLo = await doiCha(1, 2, 3);
  check(so, 'Giao dịch đổi khách cha: đọc A trước, đọc B trước, hay A và B cùng lô đều nối X sang B, cùng số ACT, "đã đồng bộ", không dòng trùng, A được đọc trong lượt', [docA, docB, cungLo], Array(3).fill(['done', true, true, sync.synced, 3, true]));

  const ngoaiQuyen = await sheet3();
  ngoaiQuyen.ban['FBM-C1'] = []; ngoaiQuyen.owners['800001'] = 'FBM-C9';
  await ngoaiQuyen.xoay(3);
  check(so, 'Giao dịch đổi sang khách B ngoài quyền tài khoản: X mang "đã chuyển cho người khác" và giữ dưới A, không tạo khách B', [
    ngoaiQuyen.F.stateRead().phase, ngoaiQuyen.act('800001').syncStatus, ngoaiQuyen.act('800001').customerId === ngoaiQuyen.cus(1).id, ngoaiQuyen.local.customer.length
  ], ['done', sync.transferred, true, 3]);

  const lechChu = await sheet3();
  lechChu.ban['FBM-C1'] = []; lechChu.ban['FBM-C2'] = []; lechChu.owners['800001'] = 'FBM-C1'; lechChu.owners['800002'] = 'FBM-C1';
  const truocLech = lechChu.writes.length;
  await lechChu.xoay(1);
  const ghiCo = lechChu.writes.slice(truocLech).flatMap((item) => item.records || []).filter((item) => item.syncStatus);
  check(so, 'Hai lần đọc FBM nói khác nhau: hỏi chủ ra A (khách cũ) hoặc ra B đã đọc mà không có X thì không ghi cờ, Log activity_owner_mismatch', [
    lechChu.F.stateRead().phase, lechChu.act('800001').syncStatus, lechChu.act('800002').syncStatus, ghiCo.length, lechChu.log('activity_owner_mismatch').length
  ], ['done', sync.synced, sync.synced, 0, 2]);

  const hongB = await sheet3();
  hongB.ban['FBM-C1'] = []; hongB.ban['FBM-C3'].push('800001'); hongB.owners['800001'] = 'FBM-C3';
  await hongB.xoay(1, { fail: (request) => (request.meta.kind === 'batch' && JSON.stringify(request).indexOf("'FBM-C3'") >= 0 ? 'SYNC_TRANSPORT_FAILED' : ''), afterError: () => null });
  check(so, 'Lượt hỏng trước khi đọc xong lô chứa B: X giữ trạng thái và khách cha cũ', [hongB.F.stateRead().phase, hongB.act('800001').syncStatus, hongB.act('800001').customerId === hongB.cus(1).id], ['error', sync.synced, true]);

  const chan = await sheet3();
  chan.cus(2).recordStatus = 'deleted';
  chan.ban['FBM-C1'] = []; chan.ban['FBM-C2'].push('800001'); chan.owners['800001'] = 'FBM-C2';
  await chan.xoay(3);
  const chanLan1 = [chan.F.stateRead().phase, chan.trace.activityCustomers.indexOf('FBM-C2'), chan.act('800001').customerId === chan.cus(2).id, chan.act('800001').content, chan.log('activity_parent_blocked').length];
  await chan.xoay(3);
  check(so, 'Khách B trên Sheet đã xóa mềm: không đọc B, X đổi khách cha sang B, nội dung giữ nguyên, Log activity_parent_blocked; lượt sau không tra chủ X nữa', [chanLan1, chan.trace.lookups.length], [['done', -1, true, 'Gọi 800001', 1], 0]);

  // Xét lại hai trạng thái đóng băng theo phép so ba chiều.
  const xet = await sheet3();
  xet.cus(2).syncStatus = sync.transferred;
  const giaoDich = xet.act('800003');
  giaoDich.syncStatus = sync.missing; giaoDich.content = 'Sửa trên Sheet lúc đóng băng';
  // Vòng xoay bỏ qua khách mang cờ; danh sách toàn bộ khách thấy lại khách thì khách vào danh sách đọc.
  await xet.run({ pack: 'all' });
  const dayKe = xet.F.pushCandidates('activity').map((item) => item.id);
  check(so, 'Xét lại: khách "đã chuyển cho người khác" thấy lại, không sửa gì thì về "đã đồng bộ"; giao dịch "không thấy bên FBM" sửa trên Sheet lúc đóng băng, thấy lại mà FBM không đổi thì vào danh sách đẩy, nội dung sửa còn nguyên', [
    xet.cus(2).syncStatus, xet.act('800003').syncStatus === sync.missing, xet.act('800003').content, dayKe.indexOf(giaoDich.id) >= 0
  ], [sync.synced, false, 'Sửa trên Sheet lúc đóng băng', true]);

  const haiBen = await sheet3();
  const gdHaiBen = haiBen.act('800003');
  gdHaiBen.syncStatus = sync.missing; gdHaiBen.content = 'Sửa trên Sheet';
  haiBen.noiDung['800003'] = 'Sửa trên FBM';
  await haiBen.run({ pack: 'all' });
  check(so, 'Xét lại: giao dịch "không thấy bên FBM" mà hai bên cùng đổi thì thành "xung đột chờ quyết"', haiBen.act('800003').syncStatus, sync.conflict);
}

module.exports = { chay };
