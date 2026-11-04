/**
 * Cài đặt đồng bộ FBM qua cổng cài đặt chung: lệnh lưu (ô gửi nguyên chuỗi, GAS kiểm, cả gói hoặc không gì), phạm vi khách chỉ định, xác nhận lịch dày, khóa hỏng có lối đặt về mặc định, hàm chuyển một lần từ khóa kho đời cũ.
 *
 * Nhánh hỏng âm thầm được kiểm kỹ nhất: lưu không đạt mà vẫn ghi một phần, công tắc tổng đổi khi tham số phiên sai, khóa hỏng rơi về mặc định rồi bị lưu đè, hàm chuyển ghi nửa chừng hoặc đè cài đặt mới.
 */
const { section, check } = require('../../lib/assert');
const { dungHop, TEP_NEN } = require('../../lib/dung-hop');
const { trongLanGoi } = require('../../lib/gas/lan-goi');
const { docLog } = require('../../lib/gas/doc-log');

const TEP_LENH_CAI_DAT = ['fbm_sync/state/PullDefaults.js', 'fbm_sync/control/SettingsCommands.js', 'fbm_sync/auth/AutoLogin.js', 'fbm_sync/state/FbmSettingsMigrate.js'];
const KHACH_SHEET = [{ id: 'CUS-020061', fbmCustomerCode: 'ALT00010' }, { id: 'CUS-020062', fbmCustomerCode: '' }];

/** Hộp có cổng cài đặt và phần cài đặt FBM thật; các việc đi kèm (dừng lượt, trạng thái) được thay bằng bản ghi lại thứ tự gọi. */
function dungCaiDatFbm(props) {
  const nen = dungHop({ sheets: ['Log'], props: props, tep: TEP_NEN.concat(TEP_LENH_CAI_DAT) });
  const F = nen.hop.FbmSync, buoc = [];
  F.readLocal = (entity) => (entity === 'customer' ? KHACH_SHEET.map((k) => Object.assign({}, k)) : []);
  F.statusView = () => ({ phase: 'idle' });
  F.stopPendingApply = () => { buoc.push('stop'); };
  F.runStopCommand = (why) => { buoc.push('runStop:' + why); return { code: 'SYNC_DISABLED' }; };
  F.currentSpreadsheetId = () => 'sheet-thu';
  const luu = (patches, confirmLow) => trongLanGoi(nen.hop, () => F.settingsSaveCommand({ patches: patches, confirmLow: confirmLow }));
  const loi = (fn) => { try { trongLanGoi(nen.hop, fn); return 'không ném'; } catch (err) { return err.code; } };
  const dongLog = (hanhDong) => docLog(nen).filter((row) => row.join('|').indexOf(hanhDong) >= 0);
  return { nen, hop: nen.hop, F, buoc, luu, loi, dongLog };
}

