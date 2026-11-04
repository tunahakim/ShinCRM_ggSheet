/**
 * Ca kiểm cho `server/settings/SettingsMigrate.js`: chuyển một lần sheet `Config` cũ sang cổng cài đặt rồi xóa sheet.
 *
 * Nhánh nguy hiểm nhất là xóa sheet khi chưa chuyển đủ: mất cấu hình của người dùng mà không có gì báo. Nên ca chặn (có vấn đề thì không ghi khóa nào, sheet còn nguyên) được kiểm cùng ca đạt (ghi đủ, đọc lại khớp rồi mới xóa).
 */

const { dungHop, ghiO, TEP_NEN } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

const TEP = TEP_NEN.concat(['fbm_sync/transport/Budget.js', 'fbm_sync/state/FbmSettings.js', 'fbm_sync/state/FbmSettingsMigrate.js', 'fbm_sync/state/PullDefaults.js', 'server/settings/SettingsMigrate.js']);
const MA_CONFIG = ['@CFG_THAM_SO', '@CFG_THAM_SO_GIA_TRI', '@CFG_COT_MA', '@CFG_COT_KIEU', '@CFG_SORT_COL', '@CFG_SORT_LEVEL', '@CFG_NGAM_DINH_MA_COT', '@CFG_NGAM_DINH_GIA_TRI'];

/** Hộp có sheet `Config` đời cũ: `hang` là các dòng theo mã cột, ghi từ hàng 4. */
function dungConfigCu(hang, props) {
  const nen = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'], tep: TEP, props: props });
  const dau = nen.hop.SHEET_LAYOUT.Category.firstDataRow;
  ['Đã xác thực', 'Chưa xác thực'].forEach((v, i) => ghiO(nen, 'Category', dau + i, '@CAT_XAC_THUC', v));
  const sheet = nen.sheet('Config');
  sheet.getRange(1, 1, 1, MA_CONFIG.length).setValues([MA_CONFIG]);
  hang.forEach((dong, i) => Object.keys(dong).forEach((ma) => sheet.getRange(4 + i, MA_CONFIG.indexOf(ma) + 1).setValue(dong[ma])));
  return nen;
}

function khoaCaiDat(nen) {
  return Object.keys(nen.props).filter((k) => k.indexOf('SETTINGS:') === 0).sort();
}

