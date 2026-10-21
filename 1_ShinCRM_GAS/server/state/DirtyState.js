/**
 * Sổ nhật ký nạp lại: tín hiệu dùng chung cho mọi Sidebar biết dữ liệu kho đã đổi gì. Hợp đồng ở 07A mục 4, tài liệu 07 Phần 2.
 *
 * Sổ chỉ ghi thêm, không có lệnh xóa tín hiệu: mỗi Sidebar tự giữ revision đã thấy và hỏi "có gì đổi sau revision của tôi", nên Sidebar này nạp xong không làm Sidebar khác mất thay đổi. Sống ở DocumentProperties (qua `documentProps()`) vì phải sống giữa các lần gọi và chung cho mọi phiên trên cùng tệp.
 *
 * `viewsStaleRevision` nằm khóa riêng: nó thuộc việc tô và vẽ sheet quản trị, mỗi sheet `!` so với revision đã vẽ của nó (07 Phần 2).
 *
 * Cạm bẫy: không sửa hoặc xóa tay khóa sổ. Sổ hỏng thì mọi lời gọi báo lỗi; xóa tay thì revision về 0 trong khi Sidebar đang mở còn nhớ số lớn hơn và không nạp cho tới khi mở lại.
 */

var RELOAD_JOURNAL_KEY = 'reloadJournal';
var VIEWS_STALE_KEY = 'viewsStaleRevision';
/** Khóa cờ đời trước sổ; chỉ còn dùng cho lần chuyển đổi một lần sang sổ. */
var RELOAD_LEGACY_KEYS = ['dirtyRecords', 'dirtyConfig', 'dirtyAll', 'dirtyCategory', 'dirtySchema', 'dirtyAllCore', 'dirtyEntities', 'reloadRevision', 'reloadChangedAt', 'dirtyRecordRevisionLog'];
var RELOAD_LEGACY_REVISION_KEY = 'reloadRevision';
/** Hai phần mang danh sách mã hoặc `true` (cả sheet); các phần còn lại chỉ là cờ. */
var RELOAD_RECORD_PARTS = ['customer', 'activity'];
var RELOAD_FLAG_PARTS = ['category', 'config', 'core'];

/**
 * Đọc sổ. Chưa có sổ thì trả sổ ảo dựng từ revision đời cũ: `rev = floor = revision cũ + 1`, nên mọi Sidebar đang mở (còn nhớ revision cũ) tụt dưới `floor` và nạp lõi đúng một lần; tệp mới tinh thì từ 0. Sổ ảo chỉ thành thật ở lần ghi đầu.
 */
function reloadJournalRead() {
  var props = documentProps();
  var parsed = documentPropertyJson(props, RELOAD_JOURNAL_KEY, 'sổ nhật ký nạp lại', 'object');
  if (!parsed) {
    var legacy = Number(props.getProperty(RELOAD_LEGACY_REVISION_KEY) || 0);
    var seed = isFinite(legacy) && legacy > 0 ? legacy + 1 : 0;
    return { rev: seed, floor: seed, changedAt: 0, entries: [], stored: false };
  }
  if (!isFinite(Number(parsed.rev)) || !Array.isArray(parsed.entries)) {
    throw new Error('Sổ nhật ký nạp lại (khóa ' + RELOAD_JOURNAL_KEY + ' trong DocumentProperties) bị hỏng nên không biết dữ liệu nào đã đổi. Báo người phát triển; không sửa tay khóa này.');
  }
  return { rev: Number(parsed.rev), floor: Number(parsed.floor) || 0, changedAt: Number(parsed.changedAt) || 0, entries: parsed.entries, stored: true };
}

/** Trạng thái nạp lại gửi kèm mọi phản hồi: chỉ số, không kèm các dòng sổ, để phản hồi không phình theo sổ. */
function reloadStateRead() {
  var journal = reloadJournalRead();
  return {
    revision: journal.rev,
    changedAt: journal.changedAt,
    floor: journal.floor,
    viewsStaleRevision: Number(documentProps().getProperty(VIEWS_STALE_KEY) || 0) || 0
  };
}

/** Một phần mã: quá ngưỡng thì cả sheet, vì một dòng sổ chở nhiều mã sẽ đẩy các dòng khác khỏi giới hạn 9KB của khóa. */
function reloadJournalPartIds(values) {
  var ids = [];
  var seen = {};
  (values || []).forEach(function (value) {
    var id = String(value === null || value === undefined ? '' : value).trim();
    if (id && !seen[id]) { seen[id] = true; ids.push(id); }
  });
  return ids.length > SETTINGS.RELOAD_JOURNAL_PART_IDS ? true : ids;
}

/** Gộp hai mức của một phần mã: cả sheet bao danh sách; hai danh sách gộp lại vẫn theo ngưỡng. */
function reloadJournalMergePart(left, right) {
  if (left === true || right === true) { return true; }
  if (!left && !right) { return null; }
  var merged = reloadJournalPartIds((left || []).concat(right || []));
  return merged === true || merged.length ? merged : null;
}

