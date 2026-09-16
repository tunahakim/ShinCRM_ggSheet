/**
 * Hậu xử lý chung của mọi lượt ghi Sheet đã được xác nhận.
 *
 * Các cửa nghiệp vụ vẫn giữ luật riêng của mình, nhưng không được tự dựng
 * ReloadDecision, tự ghi DirtyState hoặc tự gọi renderer. Tệp này chỉ chạy sau
 * khi bên gọi đã ghi, flush và đọc lại thành công; nó không lấy khóa và không
 * ghi dữ liệu nguồn.
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
 * Phát signal và render sau một lượt ghi thành công.
 *
 * Renderer chạy sau khi cửa ghi đã nhả khóa. Lỗi renderer không phủ nhận việc
 * dữ liệu nguồn đã ghi thành công; cờ bẩn được giữ lại để lượt sau xử lý tiếp,
 * tránh caller tự thử lại và ghi trùng bản ghi.
 */
function writeCommitAfterSuccess(input) {
  if (typeof reloadDecisionForChange !== 'function') {
    return { reloadDecision: null, viewRender: null, dirty: null };
  }

  var decision = reloadDecisionForChange(writeCommitCopy(input));
  var dirty = typeof dirtyStateMarkDecision === 'function'
    ? dirtyStateMarkDecision(decision)
    : (typeof reloadStateRead === 'function' ? reloadStateRead() : null);
  var viewRender = null;

  if (decision.views && decision.views.action === 'render' && typeof renderAllManagedViewsIfAllowed === 'function') {
    try {
      viewRender = renderAllManagedViewsIfAllowed();
    } catch (error) {
      viewRender = { ok: false, error: String(error && error.message || error), dirty: typeof reloadStateRead === 'function' ? reloadStateRead() : dirty };
    }
  }

  return {
    reloadDecision: decision,
    viewRender: viewRender,
    dirty: typeof reloadStateRead === 'function' ? reloadStateRead() : dirty
  };
}
