/** Các phép kiểm nền tảng dùng chung; không biết FBM hay pipeline của module nào. */
if (typeof ShinDiagnostic === 'undefined' || !ShinDiagnostic) { ShinDiagnostic = {}; }

ShinDiagnostic.issue = function (issues, code, severity, scope, message, blocking) {
  issues.push({ code: String(code || ''), severity: severity || 'error', scope: scope || 'core', message: String(message || ''), blocking: blocking === true });
};

/** Đọc Category một lần và trả hợp đồng chẩn đoán cho module gọi. */
function shinCorePreflight(options) {
  var opt = options || {}, issues = [], category = { categories: {}, warnings: [] };
  try {
    category = typeof categoryReadAll === 'function' ? (categoryReadAll() || category) : category;
    (category.warnings || []).forEach(function (warning) {
      ShinDiagnostic.issue(issues, 'CORE_CATEGORY_WARNING', 'warn', 'Category', String(warning), false);
    });
  } catch (categoryError) {
    ShinDiagnostic.issue(issues, 'CORE_CATEGORY_READ_FAILED', 'error', 'Category', 'Không đọc được sheet Category: ' + String(categoryError && categoryError.message || categoryError), true);
  }
  return { ok: !issues.some(function (item) { return item.blocking; }), issues: issues, category: category, mode: opt.mode === 'write' ? 'write' : 'read' };
}