/** Dòng sổ cho danh sách thay đổi của một lần chạy; phần không đổi thì không có khóa, để dòng ngắn nhất. */
function reloadJournalEntry(mark, revision, now) {
  var entry = { r: revision, t: now };
  RELOAD_RECORD_PARTS.forEach(function (part) {
    var level = mark[part + 'All'] === true ? true : reloadJournalPartIds(mark[part]);
    if (level === true || level.length) { entry[part] = level; }
  });
  RELOAD_FLAG_PARTS.forEach(function (part) { if (mark[part] === true) { entry[part] = true; } });
  return entry;
}

/** Cắt dòng cũ nhất khi vượt số dòng hoặc dung lượng; dòng mới nhất luôn ở lại. `floor` là revision của dòng vừa cắt. */
function reloadJournalTrim(journal) {
  var entries = journal.entries.slice();
  var floor = journal.floor;
  var size = function () { return JSON.stringify({ rev: journal.rev, floor: floor, changedAt: journal.changedAt, entries: entries }).length; };
  while (entries.length > 1 && (entries.length > SETTINGS.RELOAD_JOURNAL_MAX_ENTRIES || size() > SETTINGS.RELOAD_JOURNAL_MAX_BYTES)) {
    floor = Number(entries.shift().r) || floor;
  }
  return { rev: journal.rev, floor: floor, changedAt: journal.changedAt, entries: entries };
}

/** Ghi một dòng sổ cho cả danh sách thay đổi: một lần tăng revision, sổ và mốc view cũ trong một lệnh ghi. Chỉ `recordChangesAfterWrite` gọi, trong khóa tài liệu. Lần ghi đầu của tệp còn cờ đời cũ thì xóa các khóa đó, đúng một lần. */
function reloadJournalAppend(mark) {
  var props = documentProps();
  var journal = reloadJournalRead();
  var revision = journal.rev + 1;
  var now = Date.now();
  var next = reloadJournalTrim({ rev: revision, floor: journal.floor, changedAt: now, entries: journal.entries.concat([reloadJournalEntry(mark, revision, now)]) });
  var values = {};
  values[RELOAD_JOURNAL_KEY] = JSON.stringify(next);
  if (mark.allViews) { values[VIEWS_STALE_KEY] = String(revision); }
  props.setProperties(values);
  if (!journal.stored) {
    RELOAD_LEGACY_KEYS.forEach(function (key) { if (props.getProperty(key) !== null) { props.deleteProperty(key); } });
  }
  return reloadStateRead();
}

/**
 * Danh sách thay đổi chờ ghi nhận của một lần chạy GAS: mọi cửa ghi chỉ thêm dấu vào danh sách, `runEntryPoint` chạy bước ghi nhận thay đổi một lần ở cuối (kể cả khi lần chạy lỗi sau khi đã ghi), nên một lần chạy dù ghi bao nhiêu lần cũng chỉ tăng revision một lần và Sidebar chỉ nạp một lần.
 * Đánh dấu ngoài `runEntryPoint` thì ném lỗi: dấu không có danh sách là dấu không bao giờ được ghi nhận, Sidebar sẽ giữ RAM cũ mà không ai biết.
 * Cạm bẫy: GAS bị cắt ở trần 6 phút thì `finally` không chạy và dấu trong danh sách mất; các lượt chạy dài (đồng bộ FBM) phải tự dừng trước trần như hiện nay.
 */
var PENDING_CHANGES = { depth: 0, mark: null };

function pendingChangesBegin() {
  if (PENDING_CHANGES.depth === 0) { PENDING_CHANGES.mark = null; }
  PENDING_CHANGES.depth += 1;
}

/** Đóng danh sách; lớp ngoài cùng chạy bước ghi nhận thay đổi. Ghi nhận hỏng thì vẫn đóng danh sách rồi ném lỗi để cửa vào ghi Log và báo người dùng. */
function pendingChangesEnd() {
  if (PENDING_CHANGES.depth > 1) { PENDING_CHANGES.depth -= 1; return null; }
  try {
    return recordChangesAfterWrite();
  } finally {
    PENDING_CHANGES.depth = 0;
    PENDING_CHANGES.mark = null;
  }
}

/**
 * Bước ghi nhận thay đổi sau khi ghi: ghi một tín hiệu cho mọi thay đổi đã gom vào sổ nạp lại, rồi tô cam đúng những sheet quản trị vừa từ mới thành cũ. Danh sách rỗng thì không làm gì.
 * Sheet sắp thành cũ lấy từ sổ vẽ view trước khi nâng mốc, nên không quét danh sách tab; không có sheet nào đang mới thì không gọi Sheet lệnh nào.
 * Ngoài cuối lần chạy, chỉ gọi ở chỗ phải đọc kết quả tín hiệu trong cùng lần chạy (trả trạng thái nạp kèm phản hồi lưu, vẽ sheet quản trị theo lệnh trigger); gọi giữa một chuỗi ghi là tách một lần chạy thành nhiều tín hiệu.
 */