function chay(so) {
  section('Chuyển sheet Config cũ sang cổng cài đặt');

  let nen;
  try {
    nen = dungConfigCu([
      { '@CFG_THAM_SO': 'LOG_TRACE', '@CFG_THAM_SO_GIA_TRI': '', '@CFG_COT_MA': '@CUS_RIENG', '@CFG_COT_KIEU': 'number', '@CFG_SORT_COL': '@CUS_TEN_CTY', '@CFG_SORT_LEVEL': 'Tăng dần (A → Z)', '@CFG_NGAM_DINH_MA_COT': '@CUS_XAC_THUC', '@CFG_NGAM_DINH_GIA_TRI': 'Chưa xác thực' },
      { '@CFG_THAM_SO': 'CELL_BUDGET', '@CFG_THAM_SO_GIA_TRI': '600.000', '@CFG_SORT_COL': '@CUS_MA_KH' },
      { '@CFG_THAM_SO': 'USER_NAME', '@CFG_THAM_SO_GIA_TRI': 'Lan' },
      { '@CFG_THAM_SO': 'FBM_VERIFY_STATUS_DEFAULT', '@CFG_THAM_SO_GIA_TRI': 'Đã xác thực' },
      { '@CFG_THAM_SO': 'ID_COUNTER_CUSTOMER', '@CFG_THAM_SO_GIA_TRI': '17' },
      { '@CFG_THAM_SO': 'FBM_SPREADSHEET_ID', '@CFG_THAM_SO_GIA_TRI': 'abc' }
    ]);
  } catch (err) {
    return ghiLoiNap(so, 'nạp hàm chuyển Config', err);
  }

  const ketQua = nen.hop.settingsMigrateFromConfig();
  check(so, 'chuyển đạt thì xóa sheet Config', [ketQua.ok, nen.sheet('Config')], [true, null]);
  check(so, 'mỗi phần một khóa kho', khoaCaiDat(nen), ['SETTINGS:core_data', 'SETTINGS:core_ops', 'SETTINGS:defaults_fbm_pull', 'SETTINGS:defaults_sidebar']);
  check(so, 'tham số vận hành chuyển đúng, ô LOG_TRACE trống thành tắt, số kiểu người Việt được chuẩn hóa',
    JSON.parse(nen.props['SETTINGS:core_ops']), { LOG_TRACE: 'off', CELL_BUDGET: 600000, USER_NAME: 'Lan' });
  check(so, 'kiểu cột và sắp xếp chuyển đúng, cấp thiếu một vế bị bỏ qua',
    JSON.parse(nen.props['SETTINGS:core_data']), { columnTypes: { '@CUS_RIENG': 'NUMBER' }, sort: [{ col: '@CUS_TEN_CTY', level: 'asc' }] });
  check(so, 'ngầm định chuyển theo thực thể + tên trường; ngầm định kéo FBM vào phần của fbm_sync',
    [JSON.parse(nen.props['SETTINGS:defaults_sidebar']), JSON.parse(nen.props['SETTINGS:defaults_fbm_pull'])],
    [{ values: { customer: { verifyStatus: 'Chưa xác thực' } } }, { values: { customer: { verifyStatus: 'Đã xác thực' } } }]);
  check(so, 'bộ đếm đời cũ được nhận vào kho', nen.hop.idGateCounterValues().customer, 17);
  check(so, 'báo cáo kể tham số bị bỏ', ketQua.report.some((d) => d.indexOf('FBM_SPREADSHEET_ID') >= 0), true);
  check(so, 'chạy lại khi không còn sheet thì không làm gì', nen.hop.settingsMigrateFromConfig().report[0].indexOf('Không còn sheet Config') === 0, true);

  const chan = dungConfigCu([
    { '@CFG_THAM_SO': 'USER_NAME', '@CFG_THAM_SO_GIA_TRI': 'Lan', '@CFG_NGAM_DINH_MA_COT': '@CUS_XAC_THUC', '@CFG_NGAM_DINH_GIA_TRI': 'Không có trong Category' },
    { '@CFG_THAM_SO': 'USER_NAME', '@CFG_THAM_SO_GIA_TRI': 'Hoa' },
    { '@CFG_THAM_SO': 'THAM_SO_LA', '@CFG_THAM_SO_GIA_TRI': '1' },
    { '@CFG_THAM_SO': 'FBM_SYNC_APPROVAL_THRESHOLD', '@CFG_THAM_SO_GIA_TRI': '5' }
  ]);
  let loi = '';
  try { chan.hop.settingsMigrateFromConfig(); } catch (err) { loi = String(err.message); }
  check(so, 'có vấn đề thì không ghi khóa nào và sheet Config còn nguyên', [khoaCaiDat(chan), !!chan.sheet('Config')], [[], true]);
  check(so, 'lời lỗi kể đủ: dòng trùng, tham số lạ, tham số FBM chưa chuyển, ngầm định ngoài Category',
    ['khai hai dòng', 'THAM_SO_LA', 'FBM_SYNC_APPROVAL_THRESHOLD', 'Không có trong Category'].map((t) => loi.indexOf(t) >= 0), [true, true, true, true]);

  const fbmDaLuu = dungConfigCu([{ '@CFG_THAM_SO': 'FBM_SYNC_APPROVAL_THRESHOLD', '@CFG_THAM_SO_GIA_TRI': '5' }], { FBM_SYNC_SETTINGS_V1: '{}' });
  check(so, 'tham số FBM đời cũ chỉ được bỏ qua khi fbm_sync đã lưu cài đặt riêng', fbmDaLuu.hop.settingsMigrateFromConfig().ok, true);

  const hong = dungConfigCu([{ '@CFG_THAM_SO': 'USER_NAME', '@CFG_THAM_SO_GIA_TRI': 'Lan' }], { 'SETTINGS:core_ops': '{hỏng' });
  checkThrows(so, 'kho đang chứa JSON hỏng thì dừng, không ghi đè', () => hong.hop.settingsMigrateFromConfig(), 'hỏng');
  check(so, 'dừng vì kho hỏng thì sheet Config còn nguyên', !!hong.sheet('Config'), true);

  return so;
}

module.exports = { chay };
