/** Ma trận xung đột phía đọc lại FBM: FBM-053 đọc lại khớp thì tự đóng, FBM-033 bản ghi không đọc được rời hàng đợi, và 80 xung đột dài không làm state phình. */
const { section, check } = require('../../lib/assert');
const { makeSync } = require('../../lib/fbm/hang-day');
const { keoVe, keoLo } = require('../../lib/fbm/keo-ve');
const { NO_CATEGORY, CONG_HA_NOI, dongKhachFbm, luoiKhachXungDot, chotXungDot, phienXongDaXacMinh, dungXungDot, moXungDot } = require('../../lib/fbm/ma-tran');

async function chay(so) {
  section('FBM sync — ma trận đọc lại FBM khi xử lý xung đột');
  // FBM-053: đọc xác nhận lệch nhưng bản đọc lại đã khớp mọi trường thì không còn gì để người dùng chọn.
  const { run: sm, F: SM } = dungXungDot([1]);
  phienXongDaXacMinh(SM);
  const smOpen = moXungDot(SM);
  const smSame = SM.runSlice(((r) => () => SM.continue(r))(await luoiKhachXungDot(SM, smOpen.request.id, [dongKhachFbm('F-1', 'ALT00001', 'Tên Shin 1')])));
  check(so, 'FBM-053: đọc lại FBM thấy khớp ShinCRM mọi trường thì tự đóng xung đột (đã đồng bộ, baseline là hash FBM), không trả màn xung đột rỗng',
    [smOpen.remaining, smSame.ok, smSame.conflict, sm.local.customer[0].syncStatus, sm.local.customer[0].fbmHash === SM.hash(SM.customerRecord(dongKhachFbm('F-1', 'ALT00001', 'Tên Shin 1'), NO_CATEGORY), 'customer', NO_CATEGORY), smSame.remaining, (SM.stateRead().cursor.kind || null)],
    [1, true, null, 'đã đồng bộ', true, 0, null]);

  // FBM-033: bản ghi đầu hàng đợi không đọc được trên FBM thì rời hàng đợi, không chặn các xung đột phía sau.
  const { run: un, F: UN } = dungXungDot([1, 2, 3, 4]);
  phienXongDaXacMinh(UN);
  un.logs.length = 0;
  const unOpen = moXungDot(UN);
  const unMissing = UN.runSlice(((r) => () => UN.continue(r))(await luoiKhachXungDot(UN, unOpen.request.id, [])));
  const unLog = un.logs.find((event) => event.action === 'pull_record_issue' && /rời hàng đợi xung đột/.test(String(event.reason)));
  check(so, 'FBM-033: FBM không trả bản ghi đầu hàng đợi thì dòng đó chuyển "không thấy bên FBM", rời hàng đợi, Sidebar nhận lý do và Log có dòng ghi mã bản ghi',
    [unMissing.code, un.local.customer[0].syncStatus, unMissing.remaining, /CUS-000001.*bị xóa hoặc chuyển quyền/.test(unMissing.message), !!unLog && unLog.recordId, (UN.stateRead().cursor.kind || null)],
    ['CONFLICT_RECORD_UNREADABLE', 'không thấy bên FBM', 3, true, 'CUS-000001', null]);
  const unNext = moXungDot(UN);
  check(so, 'FBM-033: mở lại chế độ xung đột thì tới lượt bản ghi kế tiếp, không kẹt ở bản ghi không đọc được',
    [unNext.ok, unNext.request && unNext.request.meta.conflictId, unNext.remaining],
    [true, 'CUS-000002', 3]);
  const unOpened2 = UN.runSlice(((r) => () => UN.continue(r))(await luoiKhachXungDot(UN, unNext.request.id, [dongKhachFbm('F-2', 'ALT00002', 'Tên FBM 2')])));
  const unSettled = chotXungDot(UN, 'customer', 'CUS-000002', 'fbm', null, Object.fromEntries(unOpened2.conflict.fields.map((item) => [item.field, item.right])), Object.fromEntries(unOpened2.conflict.fields.map((item) => [item.field, item.left])), unOpened2.conflict.snapshot);
  check(so, 'FBM-033: chốt bản ghi kế tiếp theo bản đã mở thì rời hàng đợi',
    [unSettled.ok, un.local.customer[1].companyName, unSettled.remaining],
    [true, 'Tên FBM 2', 2]);
  un.local.customer[2].fbmId = '';
  const unNoId = moXungDot(UN);
  check(so, 'FBM-033: bản ghi xung đột thiếu ID FBM cũng rời hàng đợi ngay, không phát request',
    [unNoId.code, unNoId.request, un.local.customer[2].syncStatus, moXungDot(UN).request.meta.conflictId],
    ['CONFLICT_RECORD_UNREADABLE', undefined, 'không thấy bên FBM', 'CUS-000004']);

  const cfBig = makeSync(), CB = cfBig.hop.FbmSync;
  const cfBigState = CB.runOpen({ phase: 'pull_customer' }); cfBigState.mode = 'read'; CB.readCategoryGate = () => CONG_HA_NOI; CB.stateWrite(cfBigState);
  const cfBigIds = Array.from({ length: 80 }, (_, index) => index + 10);
  const longName = (prefix, n) => prefix + ' ' + n + ' ' + 'x'.repeat(400);
  keoVe(CB, 'customer', cfBigIds.map((n) => CB.customerRecord(dongKhachFbm('F-' + n, 'ALT000' + n, longName('Gốc', n)), { map: {} })));
  cfBig.local.customer.forEach((row, index) => { row.companyName = longName('Shin', cfBigIds[index]); });
  const cfBigPull = keoLo(CB, 'customer', cfBigIds.map((n) => CB.customerRecord(dongKhachFbm('F-' + n, 'ALT000' + n, longName('FBM', n)), { map: {} })), 'read');
  keoLo(CB, 'customer', cfBigIds.map((n) => CB.customerRecord(dongKhachFbm('F-' + n, 'ALT000' + n, longName('FBM', n)), { map: {} })), 'read');
  const cfStateBytes = Object.keys(cfBig.documentProperties.data).filter((key) => /^FBM_SYNC_STATE/.test(key)).reduce((sum, key) => sum + Buffer.byteLength(cfBig.documentProperties.data[key], 'utf8'), 0);
  check(so, 'FBM-024: 80 xung đột nội dung dài, pull lặp lại hai lần, state vẫn dưới 3KB và số đếm không nhân bản',
    [cfBigPull.conflicts, cfStateBytes > 0 && cfStateBytes < 3000, CB.stateRead().metadata.conflictCount], [80, true, 80]);
}

module.exports = { chay };
