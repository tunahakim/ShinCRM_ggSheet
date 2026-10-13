/* Đọc dữ liệu thô từ live model của Google Sheets trong MAIN world.
 * Sidebar cấp readPlan chỉ gồm tọa độ và giá trị kỳ vọng. Extension không hiểu token
 * hay luật reload; nó chỉ trả hàng 1, kết quả đối chiếu và giá trị tại tọa độ được yêu cầu.
 *
 * Google rút gọn và đổi tên thuộc tính nội bộ sau mỗi lần cập nhật Sheets, kể cả tên biến toàn
 * cục giữ ứng dụng (`trixApp` nay chỉ còn hàm khởi động), nên không gõ cứng đường dẫn nào. Bộ đọc
 * dò từ mọi biến toàn cục: object sheet tự mang gid dạng chuỗi, và lưới của sheet nằm ngay dưới nó
 * với hàng 1 chứa mã cột trong readPlan. Google còn giữ bản sao vùng đang hiện cho phần vẽ, đánh số
 * theo hàng thật nhưng thiếu hàng; không chọn bản nào theo phỏng đoán mà đọc ô từ mọi lưới hợp lệ
 * và chỉ nhận khi các lưới có ô đó cho cùng giá trị. Lệch nhau thì fail-closed để Sidebar hỏi GAS,
 * vì mở nhầm khách tệ hơn chậm vài giây. Dò chạy từng lát nhỏ để không đứng trang.
 */
