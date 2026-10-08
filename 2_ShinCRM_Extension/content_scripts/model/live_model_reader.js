/* Đọc dữ liệu thô từ live model của Google Sheets trong MAIN world.
 * Sidebar cấp readPlan chỉ gồm tọa độ và giá trị kỳ vọng. Extension không hiểu token
 * hay luật reload; nó chỉ trả hàng 1, kết quả đối chiếu và giá trị tại tọa độ được yêu cầu.
 *
 * Tên thuộc tính trong `trixApp` do Google rút gọn và đổi sau mỗi lần cập nhật Sheets, nên
 * không gõ cứng đường dẫn. Google giữ lưới của từng sheet đã mở trong một bảng khóa theo gid;
 * bộ đọc dò bảng đó, nhớ đường dẫn dưới dạng mẫu có chỗ trống cho gid và tên thuộc tính giá trị
 * ô, rồi mỗi lần đọc thì điền gid của sheet đang mở. Nhờ vậy không thể đọc nhầm lưới của sheet
 * khác dù lưới đó cũng có cột mã khách. Dò chạy từng lát nhỏ để không đứng trang; trong lúc dò,
 * mọi phép đọc trả `unavailable` để Sidebar hỏi GAS.
 */
(function () {
  var SOURCE = 'SHINCRM_EXTENSION';
  var REQUEST_ACTION = 'CRM_LIVE_MODEL_READ_REQUEST';
  var RESPONSE_ACTION = 'CRM_LIVE_MODEL_READ_RESPONSE';
  var GID_SLOT = {};
  var SEARCH_SLICE_MS = 12;
  var SEARCH_MAX_DEPTH = 14;
  var SEARCH_GRID_DEPTH = 8;
  var SEARCH_MAX_KEYS = 5000;
  var SEARCH_MAX_NODES = 1000000;
  var SEARCH_RETRY_MS = 30000;

  var located = null;
  var search = null;
  var searchFailedAt = 0;

  /** Chỉ lấy thuộc tính dữ liệu; không gọi getter của Google để phép dò không có tác dụng phụ. */
  function ownValue(object, key) {
    var descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(object, key); } catch (error) { return undefined; }
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
  }

  function isNode(value) {
    return !!value && (typeof value === 'object' || typeof value === 'function');
  }

  function ownKeys(node) {
    try { return Object.keys(node); } catch (error) { return []; }
  }

  function rowCells(row) {
    if (!isNode(row)) { return []; }
    return ownKeys(row).filter(function (key) {
      return /^[0-9]+$/.test(key);
    }).map(function (key) {
      return { index: Number(key), cell: ownValue(row, key) };
    }).sort(function (left, right) {
      return left.index - right.index;
    });
  }

  /** Tên thuộc tính đang chứa một trong các mã kỳ vọng ở hàng 1; rỗng khi hàng 1 không có mã nào. */
  function headerValueKey(row, codes) {
    var cells = rowCells(row);
    for (var i = 0; i < cells.length; i++) {
      if (!isNode(cells[i].cell)) { continue; }
      var keys = ownKeys(cells[i].cell);
      for (var j = 0; j < keys.length; j++) {
        var value = ownValue(cells[i].cell, keys[j]);
        if (typeof value === 'string' && codes.indexOf(value.trim()) >= 0) { return keys[j]; }
      }
    }
    return '';
  }

  function pathOf(item) {
    var path = [];
    for (var step = item; step && step.parent; step = step.parent) { path.unshift(step.key); }
    return path;
  }

  /** Duyệt theo chiều rộng từng lát; `visit` trả true khi muốn dừng nhánh hiện tại. */
  function walkSlice(walk, visit) {
    var stopAt = Date.now() + SEARCH_SLICE_MS;
    while (walk.next < walk.queue.length && walk.visited < SEARCH_MAX_NODES && Date.now() < stopAt) {
      var item = walk.queue[walk.next];
      walk.queue[walk.next] = null;
      walk.next += 1;
      if (walk.seen.has(item.node)) { continue; }
      walk.seen.add(item.node);
      walk.visited += 1;
      if (visit(item) || item.depth >= walk.maxDepth) { continue; }
      var keys = ownKeys(item.node);
      if (keys.length > SEARCH_MAX_KEYS) { continue; }
      for (var i = 0; i < keys.length; i++) {
        var child = ownValue(item.node, keys[i]);
        if (isNode(child)) { walk.queue.push({ node: child, key: keys[i], parent: item, depth: item.depth + 1 }); }
      }
    }
    return walk.next < walk.queue.length && walk.visited < SEARCH_MAX_NODES;
  }

  function newWalk(root, maxDepth) {
    return { queue: [{ node: root, key: '', parent: null, depth: 0 }], next: 0, seen: new WeakSet(), visited: 0, maxDepth: maxDepth };
  }

  /**
   * Bước 1 tìm mọi object (không phải mảng) có khóa đúng gid đang mở; bước 2 tìm lưới có hàng 1
   * chứa mã kỳ vọng bên dưới khóa đó. Loại mảng vì gid `0` trùng với chỉ số phần tử đầu của mọi mảng.
   */
  function searchStep() {
    var state = search;
    if (!state) { return; }
    if (state.stage === 'maps') {
      var moreMaps = walkSlice(state.walk, function (item) {
        if (!Array.isArray(item.node) && isNode(ownValue(item.node, state.gid))) { state.maps.push(pathOf(item)); }
        return false;
      });
      if (moreMaps) { setTimeout(searchStep, 0); return; }
      state.stage = 'grids';
      state.walk = null;
    }
    for (;;) {
      if (!state.gridWalk) {
        var mapPath = state.maps.shift();
        if (!mapPath) { break; }
        var root = resolvePath(mapPath.concat(GID_SLOT), state.gid);
        if (!isNode(root)) { continue; }
        state.mapPath = mapPath;
        state.gridWalk = newWalk(root, SEARCH_GRID_DEPTH);
      }
      var moreGrids = walkSlice(state.gridWalk, function (item) {
        if (!Array.isArray(item.node)) { return false; }
        var valueKey = headerValueKey(ownValue(item.node, '0'), state.codes);
        if (valueKey) { state.candidates.push({ path: state.mapPath.concat([GID_SLOT], pathOf(item)), valueKey: valueKey, length: item.node.length }); }
        return true;
      });
      if (moreGrids) { setTimeout(searchStep, 0); return; }
      state.gridWalk = null;
    }
    search = null;
    // Lưới đầy đủ dài bằng số hàng của sheet; các bản sao chỉ chứa vùng đang hiện thì ngắn hơn.
    var best = state.candidates.sort(function (left, right) { return right.length - left.length; })[0];
    if (best) { located = { path: best.path, valueKey: best.valueKey }; }
    else { searchFailedAt = Date.now(); }
  }

  function startSearch(codes, gid) {
    if (search || !codes.length || !gid || !isNode(window.trixApp)) { return; }
    if (searchFailedAt && Date.now() - searchFailedAt < SEARCH_RETRY_MS) { return; }
    search = { stage: 'maps', codes: codes, gid: gid, walk: newWalk(window.trixApp, SEARCH_MAX_DEPTH), maps: [], mapPath: null, gridWalk: null, candidates: [] };
    setTimeout(searchStep, 0);
  }

  function resolvePath(path, gid) {
    var node = window.trixApp;
    for (var i = 0; i < path.length; i++) {
      if (!isNode(node)) { return null; }
      node = ownValue(node, path[i] === GID_SLOT ? gid : path[i]);
    }
    return node;
  }

  /**
   * Lưới đã nhớ chỉ được dùng khi hàng 1 còn chứa mã kỳ vọng; lệch thì dò lại nhưng vẫn giữ đường cũ,
   * vì một sheet thiếu cột mã không được làm hỏng phép đọc của các sheet khác.
   */
  function liveGrid(codes, gid) {
    if (located && gid) {
      var grid = resolvePath(located.path, gid);
      if (Array.isArray(grid) && (!codes.length || headerValueKey(ownValue(grid, '0'), codes) === located.valueKey)) {
        return { grid: grid, valueKey: located.valueKey };
      }
    }
    startSearch(codes, gid);
    return null;
  }

  function cellValue(cell, valueKey) {
    if (!isNode(cell)) { return ''; }
    var value = ownValue(cell, valueKey);
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

  function readCell(live, row, column) {
    var line = ownValue(live.grid, String(row - 1));
    var cell = isNode(line) ? ownValue(line, String(column - 1)) : undefined;
    return { present: isNode(cell), value: cellValue(cell, live.valueKey) };
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
      status: 'unavailable',
      reason: '',
      complete: false,
      rawHeaderRow: [],
      reads: []
    };

    if (!reply.requestId) {
      reply.reason = 'INVALID_REQUEST';
      return reply;
    }

    var plans = planForSheet(request.readPlan, reply.sheetName);
    var codes = plans.map(function (item) { return String(item.expectedValue || '').trim(); }).filter(Boolean);
    var live = liveGrid(codes, reply.gid);
    if (!live) {
      reply.reason = search ? 'LIVE_GRID_SEARCHING' : 'LIVE_GRID_NOT_FOUND';
      return reply;
    }

    var headers = rowCells(ownValue(live.grid, '0')).map(function (item) {
      var value = cellValue(item.cell, live.valueKey).trim();
      return value ? { address: columnLetters(item.index + 1) + '1', column: item.index + 1, value: value } : null;
    }).filter(Boolean);
    reply.rawHeaderRow = headers;
    reply.complete = true;

    plans.forEach(function (item) {
      var headerAddress = String(item.headerAddress || '');
      var header = addressParts(headerAddress);
      var valueAddress = String(item.valueAddressTemplate || '').replace('{row}', String(reply.row || ''));
      var value = addressParts(valueAddress);
      var headerCell = header ? readCell(live, header.row, header.column) : { present: false, value: '' };
      if (!valueAddress) {
        var headerMatched = headerCell.present && headerCell.value.trim() === String(item.expectedValue || '').trim();
        reply.reads.push({ token: String(item.token || ''), headerAddress: headerAddress, expectedValue: String(item.expectedValue || ''), actualValue: headerCell.value, matched: headerMatched, valueAddress: '', value: '', status: headerMatched ? 'ok' : (headerCell.present ? 'mismatch' : 'unavailable') });
        return;
      }
      var valueCell = value && reply.row > 0 ? readCell(live, value.row, value.column) : { present: false, value: '' };
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

    if (reply.reads.some(function (item) { return item.status === 'mismatch'; })) { reply.status = 'mismatch'; reply.reason = 'READ_PLAN_MISMATCH'; }
    else if (reply.reads.some(function (item) { return item.status === 'unavailable'; })) { reply.status = 'unavailable'; reply.reason = 'READ_PLAN_UNAVAILABLE'; }
    else { reply.status = 'ok'; }
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
        status: 'unavailable',
        reason: 'READER_ERROR',
        complete: false,
        rawHeaderRow: [],
        reads: []
      };
    }
    window.postMessage(reply, location.origin);
  });
}());
