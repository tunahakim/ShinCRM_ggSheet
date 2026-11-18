/**
 * Công cụ lấy ngầm định cho bản ghi mới kéo từ FBM; phần cài đặt `defaults_fbm_pull` khai ở `FbmSettings.js`.
 *
 * Ngầm định kéo từ FBM là kênh nhập riêng, không dùng chung với ngầm định khi nhập trên Sidebar: mọi trường chỉ có ở ShinCRM (`FbmSync.LOCAL_FIELDS`) FBM không điền được, nên bản ghi mới kéo về lấy giá trị của chúng ở đây, còn người nhập tay trên Sidebar thì tự chọn.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
/** Tên thực thể trong lời báo thiếu ngầm định. */
FbmSync.PULL_ENTITY_LABELS = { customer: 'khách', activity: 'giao dịch' };

/** Trường bắt buộc của DATA_SCHEMA mà FBM không mang (thuần): nguồn duy nhất cho chỗ ném lỗi và chỗ kiểm trước lượt, để hai nơi không lệch nhau về trường nào phải có ngầm định. */
FbmSync.requiredLocalFields = function (entity) {
  return (FbmSync.LOCAL_FIELDS[entity] || []).filter(function (field) { return DATA_SCHEMA[entity][field].required === true; });
};

/** Ngầm định đã kiểm với Category cho bản ghi mới của một thực thể. Trường bắt buộc mà FBM không mang phải có ngầm định: preflight đã chặn khi thiếu, thiếu mà vẫn tới đây thì ném chứ không ghi ô trống. */
FbmSync.pullDefaults = function (entity, category) {
  var values = settingsDefaultsChecked('defaults_fbm_pull', category)[entity] || {};
  var missing = FbmSync.requiredLocalFields(entity).filter(function (field) { return !String(values[field] === undefined || values[field] === null ? '' : values[field]).trim(); });
  if (missing.length) {
    var error = new Error('Chưa chọn giá trị hợp lệ cho ' + missing.map(function (field) { return '"' + DATA_SCHEMA[entity][field].label + '"'; }).join(', ') + ' của ' + FbmSync.PULL_ENTITY_LABELS[entity] + ' kéo từ FBM (Cài đặt › Ngầm định khi kéo từ FBM).');
    error.code = 'FBM_PULL_DEFAULT_MISSING';
    throw error;
  }
  return values;
};
