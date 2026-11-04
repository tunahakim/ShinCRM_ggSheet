/**
 * Ca kiểm cho hằng phía code (`server/config/Settings.js`) và cổng cài đặt (`server/settings/*`): đọc, kiểm, ghi, ngầm định theo kênh nhập và công tắc `LOG_TRACE`.
 *
 * Những chỗ im lặng khi sai được kiểm kỹ nhất: JSON hỏng trong kho phải ném chứ không rơi về rỗng (rơi về rỗng rồi lưu là xóa cài đặt của người dùng); lưu không đạt thì không ghi gì; ngầm định lệch Category thì bị bỏ và có thông báo, không điền giá trị sai; `logTraceCoversSource` đọc lỗi thì trả `false`, vì `true` nghĩa là ghi dữ liệu nhạy cảm ra sheet.
 */

const { dungHop, ghiO } = require('../lib/dung-hop');
const { dongSoCuoi } = require('../lib/load-gas');
const { trongLanGoi } = require('../lib/gas/lan-goi');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

/** Hộp có sheet Category mang các giá trị Xác thực `xacThuc`, và các phần cài đặt đã lưu `caiDat`. */
function dungCaiDat(caiDat, xacThuc) {
  const nen = dungHop({ sheets: ['Category', 'Log'], caiDat: caiDat });
  const dau = nen.hop.SHEET_LAYOUT.Category.firstDataRow;
  (xacThuc || ['Đã xác thực', 'Chưa xác thực']).forEach((giaTri, i) => ghiO(nen, 'Category', dau + i, '@CAT_XAC_THUC', giaTri));
  return nen;
}

function thongBao(hop, topic) {
  return hop.noticeList().filter((n) => n.topic === topic);
}