function kiemLenhLuu(so) {
  const { nen, F, buoc, luu, loi, dongLog } = dungCaiDatFbm();
  const view = trongLanGoi(nen.hop, () => F.settingsView());
  check(so, 'tệp chưa cấu hình: mỗi phần đọc ra mặc định đã khai (phạm vi giới hạn với danh sách rỗng, nên không quét toàn bộ khách thật), không ghi khóa nào',
    [view.fbm_master, view.fbm_run, view.fbm_extension, view.corrupt, Object.keys(nen.props).filter((k) => k.indexOf('SETTINGS:fbm_') === 0)],
    [{ enabled: true }, { approvalThreshold: 10, scopeLimited: true, scopeCodes: [], requestGapMinSeconds: 0, requestGapMaxSeconds: 0 }, { pollMinutes: 5, runOnStartup: true }, [], []]);

  const byFbm = luu({ fbm_run: { approvalThreshold: '0', scopeCodes: 'ALT00010\nALT00010, ALT00099' } });
  const scopeByFbm = trongLanGoi(nen.hop, () => F.scope());
  luu({ fbm_run: { scopeCodes: 'CUS-020061' } });
  const scopeByShin = trongLanGoi(nen.hop, () => F.scope());
  check(so, 'ô gửi nguyên chuỗi: ngưỡng 0 hợp lệ, danh sách mã tách và bỏ trùng; khách nhập bằng mã FBM hay mã ShinCRM đều vào cả hai chiều',
    [byFbm.ok, byFbm.settings.fbm_run.approvalThreshold, byFbm.settings.fbm_run.scopeCodes, [scopeByFbm.fbm, scopeByFbm.shin], [scopeByShin.fbm, scopeByShin.shin]],
    [true, 0, ['ALT00010', 'ALT00099'], [['ALT00010', 'ALT00099'], ['CUS-020061']], [['ALT00010'], ['CUS-020061']]]);
  check(so, 'lưu danh sách trả kết quả đổi mã từng dòng: mã → khách, mã FBM chưa có trên Sheet',
    byFbm.scopeLines.map((line) => [line.code, line.status, line.customerId]),
    [['ALT00010', 'matched', 'CUS-020061'], ['ALT00099', 'fbm_new', '']]);

  luu({ fbm_run: { approvalThreshold: '' } });
  check(so, 'ô để trống là chưa đặt: kho giữ rỗng, giá trị hiệu lực là mặc định đã khai',
    [JSON.parse(nen.props['SETTINGS:fbm_run']).approvalThreshold, nen.hop.settingsValue('fbm_run', 'approvalThreshold')],
    ['', 10]);

  const truoc = nen.props['SETTINGS:fbm_run'];
  const ngoai = luu({ fbm_run: { requestGapMaxSeconds: '9999' } });
  const hoNho = luu({ fbm_run: { requestGapMinSeconds: '5', requestGapMaxSeconds: '2' } });
  const chu = luu({ fbm_run: { approvalThreshold: 'mười' } });
  check(so, 'giá trị ngoài khoảng, ràng buộc giữa hai trường, chữ ở ô số: trả invalid nêu đúng ô, không ghi gì, có dòng Log',
    [[ngoai.code, ngoai.problems[0].field], hoNho.problems[0].field, chu.problems[0].field, nen.props['SETTINGS:fbm_run'] === truoc, dongLog('settings_save').length],
    [['SETTINGS_INVALID', 'requestGapMaxSeconds'], 'requestGapMaxSeconds', 'approvalThreshold', true, 3]);

  const goiSai = luu({ fbm_run: { approvalThreshold: '-1' }, fbm_master: { enabled: false } });
  check(so, 'lưu tham số phiên kèm công tắc tổng: tham số sai thì công tắc giữ nguyên và không dừng lượt',
    [goiSai.ok, nen.hop.settingsValue('fbm_master', 'enabled'), buoc], [false, true, []]);
  const goiDat = luu({ fbm_run: { approvalThreshold: '4' }, fbm_master: { enabled: false } });
  check(so, 'cả gói đạt thì ghi cả hai và công tắc vừa tắt áp điều kiện dừng ngay, trả cài đặt và trạng thái mới',
    [goiDat.ok, nen.hop.settingsValue('fbm_run', 'approvalThreshold'), nen.hop.settingsValue('fbm_master', 'enabled'), buoc, goiDat.status.phase], [true, 4, false, ['stop'], 'idle']);

  const giu = nen.props['SETTINGS:fbm_run'];
  const thieu = luu({ fbm_run: { scopeCodes: 'ALT00010, CUS-029999' } });
  const nhay = luu({ fbm_run: { scopeCodes: "ALT'1, Mã có dấu" } });
  const nhieu = luu({ fbm_run: { scopeCodes: Array.from({ length: 41 }, (_, i) => 'A' + i).join(',') } });
  check(so, 'mã ShinCRM không có trên Sheet, mã có dấu nháy hay ký tự lạ (đi thẳng vào điều kiện grid FBM), quá 40 mã: từ chối, nêu mã, danh sách đang lưu giữ nguyên',
    [thieu.problems[0].reason.indexOf('CUS-029999') >= 0, nhay.problems[0].field, nhieu.problems[0].field, nen.props['SETTINGS:fbm_run'] === giu],
    [true, 'scopeCodes', 'scopeCodes', true]);

  luu({ fbm_account: { customerPrefix: 'ALT', customerCodeLength: '8' } });
  const logTruoc = dongLog('settings_save').length;
  const lech = luu({ fbm_run: { scopeCodes: 'ALT0010, ALT00099' } });
  check(so, 'mã FBM đúng tiền tố mà khác độ dài đã cài vẫn lưu, dòng đó mang cảnh báo độ dài và Log có một dòng cảnh báo',
    [lech.ok, lech.scopeLines.map((line) => [line.code, line.lengthExpected || 0]), dongLog('settings_save').length - logTruoc], [true, [['ALT0010', 8], ['ALT00099', 0]], 1]);
  const taiKhoanThieu = luu({ fbm_account: { customerCodeLength: '' } });
  check(so, 'tiền tố và độ dài mã khách FBM phải đủ cả hai hoặc trống cả hai',
    [taiKhoanThieu.ok, taiKhoanThieu.problems[0].field],
    [false, 'customerCodeLength']);

  luu({ fbm_run: { scopeLimited: false } });
  check(so, 'bỏ giới hạn thì phạm vi là null (đọc và ghi toàn bộ) dù danh sách còn mã, lưu riêng một trường giữ nguyên trường khác',
    [trongLanGoi(nen.hop, () => F.scope()), nen.hop.settingsValue('fbm_run', 'scopeCodes')], [null, ['ALT0010', 'ALT00099']]);

  const day = luu({ fbm_background: { customerFullMinutes: '5' } });
  const dayKho = nen.props['SETTINGS:fbm_background'];
  const dayDat = luu({ fbm_background: { customerFullMinutes: '5' } }, true);
  check(so, 'lịch nền chạy dày chưa xác nhận thì hỏi lại, chưa ghi; xác nhận rồi mới lưu',
    [day.code, dayKho, dayDat.ok, nen.hop.settingsValue('fbm_background', 'customerFullMinutes')], ['SCHEDULE_LOW_CONFIRM', undefined, true, 5]);

  check(so, 'lệnh lưu chỉ chạm được phần của đồng bộ FBM',
    loi(() => F.settingsSaveCommand({ patches: { core_ops: {} } })),
    'SETTINGS_SECTION_UNKNOWN');
  buoc.length = 0;
  const tat = trongLanGoi(nen.hop, () => F.masterSwitchCommand(false));
  check(so, 'tắt công tắc tổng ghi qua cổng cài đặt rồi đi đúng tiến trình Dừng',
    [tat.ok, nen.hop.settingsValue('fbm_master', 'enabled'), buoc],
    [true, false, ['runStop:master']]);
}

