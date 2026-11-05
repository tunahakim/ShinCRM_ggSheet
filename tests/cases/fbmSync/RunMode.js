/** Kiểm quyền ghi theo mode của lượt, đếm lượt kéo ở mode đọc và kiểm, câu thông báo kết thúc lượt, và không còn đường ghi FBM ẩn ngoài mode. */
const { section, check } = require('../../lib/assert');
const fs = require('fs');
const path = require('path');
const { keoLo } = require('../../lib/fbm/keo-ve');
const { hopKeoVe } = require('../../lib/fbm/hop-keo');

function chay(so) {
  section('FBM sync — Kiểm quyền ghi theo mode của lượt, đếm lượt kéo ở mode đọc và kiểm, câ');
  const builders = hopKeoVe();
  check(so, 'mode tach quyen ghi Sheet khoi quyen ghi FBM', [
    builders.FbmSync.canWriteSheet('check'), builders.FbmSync.canWriteFbm('check'),
    builders.FbmSync.canWriteSheet('read'), builders.FbmSync.canWriteFbm('read'),
    builders.FbmSync.canWriteSheet('push'), builders.FbmSync.canWriteFbm('push'),
    builders.FbmSync.canWriteSheet('write'), builders.FbmSync.canWriteFbm('write')
  ], [false, false, true, false, false, true, true, true]);
  let readModeState = { mode: 'read', counts: { total: 0, completed: 0, succeeded: 0, conflict: 0, skipped: 0, error: 0 }, metadata: {} };
  let readModeSheetWrites = 0;
  const realPullWrite = builders.FbmSync.pullPageApply;
  builders.FbmSync.stateRead = () => readModeState;
  builders.FbmSync.stateWrite = (next) => { readModeState = next; return next; };
  builders.FbmSync.pullPageApply = (entity, records) => { readModeSheetWrites += 1; return { ok: true, written: records.length, conflicts: 0, skipped: 0, identityBlocks: [], pendingClears: [] }; };
  const readModeResult = keoLo(builders.FbmSync, 'customer', [{ id: 'CUS-000001' }], 'read');
  check(so, 'mode read ghi ket qua pull vao ShinCRM nhung khong co quyen ghi FBM',
    [readModeResult.written, readModeSheetWrites, readModeState.counts.succeeded, builders.FbmSync.canWriteFbm('read')],
    [1, 1, 1, false]);
  builders.FbmSync.pullPageApply = realPullWrite;
  readModeState = { mode: 'check', counts: builders.FbmSync.countsDefault(), metadata: {} };
  keoLo(builders.FbmSync, 'customer', [{ id: 'CUS-000001' }, { id: 'CUS-000002' }], 'check');
  check(so, 'Lượt chỉ kiểm tra đếm bản ghi đã đọc nhưng không tính chúng là bỏ qua',
    [readModeState.counts.completed, readModeState.counts.skipped],
    [2, 0]);
  const loiKhach = { customerErrors: { total: 2, recent: [] } };
  check(so, 'Thông báo kết thúc lượt Hai chiều giữ ghi chú khách lỗi khi đọc giao dịch như lượt Lấy, và không đếm lỗi đọc thành lỗi đẩy', [
    builders.FbmSync.runDoneMessage({ mode: 'write', scan: 'full', counts: Object.assign(builders.FbmSync.countsDefault(), { error: 2 }), metadata: loiKhach }),
    builders.FbmSync.runDoneMessage({ mode: 'read', scan: 'full', counts: Object.assign(builders.FbmSync.countsDefault(), { error: 2 }), metadata: loiKhach })
  ], [
    'Đồng bộ hoàn tất; không có bản ghi nào được đẩy. Có 2 khách lỗi khi đọc giao dịch (xem danh sách lỗi); lượt này chưa đánh dấu giao dịch "không thấy bên FBM".',
    'Đồng bộ hoàn tất. Có 2 khách lỗi khi đọc giao dịch (xem danh sách lỗi); lượt này chưa đánh dấu giao dịch "không thấy bên FBM".'
  ]);
  const transportSource = fs.readFileSync(path.join(__dirname, '..', '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'transport', 'TransportCore.js'), 'utf8');
  check(so, 'khong con co ghi FBM an ngoai mode va cac cong an theo co cu',
    transportSource.indexOf('FBM_SYNC_ALLOW_WRITES') < 0 && transportSource.indexOf('writeAllowed') < 0,
    true);

  return so;
}

module.exports = { chay };
