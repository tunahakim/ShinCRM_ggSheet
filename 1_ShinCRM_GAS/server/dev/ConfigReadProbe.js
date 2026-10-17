/** Probe DEV đo các lần đọc sheet `Config` trong một lượt `loadCore` và `reloadConfig`: thời gian từng đoạn và số lần `configParams` đọc thật (bản nhớ trống lúc vào). */

var CONFIG_READ_PROBE_PARTS = [
  'cellBudgetMeasure', 'cellBudgetCeiling', 'configReadAll', 'configUserParams', 'categoryReadAll', 'entityReadAll', 'entityRowCount',
  'sheetGridReadBlock', 'sheetReadRows', 'readColumnMap', 'resetSettingsCache', 'selectionReadPlan', 'reloadStateRead'
];

function measureConfigReads() {
  var out = [];
  [['loadCore', function () { return loadCore(); }], ['reloadConfig', function () { return reloadConfig(); }]].forEach(function (job) {
    for (var round = 1; round <= 3; round++) {
      var times = {};
      var params = { miss: 0, missMs: 0, hit: 0 };
      var originalParams = configParams;
      configParams = function () {
        if (SETTINGS_CONFIG_CACHE) { params.hit += 1; return originalParams.apply(this, arguments); }
        var started = Date.now();
        try { return originalParams.apply(this, arguments); } finally { params.miss += 1; params.missMs += Date.now() - started; }
      };
      var restore = saveBreakdownProbeWrap(CONFIG_READ_PROBE_PARTS, times);
      var started = Date.now();
      var result;
      try { result = job[1](); } finally { restore(); configParams = originalParams; }
      var line = Object.keys(times).map(function (name) { return name + ' ' + times[name].ms + (times[name].n > 1 ? '×' + times[name].n : ''); }).join(', ');
      out.push(job[0] + ' lượt ' + round + ' (' + (result && result.ok ? 'đạt' : 'KHÔNG ĐẠT') + ', ' + (Date.now() - started) + ' ms): configParams đọc thật ' + params.miss + ' lần ' + params.missMs + ' ms, dùng bản nhớ ' + params.hit + ' lần · ' + line);
    }
  });
  return out;
}
