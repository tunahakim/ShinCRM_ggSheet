/** Hàm quyết của lô đọc chi tiết (thiết kế 5.6.4) chạy trên dữ liệu dựng tay, không cần kho: mọi cổng đọc, ghi kho đều ném nên hàm quyết lỡ chạm kho là đỏ. Lớp phân tích response (`rowsToRecords`, `ownerLookupParse`) thay bằng bản giả vì đã có test riêng; ở đây chỉ kiểm phần quyết. */
const fs = require('fs');
const path = require('path');
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer, GAS_DIR } = require('../../lib/load-gas');
const { stripComments } = require('../../lib/strip-comments');
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');

// Cổng kho của chiều lấy về: hàm quyết gọi bất kỳ cổng nào thì ném, test đỏ.
const CONG_KHO = ['readLocal', 'shardListRead', 'shardListWrite', 'readWaitRead', 'readWaitWrite', 'seenStoreReader', 'seenStoreMark', 'readListNext', 'readListAdd', 'readListDone', 'readListDoneReader', 'pullAllowedReader', 'activityFreshIndex', 'gateLocalIndex', 'gateFlagWrite', 'recordChange', 'pullBatchApply', 'activityReadMark', 'stateRead', 'stateWrite', 'scope', 'scriptSettings', 'topOrderAll', 'readListEligibleReader'];
// Mẫu gọi kho trong mã nguồn tệp hàm quyết.
const GOI_KHO = new RegExp('\\b(' + CONG_KHO.join('|') + '|PropertiesService|SpreadsheetApp|props)\\s*\\(');

function thrownCode(fn) {
  try { fn(); return 'không ném'; } catch (error) { return String(error && error.code || error && error.message || error); }
}

function hopQuyet() {
  const hop = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {}, LOG_WARN: 'warn', LOG_ERROR: 'error', LOG_OK: 'ok', PropertiesService: taoPropertiesService() });
  napServer(hop, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/read/BatchDecide.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js');
  const F = hop.FbmSync, goiKho = [];
  CONG_KHO.forEach((name) => { F[name] = () => { goiKho.push(name); throw new Error('Hàm quyết gọi kho: ' + name); }; });
  // Bản giả của lớp phân tích response: phần tử lô mang sẵn lưới đã ghép.
  F.protocol = Object.assign({}, F.protocol, { parse: (item) => item.grid });
  F.rowsToRecords = (entity, grid) => ({ rows: grid.rows, total: grid.total, sourceFields: grid.fields || null });
  F.isTemporaryRecord = (entity, row) => !!row.tam;
  F.customerRecord = (row) => ({ id: 'CUS-' + row.stt_rec_kh, fbmId: row.stt_rec_kh });
  F.activityRecord = (item, gate, owner) => ({ fbmId: item.id, customerFbmId: owner.sttRec, incomingHash: item.hash || 'h' });
  F.activityPageNext = (page, rows) => (rows[0] && rows[0].ket ? null : { pageIndex: Number(page && page.pageIndex || 0) + 1 });
  F.ownerLookupParse = (item) => item.lookup;
  F.inScope = (customer, scope) => scope.ids.indexOf(customer.id) >= 0;
  F.BUDGET = Object.assign({}, F.BUDGET, { activityCustomerRows: 3, activityBatchCustomers: 2, activityTopScanQuietStreak: 3 });
  return { F, goiKho };
}

const ok = (grid) => ({ item: { grid }, check: { ok: true } });
const loi = (code) => ({ item: {}, check: { ok: false, code, status: 500, bug: { Message: 'lỗi ' + code } } });

