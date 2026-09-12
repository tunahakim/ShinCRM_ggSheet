/** Các phép kiểm nền tảng dùng chung; không biết FBM hay pipeline của module nào. */
if (typeof ShinDiagnostic === 'undefined' || !ShinDiagnostic) { ShinDiagnostic = {}; }

ShinDiagnostic.issue = function (issues, code, severity, scope, message, blocking) {
  issues.push({ code: String(code || ''), severity: severity || 'error', scope: scope || 'core', message: String(message || ''), blocking: blocking === true });
};

/** Đọc Config/Category một lần và trả hợp đồng chẩn đoán cho module gọi. */
function shinCorePreflight(options) {
  var opt = options || {}, issues = [], params = {}, category = { categories: {}, warnings: [] };
  try {
    params = typeof configParams === 'function' ? configParams() : {};
  } catch (configError) {
    ShinDiagnostic.issue(issues, 'CORE_CONFIG_READ_FAILED', 'error', 'Config', 'Không đọc được sheet Config: ' + String(configError && configError.message || configError), true);
  }
  try {
    category = typeof categoryReadAll === 'function' ? (categoryReadAll() || category) : category;
    (category.warnings || []).forEach(function (warning) {
      ShinDiagnostic.issue(issues, 'CORE_CATEGORY_WARNING', 'warn', 'Category', String(warning), false);
    });
  } catch (categoryError) {
    ShinDiagnostic.issue(issues, 'CORE_CATEGORY_READ_FAILED', 'error', 'Category', 'Không đọc được sheet Category: ' + String(categoryError && categoryError.message || categoryError), true);
  }
  return { ok: !issues.some(function (item) { return item.blocking; }), issues: issues, params: params, category: category, mode: opt.mode === 'write' ? 'write' : 'read' };
}
