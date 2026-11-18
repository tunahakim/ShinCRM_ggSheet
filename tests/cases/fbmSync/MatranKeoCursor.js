/** Ma trận kéo về: requestId không trùng, kéo nhiều khách và giao dịch không tạo trùng, cursor nhiều trang, cửa ghi cờ hàng loạt, phạm vi chỉ định, phiên rỗng. */
const { section, check } = require('../../lib/assert');
const { datState } = require('../../lib/fbm/dat-state');
const { makeSync } = require('../../lib/fbm/hang-day');
const { keoVe } = require('../../lib/fbm/keo-ve');
const { khachMau, giaoDichMau } = require('../../lib/fbm/ma-tran');

async function chay(so) {
  section('FBM sync — ma trận kéo về nhiều bản ghi và cursor');

  const protocol = makeSync().hop;
  const fixedNow = 1700000000000;
  const originalNow = protocol.Date.now;
  protocol.Date.now = () => fixedNow;
  // Request nào cũng đi theo cursor đang lưu (cổng phiên xét dòng bảng của cursor); dùng dòng không có cổng để chỉ kiểm phần cấp mã.
  datState(protocol.FbmSync, { runId: 'cap-ma', phase: 'checking_session', cursor: { kind: 'identity_user_grid' } });
  const first = protocol.FbmSync.sliceIssue(protocol.FbmSync.stateRead(), { url: 'https://fbm.test/request', body: {}, meta: { kind: 'grid' } });
  const second = protocol.FbmSync.sliceIssue(protocol.FbmSync.stateRead(), { url: 'https://fbm.test/request', body: {}, meta: { kind: 'grid' } });
  protocol.Date.now = originalNow;
  check(so, 'hai envelope cung mili-giay van co requestId khac nhau',
    [first.id, second.id, first.id !== second.id],
    [first.id, second.id, true]);

  const sync = makeSync();
  const state = sync.hop.FbmSync.runOpen({ phase: 'pull_customer' });
  state.mode = 'read';
  sync.hop.FbmSync.readCategoryGate = () => ({ map: {}, names: {}, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true }, '@CAT_CONG_VIEC': { 'Gọi điện': true } }, warnings: [] });
  sync.hop.FbmSync.stateWrite(state);
  const customers = [khachMau('FBM-C1', 'ALT00001', 'Công ty 1'), khachMau('FBM-C2', 'ALT00002', 'Công ty 2'), khachMau('FBM-C3', 'ALT00003', 'Công ty 3')];
  const firstPull = keoVe(sync.hop.FbmSync, 'customer', customers);
  const secondPull = keoVe(sync.hop.FbmSync, 'customer', customers);
  check(so, 'pull nhieu Customer tao dung ba dong',
    [firstPull.ok, firstPull.written, sync.local.customer.length],
    [true, 3, 3]);
  check(so, 'pull lap lai cung tap Customer khong tao dong trung',
    [secondPull.ok, secondPull.written, sync.local.customer.length, new Set(sync.local.customer.map((item) => item.fbmId)).size],
    [true, 0, 3, 3]);

  const activities = [
    giaoDichMau('FBM-A1', 'ALT00001', 'Cuoc goi 1'), giaoDichMau('FBM-A2', 'ALT00001', 'Cuoc goi 2'),
    giaoDichMau('FBM-A3', 'ALT00002', 'Cuoc goi 3'), giaoDichMau('FBM-A4', 'ALT00002', 'Cuoc goi 4'),
    giaoDichMau('FBM-A5', 'ALT00003', 'Cuoc goi 5'), giaoDichMau('FBM-A6', 'ALT00003', 'Cuoc goi 6')
  ];
  const activityPull = keoVe(sync.hop.FbmSync, 'activity', activities);
  const activityAgain = keoVe(sync.hop.FbmSync, 'activity', activities);
  check(so, 'pull nhieu Activity noi dung vao dung ba Customer cha',
    [activityPull.ok, activityPull.written, sync.local.activity.length, new Set(sync.local.activity.map((item) => item.customerId)).size],
    [true, 6, 6, 3]);
  check(so, 'pull lap lai Activity giu idempotency',
    [activityAgain.ok, activityAgain.written, sync.local.activity.length],
    [true, 0, 6]);

  const pageState = sync.hop.FbmSync.stateRead();
  pageState.cursor = { kind: 'scan_job', entity: 'customer', type: 0, pageIndex: -1, pageValue: null, count: 2 };
  sync.hop.FbmSync.stateWrite(pageState);
  const pageRows = [{ stt_rec_kh: 'FBM-C1', ma_kh: 'ALT00001', ngay_gd: '2026-09-19', datetime0: '2026-09-19T01:00:00', xorder: 1 }, { stt_rec_kh: 'FBM-C2', ma_kh: 'ALT00002', ngay_gd: '2026-09-18', datetime0: '2026-09-18T01:00:00', xorder: 2 }];
  const pageNextState = sync.hop.FbmSync.stateRead(), hasNextPage = sync.hop.FbmSync.customerNext(pageNextState, sync.hop.FbmSync.customerPageOf(pageRows), 3);
  // Trang sau không tiêu đề cần tên cột gốc lượt đã lưu từ trang đầu.
  pageNextState.metadata.customerFields = sync.hop.FbmSync.scanFields('customer');
  sync.hop.FbmSync.scanJobOpen(pageNextState, pageNextState.cursor);
  const nextPage = sync.hop.FbmSync.scanJobRequest(pageNextState, sync.hop.FbmSync.scriptSettings(pageNextState), null);
  check(so, 'cursor Customer nhieu trang dung composite key bốn giá trị kèm stt_rec_kh (Nghiên cứu FBM ch04 mục 4.10) va trang ke tiep là chỉ số 1, đang đứng ở chỉ số 0',
    [hasNextPage, nextPage.meta.kind, nextPage.body.type, nextPage.body.gridPageIndex, nextPage.body.lastPageIndex, nextPage.body.gridPageValue],
    [true, 'scan_job', 1, 1, 0, ['2026-09-18', '2026-09-18T01:00:00', 2, 'FBM-C2']]);

  // Cửa ghi gắn cờ hàng loạt (khách chuyển quyền kéo theo mọi giao dịch): cắt theo gói CHUNK_ROWS dòng, đếm đủ.
  const bulkLocal = [];
  for (let index = 0; index < 2500; index += 1) {
    const id = 'ACT-' + String(index).padStart(6, '0');
    bulkLocal.push({ id, fbmId: String(700000 + index), workDate: '2026-09-19', recordStatus: 'active', syncStatus: 'đã đồng bộ' });
  }
  const bulk = makeSync();
  bulk.local.activity.push(...bulkLocal);
  const beforeBulkWrites = bulk.writes.length;
  const bulkState = bulk.hop.FbmSync.stateRead();
  const bulkWritten = bulk.hop.FbmSync.gateFlagWrite(bulkState, 'activity', bulkLocal.map((record) => ({ record, status: bulk.hop.FbmSync.SYNC_STATUS.missing, reason: 'thử' })));
  const bulkWrites = bulk.writes.slice(beforeBulkWrites);
  check(so, 'Cửa ghi gắn cờ 2.500 giao dịch được cắt thành hai lần qua cửa ghi Sheet (2.000 và 500), đếm đủ 2.500',
    [bulkWritten, bulkState.counts.missingActivity, bulkWrites.length, bulkWrites[0].records.length, bulkWrites[1].records.length],
    [2500, 2500, 2, 2000, 500]);

  // Cờ ghi hai Sheet (khách, giao dịch) bằng hai lần qua cửa ghi. Lần thứ hai hỏng thì lượt ném lỗi; lần chạy lại không ghi lại khách đã mang cờ nhưng vẫn đếm đúng một.
  const haiCua = makeSync();
  haiCua.local.customer.push({ id: 'CUS-000001', fbmId: 'FC-1', recordStatus: 'active', syncStatus: 'đã đồng bộ' });
  haiCua.local.activity.push({ id: 'ACT-000001', customerId: 'CUS-000001', fbmId: '700001', workDate: '2026-09-19', recordStatus: 'active', syncStatus: 'đã đồng bộ' });
  const haiCuaLuot = () => {
    const F = haiCua.hop.FbmSync, st = F.stateRead(), co = F.SYNC_STATUS.missing;
    st.counts = F.countsDefault();
    F.gateFlagWrite(st, 'customer', [{ record: haiCua.local.customer[0], status: co, reason: 'thử' }]);
    F.gateFlagWrite(st, 'activity', [{ record: haiCua.local.activity[0], status: co, reason: 'thử' }]);
    return st;
  };
  const ghiThat = haiCua.hop.writeGateSave;
  haiCua.hop.writeGateSave = (request) => { if (request.entity === 'activity') { throw new Error('Sheet Activity đang bận'); } return ghiThat(request); };
  let loiLuot1 = '';
  try { haiCuaLuot(); } catch (error) { loiLuot1 = error.message; }
  haiCua.hop.writeGateSave = ghiThat;
  const ghiLuot1 = haiCua.writes.map((item) => item.entity + ':' + item.records.map((record) => record.id).join(','));
  const truocLuot2 = haiCua.writes.length, luot2 = haiCuaLuot();
  const ghiLuot2 = haiCua.writes.slice(truocLuot2).map((item) => item.entity + ':' + item.records.map((record) => record.id).join(','));
  check(so, 'Gắn cờ ở cửa ghi: lần ghi giao dịch hỏng sau khi khách đã mang cờ thì lượt ném lỗi; lần chạy lại chỉ ghi giao dịch, khách đã mang cờ không ghi lại và vẫn đếm đúng một', [
    loiLuot1, ghiLuot1, ghiLuot2, luot2.counts.missingCustomer, luot2.counts.missingActivity
  ], ['Sheet Activity đang bận', ['customer:CUS-000001'], ['activity:ACT-000001'], 1, 1]);

  // Phạm vi "Chỉ khách chỉ định": khách trong phạm vi mà danh sách FBM không trả vào danh sách đọc để cửa ghi xét; khách ngoài phạm vi không được xét.
  const phamVi = makeSync();
  phamVi.local.customer.push({ id: 'CUS-000001', fbmId: 'FC-1', fbmCustomerCode: 'ALT1', recordStatus: 'active', syncStatus: 'đã đồng bộ', fbmSyncPermission: 'Cho phép' }, { id: 'CUS-000002', fbmId: 'FC-2', fbmCustomerCode: 'ALT2', recordStatus: 'active', syncStatus: 'đã đồng bộ', fbmSyncPermission: 'Cho phép' });
  phamVi.hop.FbmSync.scopeLimited = () => true;
  phamVi.hop.FbmSync.scope = () => ({ codes: ['ALT1'], fbm: ['ALT1'], shin: ['CUS-000001'], notFound: [] });
  phamVi.hop.FbmSync.readListClear();
  phamVi.hop.FbmSync.seenStoreBegin('customer', phamVi.local.customer);
  const phamViState = phamVi.hop.FbmSync.stateRead();
  phamViState.mode = 'read';
  const vaoDanhSach = phamVi.hop.FbmSync.customerAbsentMark(phamViState), docTrongLuot = phamVi.hop.FbmSync.seenStoreReader(phamVi.hop.FbmSync.READ_LIST_STORE);
  check(so, 'Phạm vi khách chỉ định: khách trong phạm vi vắng ở danh sách FBM vào danh sách đọc, khách ngoài phạm vi không vào, không ghi cờ nào trước cửa ghi',
    [vaoDanhSach, docTrongLuot(phamVi.local.customer[0]), docTrongLuot(phamVi.local.customer[1]), phamVi.writes.length],
    [1, true, false, 0]);

  const empty = makeSync();
  const emptyState = empty.hop.FbmSync.runOpen({ phase: 'pull_customer' });
  emptyState.mode = 'read';
  empty.hop.FbmSync.stateWrite(emptyState);
  const emptyCustomer = keoVe(empty.hop.FbmSync, 'customer', []);
  const emptyActivity = keoVe(empty.hop.FbmSync, 'activity', []);
  const finishedEmpty = empty.hop.FbmSync.stateRead();
  finishedEmpty.phase = 'done'; finishedEmpty.cursor = {}; finishedEmpty.counts = { total: 0, completed: 0, succeeded: 0, skipped: 0, conflict: 0, error: 0 };
  empty.hop.FbmSync.stateWrite(finishedEmpty);
  const emptyCounts = empty.hop.FbmSync.stateRead().counts;
  check(so, 'phiên rỗng hai phía kết thúc với mọi bộ đếm bằng 0 và không ghi dòng vấn đề bản ghi nào',
    [emptyCustomer.written, emptyActivity.written, empty.writes.length, [emptyCounts.total, emptyCounts.completed, emptyCounts.succeeded, emptyCounts.skipped, emptyCounts.conflict, emptyCounts.error], empty.logs.length],
    [0, 0, 0, [0, 0, 0, 0, 0, 0], 0]);
}

module.exports = { chay };