function kiemKhoaHong(so) {
  const { nen, F, luu, loi, dongLog } = dungCaiDatFbm({ 'SETTINGS:fbm_run': '{"approvalThreshold":' });
  const view = trongLanGoi(nen.hop, () => F.settingsView());
  check(so, 'khóa hỏng: phần đó là null kèm dòng lỗi có nút đặt về mặc định, phần khác vẫn đọc được, có dòng Log',
    [view.fbm_run, view.corrupt.map((c) => c.section), view.fbm_master, dongLog('settings_read').length], [null, ['fbm_run'], { enabled: true }, 1]);
  check(so, 'khóa hỏng không rơi về mặc định rồi bị lưu đè: lưu phần đó ném lỗi, khóa giữ nguyên',
    [loi(() => F.settingsSaveCommand({ patches: { fbm_run: { approvalThreshold: '3' } } })), loi(() => F.scope()), nen.props['SETTINGS:fbm_run']], ['DOCUMENT_PROPERTY_CORRUPT', 'DOCUMENT_PROPERTY_CORRUPT', '{"approvalThreshold":']);
  const reset = trongLanGoi(nen.hop, () => F.settingsResetCommand({ section: 'fbm_run' }));
  check(so, 'đặt về mặc định xóa khóa hỏng, trả cài đặt mới không còn lỗi và ghi Log',
    [reset.ok, nen.props['SETTINGS:fbm_run'], reset.settings.fbm_run.approvalThreshold, reset.settings.corrupt, dongLog('settings_reset').length], [true, undefined, 10, [], 1]);
  check(so, 'sau khi đặt lại thì lưu bình thường', luu({ fbm_run: { approvalThreshold: '3' } }).ok, true);
}

const KHOA_CU = {
  FBM_SYNC_ENABLED: 'false',
  FBM_SYNC_SETTINGS_V1: JSON.stringify({ approvalThreshold: 3, scopeLimited: false, scopeCodes: ['ALT00010'], requestGapMinSeconds: 1, requestGapMaxSeconds: 2 }),
  FBM_ACCOUNT_SETTINGS_V1: JSON.stringify({ customerPrefix: 'ALT', customerCodeLength: '8' }),
  FBM_SYNC_EXTENSION_CONFIG_V1: JSON.stringify({ pollMinutes: 7, runOnStartup: false }),
  // Thiếu `activityFull`: code cũ đọc tiến trình thiếu là bật, nên giá trị chuyển sang phải là bật dù mặc định mới là tắt.
  FBM_SYNC_BACKGROUND_SCHEDULE_V1: JSON.stringify({ enabled: false, direction: 'write', heartbeat: { enabled: true, minutes: 5, priority: 100 }, customerFull: { enabled: false, minutes: 90, priority: 10 }, detail: { enabled: true, minutes: 45, priority: 30, customersPerRun: 12 } }),
  FBM_LOGIN_CONFIG_V1: JSON.stringify({ enabled: false, autoOpenTab: true, retryEnabled: true, retryMinutes: 15, credentialRef: 'ref-thu-1234', public: { usernameHint: 'nguoi-dung-thu' }, lastError: '' })
};

