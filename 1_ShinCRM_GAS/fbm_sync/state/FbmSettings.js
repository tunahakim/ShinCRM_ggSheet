/**
 * Mọi phần cài đặt của `fbm_sync` trong cổng cài đặt chung (khai thuần dữ liệu, cổng `server/settings/` đọc, kiểm, ghi). Mỗi nhóm cài đặt một phần, mỗi phần một khóa kho `SETTINGS:<tên phần>`.
 *
 * Mặc định của từng trường chỉ nằm ở `default` tại đây: ô để trống là chưa đặt và đọc ra giá trị này; Sidebar và Extension không giữ bản sao. Con số giới hạn dùng chung với phần khác của đồng bộ lấy từ `FbmSync.BUDGET`, `FbmSync.SCHEDULE_MAX_MINUTES`.
 *
 * Phạm vi mặc định giới hạn với danh sách rỗng: tệp mới chưa ai cấu hình thì không được quét và ghi toàn bộ khách thật. Mã khách đi thẳng vào điều kiện SQL của grid FBM nên khuôn mã chỉ nhận ký tự an toàn.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
var SETTINGS_SECTION_PROVIDERS = typeof SETTINGS_SECTION_PROVIDERS !== 'undefined' ? SETTINGS_SECTION_PROVIDERS : {};
SETTINGS_SECTION_PROVIDERS.fbm_sync = function () { return fbmSettingsSections(); };

/** Tên phần cài đặt của đồng bộ, để bên đọc không gõ chuỗi tay. */
FbmSync.SETTING_SECTIONS = { master: 'fbm_master', run: 'fbm_run', account: 'fbm_account', extension: 'fbm_extension', background: 'fbm_background', loginPolicy: 'fbm_login_policy', pullDefaults: 'defaults_fbm_pull' };
/** Tiến trình nền theo thứ tự hiện trên màn cài đặt; mỗi tiến trình có hai trường `<tên>Enabled`, `<tên>Minutes` trong phần lịch nền. */
FbmSync.SCHEDULE_KINDS = ['heartbeat', 'customerFull', 'activityFull', 'detail'];
/** Trần chu kỳ lịch nền: 7 ngày, tính bằng phút. */
FbmSync.SCHEDULE_MAX_MINUTES = 7 * 24 * 60;

