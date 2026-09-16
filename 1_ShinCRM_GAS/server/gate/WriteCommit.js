/**
 * Hậu xử lý chung của mọi lượt ghi Sheet đã được xác nhận.
 *
 * Các cửa nghiệp vụ vẫn giữ luật riêng của mình, nhưng không được tự dựng
 * ReloadDecision, tự ghi DirtyState hoặc tự gọi renderer. Tệp này không ghi
 * dữ liệu nguồn. Khi cửa gọi đang giữ document lock, hãy dùng `render: false`
 * để ghi signal trong cùng khóa rồi gọi `writeCommitRender()` sau khi nhả khóa.
 */

function writeCommitCopy(input) {
  var source = input || {};
  var copy = {};
  Object.keys(source).forEach(function (key) { copy[key] = source[key]; });
  copy.writeSucceeded = true;
  if (!Array.isArray(copy.viewSheetNames) && typeof shinViewSheetNames === 'function' && typeof shinOpenBook === 'function') {
    copy.viewSheetNames = shinViewSheetNames(shinOpenBook());
  }
  if (copy.autoRenderView === undefined) {
    var prefs = typeof userPrefsRead === 'function' ? userPrefsRead() : { autoRenderView: true };
    copy.autoRenderView = prefs.autoRenderView !== false;
  }
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
  if (missing.length) {
    throw new Error('Thiếu hậu xử lý bắt buộc của cửa ghi: ' + missing.join(', ') + '. Không ghi dữ liệu để tránh mất signal reload.');
  }
  return true;
}

/**
 * Phát signal và render sau một lượt ghi thành công.
 *
 * Renderer chạy sau khi cửa ghi đã nhả khóa. Lỗi renderer không phủ nhận việc
 * dữ liệu nguồn đã ghi thành công; cờ bẩn được giữ lại để lượt sau xử lý tiếp,
 * tránh caller tự thử lại và ghi trùng bản ghi.
 */
function writeCommitRender(commit) {
  var prepared = commit || {};
  var decision = prepared.reloadDecision;
  if (!decision || !decision.views || decision.views.action !== 'render' || typeof renderAllManagedViewsIfAllowed !== 'function') {
    return null;
  }

  try {
    return renderAllManagedViewsIfAllowed({ policyBypass: decision.views.policyBypass === true });
  } catch (error) {
    return { ok: false, error: String(error && error.message || error), dirty: typeof reloadStateRead === 'function' ? reloadStateRead() : prepared.dirty };
  }
}

function writeCommitAfterSuccess(input) {
  writeCommitAssertAvailable();

  var decision = reloadDecisionForChange(writeCommitCopy(input));
  var dirty = dirtyStateMarkDecision(decision);
  var viewRender = input && input.render === false ? null : writeCommitRender({ reloadDecision: decision, dirty: dirty });

  return {
    reloadDecision: decision,
    viewRender: viewRender,
    dirty: typeof reloadStateRead === 'function' ? reloadStateRead() : dirty
  };
}