(function () {
  var SOURCE = 'SHINCRM_EXTENSION';
  var REQUEST_ACTION = 'CRM_LIVE_MODEL_READ_REQUEST';
  var RESPONSE_ACTION = 'CRM_LIVE_MODEL_READ_RESPONSE';
  var SEARCH_SLICE_MS = 12;
  var SEARCH_MAX_DEPTH = 14;
  // Lưới nằm cách object mang gid tối đa ba tầng; nới sâu hơn dễ với sang lưới của sheet khác.
  var SEARCH_GRID_DEPTH = 3;
  var SEARCH_MAX_KEYS = 5000;
  var SEARCH_MAX_NODES = 1000000;
  var SEARCH_RETRY_MS = 30000;

  // Đường dẫn đổi theo sheet đang mở nên nhớ riêng từng gid.
  var located = {};
  // Dò hụt hoãn theo cặp gid và bộ mã, vì readPlan nêu cột chưa có không được chặn lượt dò của plan đúng.
  var failedAt = {};
  var search = null;

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
      // Gốc `window` có hàng chục nghìn biến toàn cục; chỉ nút con mới bị chặn để không lạc vào bảng dữ liệu lớn.
      if (keys.length > SEARCH_MAX_KEYS && item.parent) { continue; }
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

  /** Tên thuộc tính đang giữ đúng gid dạng chuỗi; mảng bị loại vì phần tử của nó không phải object sheet. */
  function ownerGidKey(node, gid) {
    if (Array.isArray(node)) { return ''; }
    var keys = ownKeys(node);
    for (var i = 0; i < keys.length; i++) {
      if (ownValue(node, keys[i]) === gid) { return keys[i]; }
    }
    return '';
  }

  /** Bước 1 tìm mọi object mang gid đang mở; bước 2 tìm lưới có hàng 1 chứa mã kỳ vọng ngay dưới chúng. */
  function searchStep() {
    var state = search;
    if (!state) { return; }
    if (state.stage === 'owners') {
      var moreOwners = walkSlice(state.walk, function (item) {
        var gidKey = item.parent ? ownerGidKey(item.node, state.gid) : '';
        if (gidKey) { state.owners.push({ node: item.node, path: pathOf(item), gidKey: gidKey }); }
        return false;
      });
      if (moreOwners) { setTimeout(searchStep, 0); return; }
      state.stage = 'grids';
      state.walk = null;
    }
    for (;;) {
      if (!state.gridWalk) {
        state.owner = state.owners.shift();
        if (!state.owner) { break; }
        state.gridWalk = newWalk(state.owner.node, SEARCH_GRID_DEPTH);
      }
      var moreGrids = walkSlice(state.gridWalk, function (item) {
        if (!Array.isArray(item.node)) { return false; }
        var valueKey = item.parent ? headerValueKey(ownValue(item.node, '0'), state.codes) : '';
        if (valueKey && !state.found.has(item.node)) {
          state.found.add(item.node);
          state.candidates.push({ ownerPath: state.owner.path, gidKey: state.owner.gidKey, gridPath: pathOf(item), valueKey: valueKey });
        }
        return true;
      });
      if (moreGrids) { setTimeout(searchStep, 0); return; }
      state.gridWalk = null;
    }
    search = null;
    // Dò hụt (ví dụ readPlan nêu cột sheet chưa có) không xóa đường đã biết, chỉ hoãn lượt dò kế tiếp.
    if (state.candidates.length) { located[state.gid] = state.candidates; delete failedAt[state.failKey]; }
    else { failedAt[state.failKey] = Date.now(); }
  }

  function startSearch(codes, gid) {
    if (search || !codes.length || !gid) { return; }
    var failKey = gid + '|' + codes.join('|');
    if (failedAt[failKey] && Date.now() - failedAt[failKey] < SEARCH_RETRY_MS) { return; }
    search = { stage: 'owners', codes: codes, gid: gid, failKey: failKey, walk: newWalk(window, SEARCH_MAX_DEPTH), owners: [], owner: null, gridWalk: null, found: new WeakSet(), candidates: [] };
    setTimeout(searchStep, 0);
  }

  function resolvePath(node, path) {
    for (var i = 0; i < path.length; i++) {
      if (!isNode(node)) { return null; }
      node = ownValue(node, path[i]);
    }
    return node;
  }

  /**
   * Lưới đã nhớ chỉ được dùng khi object chứa nó còn mang đúng gid và hàng 1 còn đúng mã kỳ vọng.
   * Có lưới hết hợp lệ (thường do vừa đổi sheet) thì dò lại trong nền, các lưới còn hợp lệ vẫn đọc tiếp.
   */
  function liveGrids(codes, gid) {
    var grids = [];
    var stale = false;
    (located[gid] || []).forEach(function (candidate) {
      var owner = resolvePath(window, candidate.ownerPath);
      var grid = isNode(owner) && ownValue(owner, candidate.gidKey) === gid ? resolvePath(owner, candidate.gridPath) : null;
      if (!Array.isArray(grid) || (codes.length && headerValueKey(ownValue(grid, '0'), codes) !== candidate.valueKey)) { stale = true; return; }
      grids.push({ grid: grid, valueKey: candidate.valueKey });
    });
    if (stale || !grids.length) { startSearch(codes, gid); }
    return grids;
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

  /** Ô chỉ có mặt khi ít nhất một lưới giữ nó; các lưới cùng giữ ô mà khác giá trị là `conflict`. */
  function readCell(grids, row, column) {
    var result = { present: false, value: '', conflict: false };
    grids.forEach(function (live) {
      var line = ownValue(live.grid, String(row - 1));
      var cell = isNode(line) ? ownValue(line, String(column - 1)) : undefined;
      if (!isNode(cell)) { return; }
      var value = cellValue(cell, live.valueKey);
      if (!result.present) { result.present = true; result.value = value; }
      else if (value !== result.value) { result.conflict = true; }
    });
    return result;
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
    var grids = liveGrids(codes, reply.gid);
    if (!grids.length) {
      reply.reason = search ? 'LIVE_GRID_SEARCHING' : 'LIVE_GRID_NOT_FOUND';
      return reply;
    }

    var headers = rowCells(ownValue(grids[0].grid, '0')).map(function (item) {
      var value = cellValue(item.cell, grids[0].valueKey).trim();
      return value ? { address: columnLetters(item.index + 1) + '1', column: item.index + 1, value: value } : null;
    }).filter(Boolean);
    reply.rawHeaderRow = headers;
    reply.complete = true;
    var conflict = false;

    plans.forEach(function (item) {
      var headerAddress = String(item.headerAddress || '');
      var header = addressParts(headerAddress);
      var valueAddress = String(item.valueAddressTemplate || '').replace('{row}', String(reply.row || ''));
      var value = addressParts(valueAddress);
      var headerCell = header ? readCell(grids, header.row, header.column) : { present: false, value: '', conflict: false };
      if (headerCell.conflict) { conflict = true; }
      if (!valueAddress) {
        var headerMatched = headerCell.present && headerCell.value.trim() === String(item.expectedValue || '').trim();
        reply.reads.push({ token: String(item.token || ''), headerAddress: headerAddress, expectedValue: String(item.expectedValue || ''), actualValue: headerCell.value, matched: headerMatched, valueAddress: '', value: '', status: headerMatched ? 'ok' : (headerCell.present ? 'mismatch' : 'unavailable') });
        return;
      }
      var valueCell = value && reply.row > 0 ? readCell(grids, value.row, value.column) : { present: false, value: '', conflict: false };
      if (valueCell.conflict) { conflict = true; }
      var matched = headerCell.present && headerCell.value.trim() === String(item.expectedValue || '').trim();
      var status = !header || !value ? 'unavailable' : (!headerCell.present || !valueCell.present || valueCell.conflict ? 'unavailable' : (matched ? 'ok' : 'mismatch'));
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

    if (conflict) { reply.status = 'unavailable'; reply.reason = 'LIVE_GRID_CONFLICT'; }
    else if (reply.reads.some(function (item) { return item.status === 'mismatch'; })) { reply.status = 'mismatch'; reply.reason = 'READ_PLAN_MISMATCH'; }
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