function recordChangesAfterWrite() {
  var mark = PENDING_CHANGES.mark;
  if (!mark) { return null; }
  PENDING_CHANGES.mark = null;
  return documentLockRun(function () {
    var turningStale = mark.allViews ? viewLedgerFreshNames() : [];
    // Cờ ô điều khiển không tô cam: người sửa đang đứng ở chính sheet đó và lời hỏi kế tiếp của Sidebar vẽ lại ngay.
    if (mark.viewSheets.length) { viewLedgerMarkControls(mark.viewSheets); }
    var state = reloadJournalAppend(mark);
    viewTabColorSyncNames(turningStale, { fromSidebar: mark.fromSidebar === true });
    return state;
  }, 'Hệ thống bận, chưa ghi được tín hiệu nạp lại cho thay đổi vừa lưu. Bấm Nạp lại để Sidebar thấy dữ liệu mới.');
}

/** Danh sách thay đổi rỗng của một lần chạy: mã theo từng thực thể, cờ cả sheet, cờ cấu hình. */
function dirtyStateBlankMark() {
  return { customer: [], activity: [], customerAll: false, activityAll: false, category: false, config: false, core: false, allViews: false, viewSheets: [], fromSidebar: false };
}

/** Thêm một dấu vào danh sách thay đổi của lần chạy hiện tại. */
function dirtyStateMarkSignal(mark) {
  if (PENDING_CHANGES.depth === 0) {
    throw new Error('Đánh dấu nạp lại ngoài runEntryPoint: không có danh sách thay đổi để ghi nhận, Sidebar sẽ không biết dữ liệu đã đổi. Bọc cửa vào bằng runEntryPoint.');
  }
  var basket = PENDING_CHANGES.mark || dirtyStateBlankMark();
  RELOAD_RECORD_PARTS.concat(['viewSheets']).forEach(function (part) { basket[part] = basket[part].concat(mark[part] || []); });
  ['customerAll', 'activityAll', 'category', 'config', 'core', 'allViews', 'fromSidebar'].forEach(function (key) { if (mark[key] === true) { basket[key] = true; } });
  PENDING_CHANGES.mark = basket;
}

/**
 * Thêm phần signal do ReloadDecision trả về vào danh sách thay đổi; không để từng trigger/cửa ghi tự dựng mark riêng. Không có signal thì không làm gì, vì trigger sửa bộ điều khiển view đi qua đây mỗi lần gõ. `fromSidebar`: lượt ghi do người đứng trước Sidebar bấm, xem `viewTabColorSync`.
 * Mã bản ghi phải kèm thực thể: sổ ghi mức đổi theo từng sheet để chỉ sheet đó nạp lại.
 */
function dirtyStateMarkDecision(decision, fromSidebar) {
  var signal = decision && decision.signal;
  if (!signal) { return false; }
  var records = Array.isArray(signal.records) ? signal.records : [];
  var entities = Array.isArray(signal.entities) ? signal.entities : [];
  var viewSheets = Array.isArray(signal.viewSheets) ? signal.viewSheets : [];
  var hasSignal = records.length || entities.length || viewSheets.length || signal.category || signal.config || signal.schema || signal.allCore || signal.allViews;
  if (!hasSignal) { return false; }
  if (records.length && RELOAD_RECORD_PARTS.indexOf(signal.recordEntity) < 0) {
    throw new Error('Tín hiệu nạp lại có mã bản ghi mà thiếu thực thể (customer/activity): không biết sheet nào cần nạp lại.');
  }
  var mark = dirtyStateBlankMark();
  if (records.length) { mark[signal.recordEntity] = records; }
  entities.forEach(function (entity) { if (RELOAD_RECORD_PARTS.indexOf(entity) >= 0) { mark[entity + 'All'] = true; } });
  mark.category = signal.category === true;
  mark.config = signal.config === true;
  mark.core = signal.schema === true || signal.allCore === true;
  mark.allViews = signal.allViews === true;
  mark.viewSheets = viewSheets;
  mark.fromSidebar = fromSidebar === true;
  dirtyStateMarkSignal(mark);
  return true;
}

/** Phép nghiệm thu chạy được trên Google: in trạng thái sổ trên tệp thật. */
function probeDirtyState() {
  var journal = reloadJournalRead();
  var report = [
    'revision: ' + journal.rev + ' · floor: ' + journal.floor + ' · số dòng sổ: ' + journal.entries.length + ' · sổ đã ghi: ' + journal.stored,
    'viewsStaleRevision: ' + reloadStateRead().viewsStaleRevision + ' · sổ sheet quản trị: ' + JSON.stringify(viewLedgerRead()),
    'dòng cuối: ' + JSON.stringify(journal.entries.slice(-3))
  ];
  report.forEach(function (line) { Logger.log(line); });
  return report;
}