function kiemChuyenMotLan(so) {
  const { nen, hop } = dungCaiDatFbm(Object.assign({}, KHOA_CU));
  const kq = hop.fbmSettingsMigrate();
  check(so, 'hàm chuyển: sáu khóa cũ sang sáu phần, giá trị hiệu lực giữ đúng cách code cũ đọc',
    [kq.ok, kq.sources, kq.sections, hop.settingsValues('fbm_master'), hop.settingsValues('fbm_run'), hop.settingsValues('fbm_account'), hop.settingsValues('fbm_extension'), hop.settingsValues('fbm_login_policy')],
    [true, 6, 6, { enabled: false }, { approvalThreshold: 3, scopeLimited: false, scopeCodes: ['ALT00010'], requestGapMinSeconds: 1, requestGapMaxSeconds: 2 }, { customerPrefix: 'ALT', customerCodeLength: 8 }, { pollMinutes: 7, runOnStartup: false }, { enabled: false, autoOpenTab: true, retryEnabled: true, retryMinutes: 15 }]);
  const nen2 = hop.settingsValues('fbm_background');
  check(so, 'lịch nền: tiến trình thiếu trong kho cũ chuyển sang là bật, chu kỳ thiếu lấy mặc định',
    [nen2.enabled, nen2.direction, nen2.customerFullEnabled, nen2.customerFullMinutes, nen2.activityFullEnabled, nen2.activityFullMinutes, nen2.detailMinutes, nen2.detailCustomersPerRun], [false, 'write', false, 90, true, 480, 45, 12]);
  const dangNhap = JSON.parse(nen.props.FBM_LOGIN_CONFIG_V1);
  check(so, 'xóa khóa cũ; cấu hình đăng nhập chỉ bỏ phần chính sách, giữ credential',
    [['FBM_SYNC_ENABLED', 'FBM_SYNC_SETTINGS_V1', 'FBM_ACCOUNT_SETTINGS_V1', 'FBM_SYNC_EXTENSION_CONFIG_V1', 'FBM_SYNC_BACKGROUND_SCHEDULE_V1'].filter((k) => nen.props[k] !== undefined), Object.keys(dangNhap).sort()],
    [[], ['credentialRef', 'lastError', 'public']]);
  check(so, 'chạy lại khi không còn khóa cũ thì báo không có gì để chuyển',
    /không có gì/.test(hop.fbmSettingsMigrate().report[0]),
    true);

  const sai = dungCaiDatFbm(Object.assign({}, KHOA_CU, { FBM_SYNC_EXTENSION_CONFIG_V1: JSON.stringify({ pollMinutes: 99 }) }));
  let loiSai = '';
  try { sai.hop.fbmSettingsMigrate(); } catch (err) { loiSai = err.message; }
  check(so, 'một giá trị cũ không đạt thì không chuyển gì, khóa cũ còn nguyên, lỗi nêu đúng ô',
    [/Nhịp hỏi GAS/.test(loiSai), Object.keys(sai.nen.props).filter((k) => k.indexOf('SETTINGS:fbm_') === 0), sai.nen.props.FBM_SYNC_SETTINGS_V1 === KHOA_CU.FBM_SYNC_SETTINGS_V1], [true, [], true]);

  const daCo = dungCaiDatFbm(Object.assign({}, KHOA_CU, { 'SETTINGS:fbm_run': JSON.stringify({ approvalThreshold: 20 }) }));
  let loiDaCo = '';
  try { daCo.hop.fbmSettingsMigrate(); } catch (err) { loiDaCo = err.message; }
  check(so, 'phần mới đã có giá trị khác thì chặn, không đè cài đặt người dùng vừa đặt ở màn mới',
    [/kho mới đã có/.test(loiDaCo), daCo.nen.props['SETTINGS:fbm_run'], daCo.nen.props.FBM_SYNC_ENABLED], [true, JSON.stringify({ approvalThreshold: 20 }), 'false']);
}

function chay(so) {
  section('FBM sync - cài đặt qua cổng chung');
  kiemLenhLuu(so);
  kiemKhoaHong(so);
  kiemChuyenMotLan(so);
}

module.exports = { chay };
