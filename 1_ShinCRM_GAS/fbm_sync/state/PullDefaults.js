/**
 * Phần cài đặt của `fbm_sync` trong cổng cài đặt chung, và công cụ lấy ngầm định cho bản ghi mới kéo từ FBM.
 *
 * Ngầm định kéo từ FBM là kênh nhập riêng, không dùng chung với ngầm định khi nhập trên Sidebar: FBM không có trường "Xác thực" nên ShinCRM phải tự điền cho khách mới, còn người nhập tay trên Sidebar thì tự chọn.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

function fbmSettingsSections() {
  return [
    {
      name: 'defaults_fbm_pull',
      owner: 'fbm_sync',
      label: 'Ngầm định khi kéo từ FBM',
      fields: {
        values: {
          kind: 'fieldDefaults', label: 'Giá trị điền cho khách mới',
          entities: { customer: ['verifyStatus'] },
          hint: 'Giá trị gán cho khách mới kéo từ FBM; khách đã có giữ nguyên giá trị đang có. Chưa chọn Xác thực, hoặc giá trị không còn trong Category, thì lượt "Lấy từ FBM" bị chặn trước khi ghi.'
        }
      }
    }
  ];
}

/** Ngầm định đã kiểm với Category cho bản ghi mới của một thực thể. Khách mới bắt buộc có Xác thực: preflight đã chặn khi thiếu, thiếu mà vẫn tới đây thì ném chứ không ghi ô trống. */
FbmSync.pullDefaults = function (entity, category) {
  var values = settingsDefaultsChecked('defaults_fbm_pull', category)[entity] || {};
  if (entity === 'customer' && !String(values.verifyStatus || '').trim()) {
    var error = new Error('Chưa chọn giá trị Xác thực hợp lệ cho khách kéo từ FBM (Cài đặt › Ngầm định khi kéo từ FBM).');
    error.code = 'FBM_VERIFY_STATUS_DEFAULT_MISSING';
    throw error;
  }
  return values;
};
