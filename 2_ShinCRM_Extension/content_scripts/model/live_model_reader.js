/* Đọc dữ liệu thô từ live model của Google Sheets trong MAIN world.
 * Sidebar cấp readPlan chỉ gồm tọa độ và giá trị kỳ vọng. Extension không hiểu token
 * hay luật reload; nó chỉ trả hàng 1, kết quả đối chiếu và giá trị tại tọa độ được yêu cầu.
 */
(function () {
  var SOURCE = 'SHINCRM_EXTENSION';
  var REQUEST_ACTION = 'CRM_LIVE_MODEL_READ_REQUEST';
  var RESPONSE_ACTION = 'CRM_LIVE_MODEL_READ_RESPONSE';

  function liveGrid() {
    var app = window.trixApp;
    var grid = app && app.Jc && app.Jc.za && app.Jc.za.oa
      && app.Jc.za.oa.oa && app.Jc.za.oa.oa.oa
      && app.Jc.za.oa.oa.oa.xa && app.Jc.za.oa.oa.oa.xa.ma
      && app.Jc.za.oa.oa.oa.xa.ma.ma;
    return grid && (typeof grid === 'object' || typeof grid === 'function') ? grid : null;
  }

  function rowCells(row) {
    if (!row || (typeof row !== 'object' && typeof row !== 'function')) { return []; }
    return Object.keys(row).filter(function (key) {
      return /^[0-9]+$/.test(key);
    }).map(function (key) {
      return { index: Number(key), cell: row[key] };
    }).sort(function (left, right) {
      return left.index - right.index;
    });
  }

  function cellValue(cell) {
    if (!cell || (typeof cell !== 'object' && typeof cell !== 'function')) { return ''; }
    var value = cell.oa;
    return value === null || value === undefined ? '' : String(value);
  }

  function columnLetters(column) {
    var value = Number(column);
    var letters = '';
    while (value > 0) {
      var remainder = (value - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      value = Math.floor((value - 1) / 26);
    }
    return letters;
  }

  function addressParts(address) {
    var match = String(address || '').trim().toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
    if (!match) { return null; }
    var column = 0;
    for (var i = 0; i < match[1].length; i++) { column = column * 26 + match[1].charCodeAt(i) - 64; }
    return { row: Number(match[2]), column: column };
  }

  function readCell(grid, row, column) {
    var line = grid[row - 1];
    var cell = line && line[column - 1];
    return { present: !!cell, value: cellValue(cell) };
  }

  function planForSheet(plan, sheetName) {
    if (!plan || typeof plan !== 'object') { return []; }
    var exact = Array.isArray(plan[sheetName]) ? plan[sheetName] : [];
    if (exact.length) { return exact; }
    return Array.isArray(plan['!']) && String(sheetName || '').indexOf('!') === 0 ? plan['!'] : [];
  }

  function read(request) {
    var reply = {
      action: RESPONSE_ACTION,
      source: SOURCE,
      requestId: String(request.requestId || ''),
      spreadsheetId: String(request.spreadsheetId || ''),
      gid: String(request.gid || ''),
      sheetName: String(request.sheetName || ''),
      row: Number(request.row) || 0,
    header: String(request.header || ''),
    status: 'unavailable',
    customerId: '',
    reason: '',
    complete: false,
    rawHeaderRow: [],
    reads: []
  };

    if (!reply.requestId) {
      reply.reason = 'INVALID_REQUEST';
      return reply;
    }

    var grid = liveGrid();
    if (!grid) {
      reply.reason = 'LIVE_GRID_NOT_FOUND';
      return reply;
    }

    var headers = rowCells(grid[0]).map(function (item) {
      var value = cellValue(item.cell).trim();
      return value ? { address: columnLetters(item.index + 1) + '1', column: item.index + 1, value: value } : null;
    }).filter(Boolean);
    reply.rawHeaderRow = headers;
    reply.complete = true;

    var plans = planForSheet(request.readPlan, reply.sheetName);
    plans.forEach(function (item) {
      var headerAddress = String(item.headerAddress || '');
      var header = addressParts(headerAddress);
      var valueAddress = String(item.valueAddressTemplate || '').replace('{row}', String(reply.row || ''));
      var value = addressParts(valueAddress);
      var headerCell = header ? readCell(grid, header.row, header.column) : { present: false, value: '' };
      if (!valueAddress) {
        var headerMatched = headerCell.present && headerCell.value.trim() === String(item.expectedValue || '').trim();
        reply.reads.push({ token: String(item.token || ''), headerAddress: headerAddress, expectedValue: String(item.expectedValue || ''), actualValue: headerCell.value, matched: headerMatched, valueAddress: '', value: '', status: headerMatched ? 'ok' : (headerCell.present ? 'mismatch' : 'unavailable') });
        return;
      }
      var valueCell = value && reply.row > 0 ? readCell(grid, value.row, value.column) : { present: false, value: '' };
      var matched = headerCell.present && headerCell.value.trim() === String(item.expectedValue || '').trim();
      var status = !header || !value ? 'unavailable' : (!headerCell.present || !valueCell.present ? 'unavailable' : (matched ? 'ok' : 'mismatch'));
      reply.reads.push({
        token: String(item.token || ''),
        headerAddress: headerAddress,
        expectedValue: String(item.expectedValue || ''),
        actualValue: headerCell.value,
        matched: matched,
        valueAddress: valueAddress,
        value: valueCell.value,
        status: status
      });
    });

    if (!plans.length && reply.header && reply.row > 0) {
      var matches = headers.filter(function (item) { return item.value === reply.header; });
      if (matches.length === 1) {
        var legacyValue = readCell(grid, reply.row, matches[0].column);
        reply.column = matches[0].column;
        reply.customerId = legacyValue.value.trim();
        reply.status = legacyValue.present ? (reply.customerId ? 'ok' : 'empty') : 'unavailable';
      } else {
        reply.reason = matches.length ? 'DUPLICATE_HEADER' : 'HEADER_NOT_FOUND';
      }
    } else {
      var first = reply.reads.filter(function (item) { return item.status === 'ok'; })[0];
      if (first) { reply.customerId = String(first.value || '').trim(); reply.status = reply.customerId ? 'ok' : 'empty'; }
      else if (reply.reads.some(function (item) { return item.status === 'mismatch'; })) { reply.status = 'mismatch'; reply.reason = 'READ_PLAN_MISMATCH'; }
      else if (reply.reads.length) { reply.reason = 'READ_PLAN_UNAVAILABLE'; }
      else { reply.status = 'ok'; }
    }
    return reply;
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window || event.origin !== location.origin) { return; }
    var data = event.data;
    if (!data || data.action !== REQUEST_ACTION || data.source !== SOURCE) { return; }

    var reply;
    try {
      reply = read(data);
    } catch (error) {
      reply = {
        action: RESPONSE_ACTION,
        source: SOURCE,
        requestId: String(data.requestId || ''),
        spreadsheetId: String(data.spreadsheetId || ''),
        gid: String(data.gid || ''),
        sheetName: String(data.sheetName || ''),
        row: Number(data.row) || 0,
        header: String(data.header || ''),
        status: 'unavailable',
        customerId: '',
        reason: 'READER_ERROR',
        complete: false,
        rawHeaderRow: [],
        reads: []
      };
    }
    window.postMessage(reply, location.origin);
  });
}());