function chay(so) {
  section('FBM sync — hàm quyết của lô đọc chi tiết không cần kho');
  const { F, goiKho } = hopQuyet();
  check(so, 'Bẫy kho hoạt động: gọi cổng kho thì ném', thrownCode(() => F.readLocal('customer')), 'Hàm quyết gọi kho: readLocal');
  goiKho.length = 0;

  // Lô 3 khách: S1 đủ giao dịch, S2 lỗi đọc giao dịch, S3 FBM không trả về; S4 chạm trần một lần đọc nên sang trang kế.
  const cursor = { customers: ['S1', 'S2', 'S3', 'S4'], count: 3, pages: {} };
  const checks = [
    ok({ rows: [{ stt_rec_kh: 'S1', ma_kh: 'K1' }, { stt_rec_kh: 'S2', ma_kh: 'K2' }, { stt_rec_kh: 'S4', ma_kh: 'K4' }, { stt_rec_kh: 'NGOAI' }], fields: ['stt_rec_kh'] }),
    ok({ rows: [{ id: '800001' }, { id: '800009', hash: 'moi' }], fields: ['id'] }),
    loi('FBM_500'),
    ok({ rows: [] }),
    ok({ rows: [{ id: '800041' }, { id: '800042' }, { id: '800043' }], total: 5 })
  ];
  const isFresh = (records) => records.some((record) => record.incomingHash === 'moi');
  const batch = F.batchRecordsOf(checks, cursor, { categoryGate: {}, isFresh });
  check(so, 'batchRecordsOf: khách, giao dịch, lỗi từng khách, trang kế và tên cột gốc',
    [batch.customerRecords.map((r) => r.fbmId), batch.activityRecords.map((r) => r.fbmId), batch.failed.map((f) => f.customer + ':' + f.code), Object.keys(batch.readOk), Object.keys(batch.nextPages), batch.pagedNew, batch.outcomes, batch.customerFields, batch.activityFields],
    [['S1', 'S2', 'S4'], ['800001', '800009', '800041', '800042', '800043'], ['K2:FBM_500'], ['S1'], ['S4'], ['S4:800041', 'S4:800042', 'S4:800043'], [{ sttRec: 'S1', fresh: true, complete: true }, { sttRec: 'S2', fresh: null }], ['stt_rec_kh'], ['id']]);
  check(so, 'batchRecordsOf không sửa cursor đầu vào', cursor, { customers: ['S1', 'S2', 'S3', 'S4'], count: 3, pages: {} });
  let hong = null;
  try { F.batchRecordsOf([loi('FBM_503'), ok({ rows: [] })], { customers: ['S1'] }, { categoryGate: {}, isFresh }); } catch (error) { hong = error; }
  check(so, 'Đọc khách chung của lô lỗi: dừng cả lô một lỗi (một dòng Log), không nhân thành lỗi từng khách', [hong && hong.code, hong && hong.logs.length, hong && hong.logs[0].action], ['FBM_503', 1, 'activity_batch_mismatch']);
  // Ô lượt có trần một khóa: danh sách khách lỗi chỉ giữ mã, câu lỗi dài (thông báo FBM) chỉ vào dòng Log.
  const oLoi = { metadata: {}, counts: {} }, cauDai = 'x'.repeat(5000);
  const dongLoi = F.activityCustomerErrors(oLoi, Array.from({ length: 30 }, (_, i) => ({ customer: 'A0000' + String(100000 + i), code: 'TRANSPORT_ERROR', status: 500, reason: cauDai })));
  check(so, 'khách lỗi: ô lượt giữ 20 mục chỉ có mã (dưới 2 KB dù câu lỗi dài), dòng Log vẫn đủ câu', [oLoi.metadata.customerErrors.total, oLoi.metadata.customerErrors.recent.length, Object.keys(oLoi.metadata.customerErrors.recent[0]), Buffer.byteLength(JSON.stringify(oLoi.metadata.customerErrors)) < 2000, dongLoi.length, dongLoi[0].reason.length], [30, 20, ['customer', 'code', 'status'], true, 30, 5000]);
  check(so, 'Trang kế kẹt thì báo lỗi khách, không đánh dấu đã đọc', F.batchRecordsOf([ok({ rows: [{ stt_rec_kh: 'S1' }] }), ok({ rows: [{ id: '1', ket: true }, { id: '2' }, { id: '3' }] })], { customers: ['S1'], count: 3 }, { categoryGate: {}, isFresh }).failed.map((f) => f.code), ['FBM_ACTIVITY_PAGE_STUCK']);

  // Bản chụp Sheet trước khi ghi: S1 (CUS-1) giữ 800001 (có trong lô) và 800002 (vắng), S3 (CUS-3) vắng khỏi lô, 800005 đang dưới CUS-3 nhưng lô thấy dưới S1.
  const cus1 = { id: 'CUS-1', fbmId: 'S1' }, cus3 = { id: 'CUS-3', fbmId: 'S3' };
  const act = (fbmId, customerId) => ({ id: 'ACT-' + fbmId, fbmId, customerId });
  const a2 = act('800002', 'CUS-1'), a7 = act('800007', 'CUS-9');
  const local = { byStt: { S1: cus1, S3: cus3 }, byCus: { 'CUS-1': cus1, 'CUS-3': cus3 }, activityById: { 800002: a2, 800007: a7 }, activitiesOf: { 'CUS-1': [act('800001', 'CUS-1'), a2], 'CUS-3': [act('800009', 'CUS-3')] } };
  const waits = { S1: ['800007'], S3: ['800007'], KHAC: ['1'] }, waitsTruoc = JSON.parse(JSON.stringify(waits));
  const absent = F.absentFind(batch, cursor.customers, { local, waits, pagedSeen: ['S4:800050'] }, true);
  check(so, 'absentFind: mã cần tra, khách cha cũ, cờ, hàng chờ còn lại và dòng Log',
    [absent.lookups, absent.moved, absent.flags.activity.map((f) => f.record.fbmId + ':' + f.status), Object.keys(absent.waits), absent.logs.map((l) => l.action)],
    [['c:S3', 'a:800002'], ['S3'], ['800007:' + F.SYNC_STATUS.transferred], ['KHAC'], ['activity_owner_mismatch']]);
  check(so, 'absentFind không sửa hàng chờ đầu vào', waits, waitsTruoc);
  check(so, 'Chế độ không ghi Sheet thì không xét vắng', [F.absentFind(batch, cursor.customers, { local: null, waits: {} }, false).lookups.length], [0]);

  // Vòng tra: S3 còn tồn tại ngoài quyền; 800002 vắng hẳn; 800007 sang khách S8 ngoài phạm vi; 800010 sang S9 trong phạm vi; 800011 tra lỗi.
  const cus8 = { id: 'CUS-8', fbmId: 'S8' }, cus9 = { id: 'CUS-9', fbmId: 'S9' };
  const look = (sttRecs) => ({ item: { lookup: { ok: true, sttRecs } } });
  const lookupLocal = Object.assign({}, local, { byStt: { S1: cus1, S3: cus3, S8: cus8, S9: cus9 }, byCus: { 'CUS-1': cus1, 'CUS-3': cus3, 'CUS-8': cus8, 'CUS-9': cus9 }, activityById: { 800002: a2, 800007: a7, 800010: act('800010', 'CUS-1'), 800011: act('800011', 'CUS-1') } });
  const chunk = ['c:S3', 'a:800002', 'a:800007', 'a:800010', 'a:800011'];
  const lookupChecks = [look(['S3']), look([]), look(['S8']), look(['S9']), { item: { lookup: { ok: false, code: 'FBM_500', status: 500, reason: 'lỗi' } } }];
  const waitsTra = { S9: ['1'] }, waitsTraTruoc = JSON.parse(JSON.stringify(waitsTra));
  const decided = F.lookupDecide(chunk, lookupChecks, { local: lookupLocal, waits: waitsTra, isDone: () => false, pullAllowed: () => true, scope: { ids: ['CUS-1', 'CUS-3', 'CUS-9'] } });
  check(so, 'lookupDecide: cờ, khách cần đọc thêm, hàng chờ, lỗi tra',
    [decided.flags.customer.map((f) => f.record.fbmId + ':' + f.status), decided.flags.activity.map((f) => f.record.fbmId + ':' + f.status), decided.adds, decided.waits, decided.failed.map((f) => f.customer)],
    [['S3:' + F.SYNC_STATUS.transferred], ['800009:' + F.SYNC_STATUS.transferred, '800002:' + F.SYNC_STATUS.missing, '800007:' + F.SYNC_STATUS.transferred], ['S9'], { S9: ['1', '800010'] }, ['giao dịch 800011']]);
  check(so, 'lookupDecide không sửa hàng chờ đầu vào', waitsTra, waitsTraTruoc);
  check(so, 'Ba hàm quyết không gọi cổng kho nào', goiKho, []);

  section('FBM sync — người điều phối lô truyền đầu vào, thiếu thì ném');
  const MISSING = 'FBM_BATCH_SOURCE_MISSING';
  check(so, 'Lấp lô thiếu đầu vào của lớp thì ném, không coi như hết khách',
    [thrownCode(() => F.activityBatchPlan({ layer: 'list' }, {}, {})), thrownCode(() => F.activityBatchPlan({ layer: 'top' }, {}, { list: [] })), thrownCode(() => F.activityBatchPlan({ layer: 'rotation', rotation: { start: 0 } }, {}, undefined))], [MISSING, MISSING, MISSING]);
  check(so, 'Tiến trình lớp danh sách thiếu số khách còn chờ thì ném', thrownCode(() => F.activityLayerProgress({ cursor: { layer: 'list' }, progress: { done: 1 } }, {})), MISSING);
  check(so, 'Request vòng tra mã thiếu phần mã đã đọc thì ném, không tự đọc khóa riêng', thrownCode(() => F.activityBatchRequest({ cursor: { lookup: true }, metadata: {} }, {}, null, undefined)), MISSING);
  const listCursor = { layer: 'list' }, listState = { cursor: listCursor, progress: { done: 2 } }, nguon = { list: ['S1', 'S2'], pending: 5 };
  F.activityBatchPlan(listCursor, {}, nguon); F.activityLayerProgress(listState, nguon);
  check(so, 'Lớp danh sách lấy lô và mẫu số tiến trình từ đầu vào', [listCursor.customers, listState.progress], [['S1', 'S2'], { done: 2, total: 7 }]);
  const top = { order: [1, 2, 3, 4], byIndex: { 1: { fbmId: 'T1' }, 2: { fbmId: 'T2', xong: true }, 3: { fbmId: 'T3' }, 4: { fbmId: 'T4' } }, isDone: (r) => !!r.xong, hasRead: (r) => !!r.xong, hasFresh: () => false };
  const topCursor = { layer: 'top', topPos: 0, topQuiet: 0 };
  F.activityBatchPlan(topCursor, {}, { top });
  check(so, 'Lớp 3 lấy dải khách chưa đọc liên tiếp từ đầu vào', [topCursor.customers, topCursor.topPos, topCursor.topPositions], [['T1'], 1, [1]]);
  const rotCursor = { layer: 'rotation', rotation: { start: 0, limit: 3, taken: 0, last: -1 } }, meta = {};
  F.activityBatchPlan(rotCursor, meta, { ring: [{ index: 4, sttRec: 'R4' }, { index: 6, sttRec: 'R6' }, { index: 9, sttRec: 'R9' }] });
  check(so, 'Vòng xoay lấy lô từ vòng khách được truyền vào', [rotCursor.customers, rotCursor.rotation.taken, rotCursor.rotation.last], [['R4', 'R6'], 2, 6]);
  check(so, 'Lấp lô không gọi cổng kho nào', goiKho, []);

  const src = stripComments(fs.readFileSync(path.join(GAS_DIR, 'fbm_sync/read/BatchDecide.js'), 'utf8'));
  check(so, 'Tệp hàm quyết không gọi cổng kho nào', (src.match(new RegExp(GOI_KHO.source, 'g')) || []), []);
  return so;
}

module.exports = { chay };
