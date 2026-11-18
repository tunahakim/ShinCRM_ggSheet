/** Ma trận mở và chốt xung đột (FBM-024): mở xung đột giữa lượt nền, DTO kèm ảnh chụp, lệnh chốt thiếu hoặc lệch giá trị bị từ chối, bận, ba phương án lấy FBM, lấy ShinCRM, tùy chỉnh. */
const { section, check } = require('../../lib/assert');
const { giuBanGhi } = require('../../lib/load-gas');
const { ungVienDay } = require('../../lib/fbm/buoc-day');
const { NO_CATEGORY, dongKhachFbm, luoiKhachXungDot, chotXungDot, giaTriFbmCua, giaTriShinCua, phienXongDaXacMinh, dungXungDot } = require('../../lib/fbm/ma-tran');

async function chay(so) {
  section('FBM sync — ma trận chốt xung đột (FBM-024)');
  const { run: cf, F: CF } = dungXungDot([1, 2, 3]);
  CF.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Le Tuan Anh', userId: '2037', customerPrefix: 'ALT', customerCodeLength: 8 });
  const gridResponse = (requestId, rows) => luoiKhachXungDot(CF, requestId, rows);
  const nameDiff = (dto) => ((dto && dto.fields) || []).filter((item) => /Tên/.test(String(item.left)))[0] || {};
  phienXongDaXacMinh(CF);
  const cfNen = CF.stateRead(); cfNen.runId = 'nen-1'; cfNen.origin = 'background'; cfNen.phase = 'pull_customer'; cfNen.activeRequestId = 'nen-req'; CF.stateWrite(cfNen);
  const cfBackground = CF.runSlice(() => CF.runConflictOpenCommand());
  const cfAfterBackground = CF.stateRead();
  check(so, 'Mở xung đột giữa lượt nền trả mã để Sidebar hỏi dừng hay chờ, không phát request và không đụng lượt nền',
    [cfBackground.code, cfBackground.request, cfAfterBackground.runId, cfAfterBackground.activeRequestId, cfAfterBackground.metadata.manualPending || null],
    ['SYNC_BACKGROUND_RUNNING', undefined, 'nen-1', 'nen-req', null]);
  cfAfterBackground.runId = ''; cfAfterBackground.origin = 'manual'; cfAfterBackground.phase = 'done'; cfAfterBackground.activeRequestId = ''; CF.stateWrite(cfAfterBackground);
  const cfOpen = CF.runSlice(() => CF.runConflictOpenCommand());
  check(so, 'FBM-024: phiên mới không làm mất hàng đợi xung đột; mở chế độ xung đột chỉ phát request đọc bản ghi FBM đầu hàng đợi',
    [cfOpen.ok, cfOpen.remaining, cfOpen.request && cfOpen.request.meta.kind, cfOpen.request && cfOpen.request.meta.conflictId, JSON.stringify(CF.stateRead().cursor)],
    [true, 3, 'conflict_refresh_grid', 'CUS-000001', JSON.stringify({ kind: 'conflict_refresh', entity: 'customer', id: 'CUS-000001', fbmId: 'F-1' })]);
  const cfOpened = CF.runSlice(((r) => () => CF.continue(r))(await gridResponse(cfOpen.request.id, [dongKhachFbm('F-1', 'ALT00001', 'Tên FBM khác 1')])));
  check(so, 'FBM-024: response đọc FBM về thì GAS tính diff tại chỗ, trả DTO kèm ảnh chụp lúc mở; state không giữ bản đang xem',
    [cfOpened.ok, cfOpened.conflict && cfOpened.conflict.id, cfOpened.conflict && cfOpened.conflict.remaining, nameDiff(cfOpened.conflict).left, nameDiff(cfOpened.conflict).right, cfOpened.conflict.snapshot.old.companyName, !!cfOpened.conflict.snapshot.openedHash, (CF.stateRead().cursor.kind || null)],
    [true, 'CUS-000001', 3, 'Tên Shin 1', 'Tên FBM khác 1', 'Tên Shin 1', true, null]);
  // Lệnh chốt không đọc lại FBM: Sidebar gửi lại giá trị FBM các trường lệch và ảnh chụp như màn đã hiện.
  const fbmValuesOf = (dto) => Object.fromEntries(((dto && dto.fields) || []).map((item) => [item.field, item.right]));
  const shinValuesOf = (dto) => Object.fromEntries(((dto && dto.fields) || []).map((item) => [item.field, item.left]));
  const cfReopen = async (rows) => { const opened = CF.runSlice(() => CF.runConflictOpenCommand()); return CF.runSlice(((r) => () => CF.continue(r))(await gridResponse(opened.request.id, rows))); };
  check(so, 'Chốt xung đột không phát request đọc lại FBM: lệnh chốt không còn hàm chuẩn bị đọc lại',
    typeof CF.prepareConflictResolution,
    'undefined');

  cf.logs.length = 0;
  const cfMismatch = chotXungDot(CF, 'customer', 'CUS-000001', 'fbm', null, { ten_kh: 'Tên FBM bị sửa ở trình duyệt' }, giaTriShinCua(cfOpened.conflict), cfOpened.conflict.snapshot);
  check(so, 'Giá trị FBM gửi kèm lệnh chốt khác bản FBM lúc mở thì không ghi, trả mở lại và ghi Log',
    [cfMismatch.code, cf.local.customer[0].companyName, cf.local.customer[0].syncStatus, cf.logs.some((event) => event.action === 'conflict_reopen' && event.recordId === 'CUS-000001')],
    ['CONFLICT_REOPEN', 'Tên Shin 1', 'xung đột chờ quyết', true]);
  const cfStray = chotXungDot(CF, 'customer', 'CUS-000001', 'fbm', null, Object.assign(giaTriFbmCua(cfOpened.conflict), { note: 'ghi lén' }), giaTriShinCua(cfOpened.conflict), cfOpened.conflict.snapshot);
  check(so, 'Giá trị FBM gửi kèm có trường ngoài fingerprint thì không ghi, trả mở lại',
    [cfStray.code, cf.local.customer[0].companyName, /note/.test(cfStray.message)],
    ['CONFLICT_REOPEN', 'Tên Shin 1', true]);
  const cfNoValues = chotXungDot(CF, 'customer', 'CUS-000001', 'fbm', null, null, giaTriShinCua(cfOpened.conflict), cfOpened.conflict.snapshot);
  check(so, 'Lệnh chốt thiếu giá trị FBM thì không ghi, trả mở lại',
    [cfNoValues.code, cf.local.customer[0].companyName],
    ['CONFLICT_REOPEN', 'Tên Shin 1']);
  const cfNoShin = chotXungDot(CF, 'customer', 'CUS-000001', 'shin', null, giaTriFbmCua(cfOpened.conflict), {}, cfOpened.conflict.snapshot);
  check(so, 'Lệnh chốt thiếu giá trị ShinCRM của trường lệch thì không ghi, trả mở lại',
    [cfNoShin.code, /thiếu giá trị ShinCRM/.test(cfNoShin.message), cf.local.customer[0].companyName],
    ['CONFLICT_REOPEN', true, 'Tên Shin 1']);
  const cfNoShot = chotXungDot(CF, 'customer', 'CUS-000001', 'fbm', null, giaTriFbmCua(cfOpened.conflict), giaTriShinCua(cfOpened.conflict), null);
  check(so, 'Lệnh chốt thiếu ảnh chụp lúc mở thì không ghi, trả mở lại',
    [cfNoShot.code, /ảnh chụp/.test(cfNoShot.message), cf.local.customer[0].companyName],
    ['CONFLICT_REOPEN', true, 'Tên Shin 1']);

  const cfOpenedNewer = await cfReopen([dongKhachFbm('F-1', 'ALT00001', 'Tên FBM mới hơn 1')]);
  cf.local.customer[0].companyName = 'Tên Shin sửa 1';
  // Hai nhánh trả về cho Sidebar (`conflicts`, `busy`) đi qua đúng cửa lệnh như Sidebar gọi, để cửa ra không cắt mất trường Sidebar cần.
  const chotQuaCua = (id, choice, opened, snapshot) => CF.controlDispatch('confirm_conflict', { entity: 'customer', id: id, choice: choice, merged: null, fbmValues: giaTriFbmCua(opened.conflict), shinValues: giaTriShinCua(opened.conflict), snapshot: snapshot });
  const cfLocalChanged = chotQuaCua('CUS-000001', 'fbm', cfOpenedNewer, cfOpenedNewer.conflict.snapshot);
  const cfChangedField = (cfLocalChanged.conflicts || [])[0] || {};
  check(so, 'ShinCRM đổi trường đang quyết giữa lúc mở và lúc chốt thì không ghi gì, trả xung đột đủ ba giá trị như lưu form',
    [cfLocalChanged.code, cfChangedField.field, cfChangedField.old, cfChangedField.current, cfChangedField.mine, cf.local.customer[0].companyName, cf.local.customer[0].syncStatus],
    ['CONFLICT_SHEET_CHANGED', 'companyName', 'Tên Shin 1', 'Tên Shin sửa 1', 'Tên FBM mới hơn 1', 'Tên Shin sửa 1', 'xung đột chờ quyết']);
  // Sidebar chọn "Lưu giá trị bạn đang chọn": ảnh chụp nhận giá trị Sheet hiện tại làm mốc mới rồi gửi lại.
  const cfShotNew = JSON.parse(JSON.stringify(cfOpenedNewer.conflict.snapshot));
  cfShotNew.old.companyName = cfChangedField.current;
  phienXongDaXacMinh(CF);
  giuBanGhi(cf.hop, 'khac', 'customer', 'CUS-000001', 'Tiến trình khác đang giữ.');
  const cfBusy = chotQuaCua('CUS-000001', 'fbm', cfOpenedNewer, cfShotNew);
  check(so, 'Bản ghi đang bị tiến trình khác giữ lúc chốt thì báo bận kèm lý do, không ghi gì',
    [cfBusy.code, cfBusy.busy && cfBusy.busy.reason, cf.local.customer[0].companyName, cf.local.customer[0].syncStatus], ['CONFLICT_RECORD_BUSY', 'Tiến trình khác đang giữ.', 'Tên Shin sửa 1', 'xung đột chờ quyết']);
  cf.hop.recordGateRun({ by: 'khac', decide: () => ({ release: [{ entity: 'customer', ids: ['CUS-000001'] }] }) });
  cf.local.customer[0].note = 'Ghi chú sửa giữa chừng';
  const cfFbm = chotXungDot(CF, 'customer', 'CUS-000001', 'fbm', null, giaTriFbmCua(cfOpenedNewer.conflict), giaTriShinCua(cfOpenedNewer.conflict), cfShotNew);
  check(so, 'FBM-024 PA1: phiên mới bắt đầu giữa chừng vẫn chốt được theo ảnh chụp; lấy FBM ghi giá trị FBM, baseline là hash FBM lúc mở, trường khác vừa sửa được giữ, còn 2 xung đột',
    [cfFbm.ok, cf.local.customer[0].companyName, cf.local.customer[0].note, cf.local.customer[0].syncStatus, cf.local.customer[0].fbmHash === CF.hash(CF.customerRecord(dongKhachFbm('F-1', 'ALT00001', 'Tên FBM mới hơn 1'), NO_CATEGORY), 'customer', NO_CATEGORY), cfFbm.remaining, CF.stateRead().metadata.conflictCount],
    [true, 'Tên FBM mới hơn 1', 'Ghi chú sửa giữa chừng', 'đã đồng bộ', true, 2, 2]);
  const cfGone = chotXungDot(CF, 'customer', 'CUS-000001', 'fbm', null, giaTriFbmCua(cfOpenedNewer.conflict), giaTriShinCua(cfOpenedNewer.conflict), cfShotNew);
  check(so, 'Chốt lại dòng đã rời trạng thái xung đột chờ quyết thì báo không còn, không ghi gì',
    [cfGone.code, cf.local.customer[0].companyName],
    ['CONFLICT_NOT_FOUND', 'Tên FBM mới hơn 1']);

  const cfOpen2 = CF.runSlice(() => CF.runConflictOpenCommand());
  const cfOpened2 = CF.runSlice(((r) => () => CF.continue(r))(await gridResponse(cfOpen2.request.id, [dongKhachFbm('F-2', 'ALT00002', 'Tên FBM 2')])));
  // Màn hiện 'Tên Shin 2'; Sheet bị sửa giữa chừng, người dùng thấy popup và chọn giữ lựa chọn: ghi giá trị màn đang hiện, giá trị Sheet chỉ làm mốc.
  cf.local.customer[1].companyName = 'Tên Shin 2 sửa trên Sheet';
  const cfShinChanged = chotXungDot(CF, 'customer', 'CUS-000002', 'shin', null, giaTriFbmCua(cfOpened2.conflict), giaTriShinCua(cfOpened2.conflict), cfOpened2.conflict.snapshot);
  const cfShinShot = JSON.parse(JSON.stringify(cfOpened2.conflict.snapshot));
  cfShinShot.old.companyName = ((cfShinChanged.conflicts || [])[0] || {}).current;
  const cfShin = chotXungDot(CF, 'customer', 'CUS-000002', 'shin', null, giaTriFbmCua(cfOpened2.conflict), giaTriShinCua(cfOpened2.conflict), cfShinShot);
  check(so, 'Chọn ShinCRM, Sheet đổi giữa chừng: lần đầu trả xung đột, gửi lại với mốc mới thì ghi giá trị ShinCRM màn đang hiện chứ không phải giá trị Sheet',
    [cfShinChanged.code, cfShinShot.old.companyName], ['CONFLICT_SHEET_CHANGED', 'Tên Shin 2 sửa trên Sheet']);
  const cfShinRow = cf.local.customer[1];
  check(so, 'FBM-024 PA2: lấy ShinCRM giữ giá trị ShinCRM, baseline là hash FBM mới, trạng thái chờ đối soát và vào danh sách đẩy',
    [cfShin.ok, cfOpen2.request.meta.conflictId, cfShinRow.companyName, cfShinRow.syncStatus, cfShinRow.fbmHash === CF.hash(CF.customerRecord(dongKhachFbm('F-2', 'ALT00002', 'Tên FBM 2'), NO_CATEGORY), 'customer', NO_CATEGORY), ungVienDay(CF, 'customer').map((item) => item.id)],
    [true, 'CUS-000002', 'Tên Shin 2', 'chờ đối soát', true, ['CUS-000002']]);

  const cfOpen3 = CF.runSlice(() => CF.runConflictOpenCommand());
  const cfOpened3 = CF.runSlice(((r) => () => CF.continue(r))(await gridResponse(cfOpen3.request.id, [dongKhachFbm('F-3', 'ALT00003', 'Tên FBM 3')])));
  const cfMergeField = nameDiff(cfOpened3.conflict).field;
  const cfManual = chotXungDot(CF, 'customer', 'CUS-000003', 'manual', { [cfMergeField]: { choice: 'manual', value: 'Tên tự nhập 3' } }, giaTriFbmCua(cfOpened3.conflict), giaTriShinCua(cfOpened3.conflict), cfOpened3.conflict.snapshot);
  const cfManualState = CF.stateRead();
  check(so, 'FBM-024 PA3: tùy chỉnh ghi giá trị tự nhập vào ShinCRM, trạng thái chờ đối soát; hết hàng đợi thì số đếm về 0 và không còn request đang chờ',
    [cfManual.ok, cf.local.customer[2].companyName, cf.local.customer[2].syncStatus, cfManual.remaining, cfManualState.metadata.conflictCount, (cfManualState.cursor.kind || null)],
    [true, 'Tên tự nhập 3', 'chờ đối soát', 0, 0, null]);
  const cfEmpty = CF.runSlice(() => CF.runConflictOpenCommand());
  check(so, 'FBM-024: hàng đợi rỗng thì mở chế độ xung đột báo không còn xung đột, không phát request',
    [cfEmpty.empty, cfEmpty.request],
    [true, undefined]);
}

module.exports = { chay };