function fbmSettingsSections() {
  return [
    {
      name: FbmSync.SETTING_SECTIONS.master, owner: 'fbm_sync', label: 'Công tắc đồng bộ FBM',
      fields: {
        enabled: { kind: 'boolean', label: 'Đồng bộ FBM', default: true, hint: 'Tắt thì mọi lượt đồng bộ, tay lẫn nền, dừng ngay và không mở lượt mới.' }
      }
    },
    {
      name: FbmSync.SETTING_SECTIONS.run, owner: 'fbm_sync', label: 'Tham số phiên FBM',
      fields: {
        approvalThreshold: { kind: 'number', label: 'Ngưỡng yêu cầu chấp thuận', min: 0, default: 10, hint: 'Số bản ghi chờ đẩy lên FBM vượt ngưỡng này thì lượt dừng chờ người dùng chấp thuận. 0 = luôn hỏi.' },
        scopeLimited: { kind: 'boolean', label: 'Giới hạn phạm vi khách', default: true, hint: 'Bật thì lượt đồng bộ chỉ đọc và ghi các khách trong danh sách chỉ định.' },
        scopeCodes: {
          kind: 'codeList', label: 'Danh sách khách chỉ định', pattern: /^[A-Za-z0-9._-]{1,32}$/, maxItems: 40,
          patternHint: 'mỗi mã chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới, dài tối đa 32 ký tự.',
          hint: 'Mã khách FBM hoặc mã khách ShinCRM, ngăn bởi dấu phẩy hoặc xuống dòng. Muốn chạy rộng hơn 40 mã thì tắt giới hạn phạm vi.'
        },
        requestGapMinSeconds: { kind: 'number', label: 'Nghỉ tối thiểu giữa hai request (giây)', min: 0, max: FbmSync.BUDGET.requestGapMaxSeconds, default: 0, hint: 'Extension nghỉ ngẫu nhiên trong khoảng tối thiểu – tối đa trước mỗi request tới FBM.' },
        requestGapMaxSeconds: { kind: 'number', label: 'Nghỉ tối đa giữa hai request (giây)', min: 0, max: FbmSync.BUDGET.requestGapMaxSeconds, default: 0, hint: 'Không nhỏ hơn mức tối thiểu.' }
      },
      check: function (values) {
        return values.requestGapMaxSeconds < values.requestGapMinSeconds ? [{ field: 'requestGapMaxSeconds', reason: 'không được nhỏ hơn mức nghỉ tối thiểu (' + values.requestGapMinSeconds + ' giây).' }] : [];
      }
    },
    {
      name: FbmSync.SETTING_SECTIONS.account, owner: 'fbm_sync', label: 'Tài khoản FBM',
      fields: {
        customerPrefix: { kind: 'text', label: 'Tiền tố mã khách FBM', max: 64, hint: 'Phần đầu cố định của mã khách FBM. Để trống cả tiền tố lẫn độ dài thì không tạo khách mới trên FBM.' },
        customerCodeLength: { kind: 'number', label: 'Độ dài mã khách FBM', min: 1, max: 32, hint: 'Số ký tự của cả mã khách FBM, tính cả tiền tố.' }
      },
      check: function (values) {
        var hasPrefix = values.customerPrefix !== '', hasLength = values.customerCodeLength !== '';
        return hasPrefix === hasLength ? [] : [{ field: hasPrefix ? 'customerCodeLength' : 'customerPrefix', reason: 'tiền tố và độ dài mã khách FBM phải nhập đủ cả hai, hoặc để trống cả hai để tắt tạo khách mới.' }];
      }
    },
    {
      name: FbmSync.SETTING_SECTIONS.extension, owner: 'fbm_sync', label: 'Nhịp Extension',
      fields: {
        pollMinutes: { kind: 'number', label: 'Nhịp hỏi GAS (phút)', min: 1, max: 60, default: 5, hint: 'Extension máy chạy nền hỏi GAS theo nhịp này để nhận việc nền.' },
        runOnStartup: { kind: 'boolean', label: 'Hỏi GAS khi mở trình duyệt', default: true, hint: 'Mở Chrome là hỏi GAS một lần ngay, không chờ hết nhịp.' }
      }
    },
    {
      name: FbmSync.SETTING_SECTIONS.background, owner: 'fbm_sync', label: 'Lịch đồng bộ nền',
      fields: {
        enabled: { kind: 'boolean', label: 'Đồng bộ nền', default: true, hint: 'Tắt thì không tiến trình nền nào chạy; lượt tay vẫn chạy.' },
        direction: { kind: 'select', label: 'Chiều chạy nền', options: ['read', 'push', 'write'], empty: 'read', hint: 'read = chỉ lấy từ FBM; push = chỉ đẩy lên FBM; write = hai chiều.' },
        heartbeatEnabled: { kind: 'boolean', label: 'Giữ phiên FBM', default: true },
        heartbeatMinutes: { kind: 'number', label: 'Chu kỳ Giữ phiên FBM (phút)', min: 0, max: FbmSync.SCHEDULE_MAX_MINUTES, default: 5 },
        customerFullEnabled: { kind: 'boolean', label: 'Quét nhanh', default: true },
        customerFullMinutes: { kind: 'number', label: 'Chu kỳ Quét nhanh (phút)', min: 0, max: FbmSync.SCHEDULE_MAX_MINUTES, default: 60 },
        activityFullEnabled: { kind: 'boolean', label: 'Lấy toàn bộ giao dịch', default: false },
        activityFullMinutes: { kind: 'number', label: 'Chu kỳ Lấy toàn bộ giao dịch (phút)', min: 0, max: FbmSync.SCHEDULE_MAX_MINUTES, default: 480 },
        detailEnabled: { kind: 'boolean', label: 'Vòng xoay giao dịch', default: false },
        detailMinutes: { kind: 'number', label: 'Chu kỳ Vòng xoay giao dịch (phút)', min: 0, max: FbmSync.SCHEDULE_MAX_MINUTES, default: 30 },
        detailCustomersPerRun: { kind: 'number', label: 'Số khách mỗi lượt vòng xoay', min: 1, default: 30 },
        machineAutoTakeover: { kind: 'boolean', label: 'Tự nhận máy nền', default: false, hint: 'Bật thì máy vừa mở Chrome tự nhận chạy nền khi máy đang được giao im quá ngưỡng tính theo nhịp hỏi GAS và máy này có khóa giải mã mật khẩu FBM.' }
      }
    },
    {
      name: FbmSync.SETTING_SECTIONS.loginPolicy, owner: 'fbm_sync', label: 'Tự đăng nhập FBM',
      fields: {
        enabled: { kind: 'boolean', label: 'Tự đăng nhập', default: true, hint: 'Phiên FBM hết hạn thì GAS cho Extension đăng nhập lại bằng mật khẩu đã lưu.' },
        autoOpenTab: { kind: 'boolean', label: 'Tự mở tab FBM', default: false },
        retryEnabled: { kind: 'boolean', label: 'Tự thử lại khi đăng nhập lỗi', default: true },
        retryMinutes: { kind: 'number', label: 'Chu kỳ tự đăng nhập lại (phút)', min: 1, max: 1440, default: 30 }
      }
    },
    {
      name: FbmSync.SETTING_SECTIONS.pullDefaults, owner: 'fbm_sync', label: 'Ngầm định khi kéo từ FBM',
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

/** Lịch nền dạng theo tiến trình `{ enabled, direction, <tiến trình>: { enabled, minutes, priority }, detail.customersPerRun }` từ giá trị hiệu lực của phần lịch nền (thuần). Thứ tự ưu tiên là luật của code, không phải cài đặt. */
FbmSync.SCHEDULE_PRIORITIES = { customerFull: 10, activityFull: 20, detail: 30, heartbeat: 100 };
FbmSync.scheduleShape = function (values) {
  var shape = { enabled: values.enabled, direction: values.direction };
  FbmSync.SCHEDULE_KINDS.forEach(function (kind) { shape[kind] = { enabled: values[kind + 'Enabled'], minutes: values[kind + 'Minutes'], priority: FbmSync.SCHEDULE_PRIORITIES[kind] }; });
  shape.detail.customersPerRun = values.detailCustomersPerRun;
  return shape;
};

/** Công cụ tính (thuần): số phút máy được giao chạy nền không hỏi GAS thì coi là im. Đi theo "Nhịp hỏi GAS" (giá trị hiệu lực của phần `fbm_extension`) nên không có ô cài đặt riêng; hệ số và khoảng chờ thêm ở `SETTINGS` (`server/config/Settings.js`). */
FbmSync.machineSilentMinutes = function (extension) {
  return extension.pollMinutes * Number(SETTINGS.FBM_MACHINE_SILENT_POLLS) + Number(SETTINGS.FBM_MACHINE_SILENT_EXTRA_MINUTES);
};
