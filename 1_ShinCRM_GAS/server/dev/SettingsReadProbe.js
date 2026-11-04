/**
 * Đếm số lần đọc cài đặt, Category và DocumentProperties trong một lời gọi điển hình của đồng bộ FBM (mở màn đồng bộ, kiểm trước lượt đọc, kiểm trước lượt ghi). Chỉ đọc, không mở lượt, không ghi kho.
 *
 * Bọc tạm hàm toàn cục và hàm `FbmSync` bằng bộ đếm rồi trả lại nguyên bản trong `finally`. Mỗi kịch bản xóa bản chụp Sheet trước khi chạy để số đọc Sheet là của riêng kịch bản đó.
 */

var SETTINGS_READ_PROBE_GLOBALS = ['categoryReadAll', 'settingsRead', 'settingsValues', 'settingsDefaultsChecked', 'entityReadAll', 'entityReadAllCombined', 'sheetReadWhole', 'sheetReadTop', 'sheetReadRows', 'sheetReadDataRows', 'sheetReadColumnValues', 'categoryReadColumns', 'documentPropertyJson'];
var SETTINGS_READ_PROBE_FBM = ['loginConfigRead', 'scope', 'readLocal', 'documentPropertyJson', 'stateRead'];

function fbmProbeSettingsReads() {
  var scenarios = {
    status: function () { return FbmSync.statusRead(); },
    preflightRead: function () { return FbmSync.runPreflight({ mode: 'read', scan: 'full' }); },
    preflightWrite: function () { return FbmSync.runPreflight({ mode: 'write', scan: 'full' }); }
  };
  var report = {};
  Object.keys(scenarios).forEach(function (name) { report[name] = settingsReadProbeRun(scenarios[name]); });
  return report;
}

function settingsReadProbeRun(scenario) {
  var counts = {}, restore = [];
  var wrap = function (owner, name, label) {
    var original = owner[name];
    if (typeof original !== 'function') { throw new Error('Hàm dò đọc cài đặt: không còn hàm ' + label + '; sửa danh sách bọc.'); }
    owner[name] = function () { counts[label] = (counts[label] || 0) + 1; return original.apply(this, arguments); };
    restore.push(function () { owner[name] = original; });
  };
  var scope = typeof globalThis !== 'undefined' ? globalThis : this;
  var originalReal = scope.documentStoreReal, realProps = originalReal();
  scope.documentStoreReal = function () {
    return {
      getProperty: function (key) { counts['DP.getProperty'] = (counts['DP.getProperty'] || 0) + 1; return realProps.getProperty(key); },
      getProperties: function () { counts['DP.getProperties'] = (counts['DP.getProperties'] || 0) + 1; return realProps.getProperties(); },
      setProperty: function () { throw new Error('Hàm dò đọc cài đặt không được ghi kho.'); },
      setProperties: function () { throw new Error('Hàm dò đọc cài đặt không được ghi kho.'); },
      deleteProperty: function () { throw new Error('Hàm dò đọc cài đặt không được xóa kho.'); }
    };
  };
  restore.push(function () { scope.documentStoreReal = originalReal; });
  try {
    SETTINGS_READ_PROBE_GLOBALS.forEach(function (name) { wrap(scope, name, name); });
    SETTINGS_READ_PROBE_FBM.forEach(function (name) { wrap(FbmSync, name, 'FbmSync.' + name); });
    // Mỗi nhóm dòng `sheetReadRows` gom là một lệnh getValues thật; đếm nhóm chứ không đếm lần gọi, vì dòng đã có trong bản chụp không tốn lệnh nào.
    var groupsOriginal = scope.sheetRegionsReadGroups;
    scope.sheetRegionsReadGroups = function () { var groups = groupsOriginal.apply(this, arguments); counts['Google.getValues(sheetReadRows)'] = (counts['Google.getValues(sheetReadRows)'] || 0) + groups.length; return groups; };
    restore.push(function () { scope.sheetRegionsReadGroups = groupsOriginal; });
    sheetReadCopyClear();
    var started = Date.now(), result = scenario();
    return { ms: Date.now() - started, ok: result && result.ok, counts: counts };
  } finally {
    restore.reverse().forEach(function (undo) { undo(); });
  }
}
