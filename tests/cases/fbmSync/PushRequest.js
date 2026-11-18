/** Chặng đẩy phát request ghi: giữ bản ghi trong sổ bận, hoãn ứng viên đã bị sửa sau lúc chọn, xung đột giữa lượt không dừng chiều đẩy, và thông báo khi không có gì để đẩy. */
const { section, check } = require('../../lib/assert');
const { soBan } = require('../../lib/load-gas');
const { dungHopDay, moQuetDay } = require('../../lib/fbm/hop-day');
const { datUngVienDay } = require('../../lib/fbm/ung-vien-day');
const { trongLat } = require('../../lib/fbm/hop-dong-bo');

async function chay(so) {
  section('FBM sync — push: phát request');
  const hop = dungHopDay(), push = hop.push;
  const pushState = moQuetDay(hop);
  const pushRequest = trongLat(push.FbmSync, () => push.FbmSync.pushStageResume(pushState), pushState);
  const pushedState = push.FbmSync.stateRead();
  check(so, 'Trước request ghi FBM, bản ghi được giữ trong sổ bận dưới tên đồng bộ',
    soBan(push)['customer:C-1'].by,
    'fbm');
  check(so, 'push request luu dung cursor cho phan hoi tiep', pushedState.cursor.kind, 'push_wait');
  check(so, 'push request co envelope protocol', pushRequest.meta.kind, 'customer_edit_open');
  datUngVienDay(push, () => [
    { kind: 'edit', id: 'C-1', position: 0, record: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' }, raw: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1', companyName: 'Bản lúc chọn' } },
    { kind: 'edit', id: 'C-NEXT', position: 3, record: { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' }, raw: { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' } }
  ]);
  const changedState = moQuetDay(hop);
  const changedRequest = trongLat(push.FbmSync, () => push.FbmSync.pushStageResume(changedState), changedState);
  check(so, 'ứng viên bị sửa sau lúc chọn thì hoãn tới lượt sau, không giữ, không gửi; lượt chuyển sang ứng viên kế tiếp', [
    !!changedRequest, push.FbmSync.stateRead().counts.skipped, Object.keys(soBan(push)), push.FbmSync.stateRead().current
  ], [true, 1, ['customer:C-NEXT'], 'C-NEXT']);
  datUngVienDay(push, () => [{ kind: 'edit', id: 'C-1', position: 0, record: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' } }]);
  const conflictPushState = moQuetDay(hop, 'customer', { counts: Object.assign(push.FbmSync.runOpen({ phase: 'push' }).counts, { conflict: 1 }) });
  const conflictPushRequest = trongLat(push.FbmSync, () => push.FbmSync.pushStageResume(conflictPushState), conflictPushState);
  check(so, 'pull phát hiện xung đột giữa lượt không dừng chiều đẩy: bản ghi khác vẫn được phát request đẩy',
    [!!conflictPushRequest, push.FbmSync.stateRead().phase, push.FbmSync.stateRead().current],
    [true, 'push', 'C-1']);
  check(so, 'Xung đột phát hiện giữa lượt không còn công tắc dừng cả chiều đẩy: chỉ dòng xung đột bị pushCandidates loại',
    typeof push.FbmSync.stopPushOnConflicts,
    'undefined');
  datUngVienDay(push, () => []);
  const emptyWriteState = moQuetDay(hop, 'customer', { mode: 'write' });
  trongLat(push.FbmSync, () => push.FbmSync.pushStageResume(emptyWriteState), emptyWriteState);
  check(so, 'push khong co ung vien hien thong bao khong co ban ghi day',
    push.FbmSync.stateRead().message,
    'Đồng bộ hoàn tất; không có bản ghi nào được đẩy.');
}

module.exports = { chay };
