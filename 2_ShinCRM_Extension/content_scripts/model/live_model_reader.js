/* Đọc ô từ live model của Google Sheets trong MAIN world.
 * Header được Sidebar truyền vào dưới dạng column hint lấy từ DATA_SCHEMA; Extension không hardcode mã cột.
 * Khi model/header không đọc được, trả trạng thái lỗi thay vì đoán mã khách.
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
      reason: ''
    };

    if (!reply.requestId || !reply.header || reply.row < 1) {
      reply.reason = 'INVALID_REQUEST';
      return reply;
    }

    var grid = liveGrid();
    if (!grid) {
      reply.reason = 'LIVE_GRID_NOT_FOUND';
      return reply;
    }

    var matches = rowCells(grid[0]).filter(function (item) {
      return cellValue(item.cell).trim() === reply.header;
    });
    if (matches.length !== 1) {
      reply.reason = matches.length ? 'DUPLICATE_HEADER' : 'HEADER_NOT_FOUND';
      return reply;
    }

    var column = matches[0].index;
    var row = grid[reply.row - 1];
    var cell = row && row[column];
    if (!cell) {
      reply.reason = 'CELL_NOT_LOADED';
      return reply;
    }

    reply.column = column + 1;
    reply.customerId = cellValue(cell).trim();
    reply.status = reply.customerId ? 'ok' : 'empty';
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
        reason: 'READER_ERROR'
      };
    }
    window.postMessage(reply, location.origin);
  });
}());
