/**
 * Hậu xử lý chung của mọi lượt ghi Sheet đã được xác nhận.
 *
 * Các cửa nghiệp vụ vẫn giữ luật riêng của mình, nhưng không được tự dựng
 * ReloadDecision hoặc tự ghi DirtyState. Tệp này không ghi dữ liệu nguồn và
 * không vẽ sheet quản trị: dữ liệu đổi chỉ làm view cũ (tab tô cam), Sidebar
 * vẽ khi có người xem. Gọi trong document lock của cửa ghi để hai lượt ghi không cùng
 * đọc một revision cũ.
 */

function writeCommitCopy(input) {
  var source = input || {};
  var copy = {};
  Object.keys(source).forEach(function (key) { copy[key] = source[key]; });
  copy.writeSucceeded = true;
  return copy;
}

/**
 * Cổng ghi dữ liệu không được phép chạy thiếu bộ điều phối reload.
 *
 * Nếu bỏ qua kiểm tra này, bản ghi vẫn có thể đã xuống Sheet nhưng Sidebar và
 * sheet quản trị không nhận được signal. Khi đó caller tưởng là lần ghi lỗi và
 * có thể gửi lại, trong khi dữ liệu thật đã đổi. Fail-fast trước khi ghi an
 * toàn hơn việc ghi thành công rồi mới phát hiện thiếu hậu xử lý.
 */
function writeCommitAssertAvailable() {
  var missing = [];
  if (typeof reloadDecisionForChange !== 'function') { missing.push('ReloadDecision'); }
  if (typeof dirtyStateMarkDecision !== 'function') { missing.push('DirtyState'); }
  if (typeof reloadStateRead !== 'function') { missing.push('reloadStateRead'); }
  if (typeof writeCommitAfterSuccess !== 'function') { missing.push('WriteCommit'); }
  if (typeof viewTabTintStaleLocked !== 'function') { missing.push('ViewTabTint'); }
  if (missing.length) {
    throw new Error('Thiếu hậu xử lý bắt buộc của cửa ghi: ' + missing.join(', ') + '. Không ghi dữ liệu để tránh mất signal reload.');
  }
  return true;
}

function writeCommitAfterSuccess(input) {
  writeCommitAssertAvailable();

  var decision = reloadDecisionForChange(writeCommitCopy(input));
  dirtyStateMarkDecision(decision);
  viewTabTintStaleLocked();

  return {
    reloadDecision: decision,
    dirty: reloadStateRead()
  };
}
