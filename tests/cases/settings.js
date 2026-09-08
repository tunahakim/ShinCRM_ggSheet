/**
 * Ca kiểm cho `server/config/Settings.js`: hằng phía code, khối tham số hệ thống của `Config`, và công tắc `LOG_TRACE`.
 *
 * Ba chỗ đáng kiểm nhất ở đây đều là chỗ **im lặng khi sai**. Một, đọc `Config` lúc sheet chưa có dòng nào — sheet mới dựng chính là trạng thái đó, và một hàm đọc bảng chỉ hỏng ở ca rỗng thì sẽ hỏng đúng lần chạy đầu tiên. Hai, hai cột của khối tham số không được giả định đứng cạnh nhau. Ba, `logTraceCoversSource` phải trả về `false` khi không đọc được `Config`, vì `true` nghĩa là ghi bí mật ra sheet nguyên văn.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

/**
 * Dựng một hộp cát kèm sheet `Config` giả, gói lại cho gọn phần mà tệp này dùng tới.
 *
 * Chỉ có `Config` trong tệp giả, không có `Log`: tệp này không nói gì về việc ghi log, và một hoàn cảnh dựng nhiều hơn mức cần là một chỗ để hiểu sai nguyên nhân khi nó báo đỏ.
 */
function dungConfig(thamSo, themCot) {
  const nen = dungHop({ sheets: ['Config'], thamSo: thamSo, themCot: themCot });
  return { hop: nen.hop, sheet: nen.Config.sheet, cotGiaTri: nen.Config.cotGiaTri, firstDataRow: nen.Config.firstDataRow };
}

