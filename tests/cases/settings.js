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

  check(so, 'SETTINGS có đúng năm hằng đang được dùng',
    Object.keys(nen.hop.SETTINGS).sort(),
    ['CHUNK_ROWS', 'LOG_MAX_ROWS', 'LOG_RETENTION_DAYS', 'LOG_SECRET_KEYS', 'LOG_TRACE_BUFFER']);

  check(so, 'giá trị bốn hằng đúng tài liệu 10 Phần 11',
    [nen.hop.SETTINGS.LOG_RETENTION_DAYS, nen.hop.SETTINGS.LOG_MAX_ROWS, nen.hop.SETTINGS.LOG_TRACE_BUFFER, nen.hop.SETTINGS.LOG_SECRET_KEYS.length],
    [30, 5000, 100, 7]);

  // `CHUNK_ROWS` là hằng duy nhất trong `SETTINGS` mà tài liệu chỉ cho tên chứ không cho số. Con số 1.000 là con số tạm
  // do phiên code chọn để chặng nạp gói chạy được, và nó đang chờ chủ dự án chốt — chỗ ghi việc chờ đó là `Câu hỏi đêm.md`.
  // Phép kiểm này ghim con số tạm lại: đổi nó thì phép kiểm đỏ, tức là đổi có chủ ý chứ không phải trôi dần.
  check(so, 'CHUNK_ROWS vẫn là con số tạm 1.000 chưa ai chốt lại', nen.hop.SETTINGS.CHUNK_ROWS, 1000);

  // Hai tên này có trong tài liệu nhưng chưa có con số nào được chốt, và chặng đang làm cũng chưa cần tới chúng.
  // Phép kiểm này bắt việc ai đó điền số đoán vào, vì một hằng số trông như đã được quyết định thì không ai đi hỏi lại nữa.
  check(so, 'SETTINGS chưa chứa hai tham số chưa được chốt giá trị',
    ['LOCK_WAIT_MS', 'UNDO_DELAY_MS'].filter((ten) => ten in nen.hop.SETTINGS),
    []);

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