function chay(so) {
  section('Hằng phía code và cổng cài đặt');

  let nen;
  try { nen = dungCaiDat(); } catch (err) { return ghiLoiNap(so, 'nạp cổng cài đặt', err); }
  const hop = nen.hop;

  check(so, 'SETTINGS có đúng các hằng đang được dùng',
    Object.keys(hop.SETTINGS).sort(),
    ['CHANGE_SIGNAL_DELAYS_MS', 'CHANNEL_ALIVE_RELAY_MS', 'CHANNEL_SILENCE_MS', 'CHUNK_ROWS', 'CHUNK_ROWS_FALLBACK', 'EXTENSION_ACK_TIMEOUT_MS', 'FBM_SCHEDULE_LOW_MINUTES', 'FBM_SCHEDULE_RETRY_BASE_MINUTES', 'FBM_SCHEDULE_RETRY_MAX_MINUTES', 'HANDSHAKE_PING_MS', 'LOCK_WAIT_MS', 'LOG_MAX_ROWS', 'LOG_RETENTION_DAYS', 'LOG_SECRET_KEYS', 'LOG_TRACE_BUFFER', 'NOTICE_CHARS_MAX', 'NOTICE_MAX', 'POSITION_WAKE_MS', 'RELOAD_JOURNAL_MAX_BYTES', 'RELOAD_JOURNAL_MAX_ENTRIES', 'RELOAD_JOURNAL_PART_IDS', 'RELOAD_SAFETY_POLL_DEAD_MS', 'RELOAD_SAFETY_POLL_MS', 'SELECTION_POLL_IDLE_MS', 'SELECTION_POLL_MS', 'SHEET_READ_MERGE_GAP_ROWS', 'SHOW_PROBE_PROGRESS_DEBUG', 'UNDO_DELAY_MS', 'VIEW_FAILED_RETRY_MS', 'VIEW_PROBLEM_MAX_LINES', 'VIEW_STALE_TAB_COLOR']);
  check(so, 'giá trị bốn hằng đúng tài liệu 10 Phần 11',
    [hop.SETTINGS.LOG_RETENTION_DAYS, hop.SETTINGS.LOG_MAX_ROWS, hop.SETTINGS.LOG_TRACE_BUFFER, hop.SETTINGS.LOG_SECRET_KEYS.length],
    [30, 1000, 100, 7]);
  // 2.000 là con số đo được trên tệp DEV 1.700 khách và 10.000 giao dịch giả; đổi thì đo lại và sửa cả docstring của `Settings.js`.
  check(so, 'CHUNK_ROWS là 2.000, con số đo được', hop.SETTINGS.CHUNK_ROWS, 2000);
  const bac = [hop.SETTINGS.CHUNK_ROWS].concat(hop.SETTINGS.CHUNK_ROWS_FALLBACK);
  check(so, 'CHUNK_ROWS_FALLBACK có bậc và nhỏ dần đều',
    [hop.SETTINGS.CHUNK_ROWS_FALLBACK.length > 0, bac.every((x, i) => i === 0 || x < bac[i - 1])],
    [true, true]);
  check(so, 'hai tham số của chặng lưu đúng con số đã chốt',
    [hop.SETTINGS.LOCK_WAIT_MS, hop.SETTINGS.UNDO_DELAY_MS],
    [15000, 5000]);

  // Bảng khai: mỗi module tự khai phần của mình, cổng chỉ gom.
  check(so, 'các phần cài đặt của lõi có mặt, mỗi khóa kho mang tiền tố SETTINGS:',
    hop.settingsSectionList().map((s) => hop.settingsKey(s)), ['SETTINGS:core_ops', 'SETTINGS:core_data', 'SETTINGS:defaults_sidebar']);
  checkThrows(so, 'tên phần lạ là lỗi lập trình, ném ngay', () => hop.settingsSection('khong_co'), 'khong_co');
  hop.SETTINGS_SECTION_PROVIDERS.thu = () => [{ name: 'core_ops', owner: 'thu', label: 'x', fields: {} }];
  checkThrows(so, 'hai module khai trùng tên phần thì ném, không để hai bên tranh một khóa kho', () => hop.settingsSectionList(), 'core_ops');
  delete hop.SETTINGS_SECTION_PROVIDERS.thu;

  check(so, 'chưa lưu gì thì đọc ra giá trị rỗng của từng kiểu',
    [hop.settingsRead(hop.settingsSection('core_ops')), hop.settingsRead(hop.settingsSection('core_data'))],
    [{ LOG_TRACE: 'off', CELL_BUDGET: '', USER_NAME: '' }, { columnTypes: {}, sort: [] }]);

  // Lưu đạt: ghi một khóa, phát tín hiệu nạp lại config qua hậu xử lý chung.
  const luu = trongLanGoi(hop, () => hop.settingsSave('core_ops', { CELL_BUDGET: ' 600.000 ', USER_NAME: '  Lan  ' }));
  check(so, 'lưu đạt thì chuẩn hóa số kiểu người Việt gõ, cắt khoảng trắng, giữ trường không đổi',
    [luu.ok, JSON.parse(nen.props['SETTINGS:core_ops'])], [true, { LOG_TRACE: 'off', CELL_BUDGET: 600000, USER_NAME: 'Lan' }]);
  check(so, 'lưu cài đặt phát tín hiệu nạp lại config', dongSoCuoi(hop).config, true);
  check(so, 'đọc một trường qua settingsValue', hop.settingsValue('core_ops', 'USER_NAME'), 'Lan');

  const truoc = nen.props['SETTINGS:core_ops'];
  const sai = trongLanGoi(hop, () => hop.settingsSave('core_ops', { LOG_TRACE: 'bat', CELL_BUDGET: '0', THUA: 1 }));
  check(so, 'lưu không đạt thì không ghi gì và nêu từng trường hỏng',
    [sai.ok, sai.problems.map((p) => p.field).sort(), nen.props['SETTINGS:core_ops'] === truoc], [false, ['CELL_BUDGET', 'LOG_TRACE', 'THUA'], true]);

  const duLieu = trongLanGoi(hop, () => hop.settingsSave('core_data', {
    columnTypes: { '@CUS_RIENG': 'number', '@CUS_MA_KH': 'TEXT', 'sai ma': 'TEXT' },
    sort: [{ col: '@CUS_MA_KH', level: 'Giảm dần' }]
  }));
  check(so, 'kiểu cột tự thêm không được trùng cột của code hay sai mẫu mã',
    [duLieu.ok, duLieu.problems.map((p) => p.field)],
    [false, ['columnTypes']]);
  const duLieuDat = trongLanGoi(hop, () => hop.settingsSave('core_data', { columnTypes: { '@CUS_RIENG': 'number' }, sort: [{ col: '@CUS_MA_KH', level: 'desc' }] }));
  check(so, 'kiểu cột và sắp xếp đạt thì lưu đã chuẩn hóa',
    [duLieuDat.ok, duLieuDat.values],
    [true, { columnTypes: { '@CUS_RIENG': 'NUMBER' }, sort: [{ col: '@CUS_MA_KH', level: 'desc' }] }]);
  const quaCap = hop.settingsValidate(hop.settingsSection('core_data'), { sort: Array.from({ length: hop.VIEW_SORT_MAX_LEVELS + 1 }, () => ({ col: '@CUS_MA_KH', level: 'asc' })) }, {});
  check(so, 'sắp xếp quá số cấp tối đa thì không đạt', quaCap.ok, false);

  // JSON hỏng: ném chứ không rơi về rỗng.
  const hong = dungCaiDat();
  hong.props['SETTINGS:core_ops'] = '{"LOG_TRACE":';
  checkThrows(so, 'kho chứa JSON hỏng thì đọc ném lỗi, không coi như chưa lưu', () => hong.hop.settingsRead(hong.hop.settingsSection('core_ops')), 'bị hỏng');
  check(so, 'đọc lỗi thì logTraceCoversSource trả false chứ không ném', hong.hop.logTraceCoversSource('core'), false);

  checkThrows(so, 'phần cần Category mà người điều phối không truyền Category thì ném',
    () => hop.settingsValidate(hop.settingsSection('defaults_sidebar'), { values: {} }, {}), 'Category');

  // Ngầm định khi nhập trên Sidebar: kiểm bằng đúng bộ kiểm của cửa ghi.
  const nd = trongLanGoi(hop, () => hop.settingsSave('defaults_sidebar', { values: { customer: { verifyStatus: 'Đã xác thực', note: '' } } }));
  check(so, 'ngầm định có trong Category thì lưu, giá trị rỗng bỏ qua',
    [nd.ok, nd.values],
    [true, { values: { customer: { verifyStatus: 'Đã xác thực' } } }]);
  const ndSai = hop.settingsValidate(hop.settingsSection('defaults_sidebar'), { values: { customer: { verifyStatus: 'Không có', id: 'KH1', bidClosingDate: '2026-01-01', khongCo: 'x' }, la: {} } }, { category: hop.categoryReadAll() });
  check(so, 'ngầm định chặn giá trị ngoài Category, trường máy điền, trường ngày, trường lạ và thực thể lạ',
    [ndSai.ok, ['Không có', 'máy điền', 'Trường ngày', 'khongCo', 'la'].map((t) => ndSai.problems[0].reason.indexOf(t) >= 0)], [false, [true, true, true, true, true]]);

  const tinhToan = Object.keys(hop.DATA_SCHEMA.customer).filter((n) => hop.DATA_SCHEMA.customer[n].default && !hop.DATA_SCHEMA.customer[n].readonly)[0];
  if (tinhToan) {
    const motNguon = hop.settingsDefaultsCheck({ customer: { [tinhToan]: 'x' } }, {}, hop.categoryReadAll());
    check(so, 'trường đã có ngầm định tính toán thì không đặt ngầm định gõ tay (một nguồn ngầm định)',
      motNguon.problems[0].reason.indexOf('một nguồn') >= 0,
      true);
  }

  // Category đổi sau khi lưu: giá trị lệch bị bỏ và có thông báo; khớp lại thì thông báo tự hết.
  const lech = dungCaiDat({ defaults_sidebar: { values: { customer: { verifyStatus: 'Đã xác thực' } } } }, ['Chưa xác thực']);
  const goiLech = trongLanGoi(lech.hop, () => lech.hop.settingsReadAll(lech.hop.categoryReadAll()));
  check(so, 'ngầm định lệch Category thì không điền và phát settings_stale theo tên phần',
    [goiLech.defaults, thongBao(lech.hop, 'settings_stale').map((n) => n.scope)], [{}, ['defaults_sidebar']]);
  ghiO(lech, 'Category', lech.hop.SHEET_LAYOUT.Category.firstDataRow + 1, '@CAT_XAC_THUC', 'Đã xác thực');
  const goiKhop = trongLanGoi(lech.hop, () => lech.hop.settingsReadAll(lech.hop.categoryReadAll()));
  check(so, 'Category khớp lại thì ngầm định điền lại và thông báo tự hết',
    [goiKhop.defaults, thongBao(lech.hop, 'settings_stale').length], [{ customer: { verifyStatus: 'Đã xác thực' } }, 0]);
  check(so, 'gói config giữ hợp đồng cũ cho Sidebar',
    Object.keys(goiKhop).sort(),
    ['counters', 'defaults', 'params', 'sheetSchema', 'sort']);

  // LOG_TRACE: chỉ nhận lựa chọn có sẵn; bật thì có thông báo, tắt thì gỡ.
  const vet = dungCaiDat({ core_ops: { LOG_TRACE: 'core,sidebar' } });
  check(so, 'LOG_TRACE là danh sách thì phủ đúng các nguồn có tên',
    ['core', 'sidebar', 'fbm_sync', ''].map((n) => vet.hop.logTraceCoversSource(n)),
    [true, true, false, false]);
  check(so, 'LOG_TRACE all phủ mọi nguồn',
    dungCaiDat({ core_ops: { LOG_TRACE: 'all' } }).hop.logTraceCoversSource('nguồn_lạ'),
    true);
  check(so, 'chưa lưu LOG_TRACE là tắt', dungCaiDat().hop.logTraceCoversSource('core'), false);
  trongLanGoi(vet.hop, () => vet.hop.settingsReadAll(vet.hop.categoryReadAll()));
  check(so, 'LOG_TRACE đang bật thì phát thông báo log_trace_on', thongBao(vet.hop, 'log_trace_on').length, 1);
  vet.hop.shinLogTraceOff();
  check(so, 'shinLogTraceOff tắt qua cổng lưu và gỡ thông báo',
    [vet.hop.logTraceCoversSource('core'), thongBao(vet.hop, 'log_trace_on').length],
    [false, 0]);

  return so;
}

module.exports = { chay };