function chay(so) {
  section('Tham số hệ thống — hằng phía code và núm vặn ở sheet Config');

  let nen;
  try {
    nen = dungConfig([]);
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/config/Settings.js', err);
  }

  check(so, 'SETTINGS có đúng mười ba hằng đang được dùng',
    Object.keys(nen.hop.SETTINGS).sort(),
    ['CHUNK_ROWS', 'CHUNK_ROWS_FALLBACK', 'DIRTY_RECORD_LIMIT', 'EXTENSION_ACK_TIMEOUT_MS', 'HANDSHAKE_PING_MS', 'LOCK_WAIT_MS', 'LOG_MAX_ROWS', 'LOG_RETENTION_DAYS', 'LOG_SECRET_KEYS', 'LOG_TRACE_BUFFER', 'SELECTION_POLL_IDLE_MS', 'SELECTION_POLL_MS', 'UNDO_DELAY_MS']);

  check(so, 'giá trị bốn hằng đúng tài liệu 10 Phần 11',
    [nen.hop.SETTINGS.LOG_RETENTION_DAYS, nen.hop.SETTINGS.LOG_MAX_ROWS, nen.hop.SETTINGS.LOG_TRACE_BUFFER, nen.hop.SETTINGS.LOG_SECRET_KEYS.length],
    [30, 5000, 100, 7]);

  // Con số 2.000 là con số đo được trên tệp DEV với 1.700 khách và 10.000 giao dịch giả, hai lượt đo cho cùng một hình dáng
  // chữ U và 2.000 nhanh nhất cả hai lượt. Phép kiểm này ghim nó lại: đổi nó thì phép kiểm đỏ, tức là đổi có chủ ý chứ
  // không phải trôi dần. Đo lại rồi đổi thì sửa cả con số ở đây và bảng số trong docstring của `Settings.js`.
  check(so, 'CHUNK_ROWS là 2.000, con số đo được', nen.hop.SETTINGS.CHUNK_ROWS, 2000);

  // Bậc thang lùi phải nhỏ dần và phải nhỏ hơn cỡ chuẩn, vì cả cơ chế lùi dựa trên đúng một điều: lần thử sau nhẹ hơn lần
  // trước. Một bậc lớn hơn hoặc bằng bậc trước là một vòng thử lại chắc chắn thất bại y như lần đầu.
  const bac = [nen.hop.SETTINGS.CHUNK_ROWS].concat(nen.hop.SETTINGS.CHUNK_ROWS_FALLBACK);
  check(so, 'CHUNK_ROWS_FALLBACK có bậc và nhỏ dần đều',
    [nen.hop.SETTINGS.CHUNK_ROWS_FALLBACK.length > 0, bac.every((so2, i) => i === 0 || so2 < bac[i - 1])],
    [true, true]);

  // Hai con số của chặng lưu. `LOCK_WAIT_MS` bằng đúng con số bản cũ đã chạy thật, nên phép kiểm này ghim nó lại: đổi nó
  // là đổi một thứ chủ dự án đã sống cùng. `UNDO_DELAY_MS` không có tiền lệ nào, nên nó càng cần một chỗ để thấy được.
  check(so, 'hai tham số của chặng lưu có mặt và đúng con số đã chốt',
    [nen.hop.SETTINGS.LOCK_WAIT_MS, nen.hop.SETTINGS.UNDO_DELAY_MS],
    [15000, 5000]);

  check(so, 'Config chưa có dòng nào thì trả về bảng rỗng, không ném lỗi', nen.hop.configParams(), {});
  check(so, 'configGet trả về giá trị thay thế khi không có tham số', nen.hop.configGet('KHONG_CO', 'mặc định'), 'mặc định');
  check(so, 'configGet không truyền giá trị thay thế thì ra chuỗi rỗng', nen.hop.configGet('KHONG_CO'), '');

  const chenCot = dungConfig([['LOG_TRACE', 'fbm_sync'], ['TEN_NGUOI_NHAP', '  Hakim  '], ['SO_DONG', 42]], true);
  check(so, 'đọc đúng tham số dù có một cột lạ chèn vào giữa hàng 1',
    chenCot.hop.configParams(),
    { LOG_TRACE: 'fbm_sync', TEN_NGUOI_NHAP: 'Hakim', SO_DONG: '42' });

  const dongRong = dungConfig([['A', '1'], ['', 'không có tên thì bỏ qua'], ['B', '2']]);
  check(so, 'dòng không có tên tham số thì bỏ qua, không thành khóa rỗng', dongRong.hop.configParams(), { A: '1', B: '2' });

  const trung = dungConfig([['LOG_TRACE', 'core'], ['LOG_TRACE', 'all']]);
  checkThrows(so, 'khai trùng tên tham số thì ném lỗi có nêu tên bị trùng',
    () => trung.hop.configParams(), 'LOG_TRACE');

  // Nhớ tạm là để một lượt chạy không hành xử theo hai luật. Phép kiểm này chứng minh nó thật sự giữ,
  // và `resetSettingsCache` thật sự bỏ — vì một phần nhớ tạm không bỏ được thì phép kiểm sau nó đều đáng ngờ.
  const nhoTam = dungConfig([['LOG_TRACE', 'core']]);
  nhoTam.hop.configParams();
  nhoTam.sheet.getRange(nhoTam.firstDataRow, nhoTam.cotGiaTri).setValue('all');
  check(so, 'sửa ô giữa lượt chạy không đổi câu trả lời của phần nhớ tạm', nhoTam.hop.configGet('LOG_TRACE'), 'core');
  nhoTam.hop.resetSettingsCache();
  check(so, 'resetSettingsCache rồi thì đọc lại thấy giá trị mới', nhoTam.hop.configGet('LOG_TRACE'), 'all');

  const dsNguon = dungConfig([['LOG_TRACE', 'core, FBM_Sync ']]);
  check(so, 'LOG_TRACE là danh sách thì phủ đúng các nguồn có tên, không phân biệt hoa thường và khoảng trắng',
    ['core', 'fbm_sync', 'bot', ''].map((nguon) => dsNguon.hop.logTraceCoversSource(nguon)),
    [true, true, false, false]);

  const tatCa = dungConfig([['LOG_TRACE', ' All ']]);
  check(so, 'LOG_TRACE là "all" thì phủ mọi nguồn', tatCa.hop.logTraceCoversSource('nguồn_chưa_có_tên'), true);

  const oRong = dungConfig([['LOG_TRACE', '']]);
  check(so, 'LOG_TRACE để trống là tắt', oRong.hop.logTraceCoversSource('core'), false);

  const chuaKhai = dungConfig([['TEN_NGUOI_NHAP', 'Hakim']]);
  check(so, 'chưa khai LOG_TRACE thì cũng là tắt', chuaKhai.hop.logTraceCoversSource('core'), false);

  // Chỗ này là chỗ quan trọng nhất của tệp. `logTraceCoversSource` nằm trên đường ghi log: nó ném lỗi thì việc lưu khách chết theo,
  // còn nó đoán sang `true` thì bí mật ra sheet nguyên văn. Nên mất hẳn sheet `Config` phải ra `false` và phải im lặng.
  const khongCoConfig = dungHop({ sheets: [] }).hop;
  check(so, 'mất sheet Config thì logTraceCoversSource trả về false chứ không ném lỗi',
    khongCoConfig.logTraceCoversSource('core'), false);
  checkThrows(so, 'còn configParams thì vẫn ném lỗi để chỗ gọi khác biết sheet hỏng',
    () => khongCoConfig.configParams(), 'Config');

  return so;
}

module.exports = { chay };
