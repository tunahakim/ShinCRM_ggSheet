/* Đọc dữ liệu thô từ live model của Google Sheets trong MAIN world.
 * Sidebar cấp readPlan chỉ gồm tọa độ và giá trị kỳ vọng. Extension không hiểu token
 * hay luật reload; nó chỉ trả hàng 1, kết quả đối chiếu và giá trị tại tọa độ được yêu cầu.
 *
 * Google rút gọn và đổi tên thuộc tính nội bộ sau mỗi lần cập nhật Sheets, kể cả tên biến toàn
 * cục giữ ứng dụng (`trixApp` nay chỉ còn hàm khởi động), nên không gõ cứng đường dẫn nào. Bộ đọc
 * dò từ mọi biến toàn cục: object sheet tự mang gid dạng chuỗi, và lưới của sheet nằm ngay dưới nó
 * với hàng 1 chứa mã cột trong readPlan.
 *
 * Lưới chỉ chứa hàng và cột đang hiện (ẩn tay hay bị bộ lọc giấu đều bị dồn lại), nên chỉ số lưới không
 * phải tọa độ thật. Tọa độ đi qua chính bảng quy đổi Google dùng để vẽ, nhận theo hình dạng: bảng vị trí
 * đang hiện tăng dần cùng mảng đánh dấu dài bằng số thật, khác 0 đúng ở vị trí không hiện, và gid gần nhất
 * là sheet đang mở. Lưới không khớp kích thước hai bảng (bản sao vùng đang hiện cho phần vẽ) bị loại; còn
 * nhiều lưới khớp thì chỉ nhận khi cùng giá trị. Mọi ràng buộc kiểm lại ở mỗi lần đọc; sai là Google đã đổi
 * cấu trúc, bộ đọc dò lại và fail-closed để Sidebar hỏi GAS, vì mở nhầm khách tệ hơn chậm vài giây.
 * Dò chạy từng lát nhỏ để không đứng trang.
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
  // Gid của sheet nằm ngay dưới object chứa bảng quy đổi (đo trên DEV: tầng 1); sâu hơn dễ gặp gid sheet khác.
  var AXIS_GID_DEPTH = 3;
  var AXIS_GID_MAX_NODES = 5000;
  // Mảng dài hơn mức này là dữ liệu (bảng quy đổi, lưới), không chứa gid cần tìm.
  var AXIS_GID_MAX_LIST = 50;

  // Đường dẫn đổi theo sheet đang mở nên nhớ riêng từng gid: `{ grids, axes }`.
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

  function isAscendingIndex(list) {
    if (!list.length) { return false; }
    for (var i = 0; i < list.length; i++) {
      var value = list[i];
      if (typeof value !== 'number' || value < 0 || value !== Math.floor(value) || (i && value <= list[i - 1])) { return false; }
    }
    return true;
  }

  /** Mảng đánh dấu khớp bảng quy đổi khi số ô khác 0 đúng bằng số vị trí không hiện và mọi vị trí đang hiện trỏ vào ô 0. */
  function marksMatch(index, marks) {
    if (marks === index || marks.length < index.length || marks.length <= index[index.length - 1]) { return false; }
    var hidden = 0;
    for (var i = 0; i < marks.length; i++) {
      if (typeof marks[i] !== 'number') { return false; }
      if (marks[i]) { hidden += 1; }
    }
    if (hidden !== marks.length - index.length) { return false; }
    for (var j = 0; j < index.length; j++) {
      if (marks[index[j]] !== 0) { return false; }
    }
    return true;
  }

  /** Bảng quy đổi vị trí đang hiện → vị trí thật của một chiều nằm trong `node`; null khi không có hoặc có hai bảng khác nội dung. */
  function axisOf(node) {
    if (!isNode(node) || Array.isArray(node)) { return null; }
    var lists = ownKeys(node).map(function (key) { return ownValue(node, key); }).filter(Array.isArray);
    if (lists.length < 2) { return null; }
    var found = null;
    for (var i = 0; i < lists.length; i++) {
      if (!isAscendingIndex(lists[i])) { continue; }
      for (var j = 0; j < lists.length; j++) {
        if (!marksMatch(lists[i], lists[j])) { continue; }
        // Sheet một cột không ẩn gì có bảng `[0]` và mảng đánh dấu `[0]` nhận nhau qua lại; cùng nội dung thì cùng phép quy đổi.
        if (found && found.join(',') !== lists[i].join(',')) { return null; }
        found = lists[i];
      }
    }
    return found;
  }

  /**
   * Bảng quy đổi thuộc sheet `gid` khi tầng gần nhất có chuỗi toàn chữ số chỉ chứa đúng gid đó. Một object cha
   * giữ bảng của mọi sheet đã mở nên vị trí trong cây không nói được bảng của ai; gặp chuỗi số khác là không chắc chắn.
   */
  function nearestGidIs(node, gid) {
    var seen = new WeakSet();
    var level = [node];
    var visited = 0;
    for (var depth = 0; depth <= AXIS_GID_DEPTH && level.length; depth++) {
      var digits = [];
      var next = [];
      for (var i = 0; i < level.length && visited < AXIS_GID_MAX_NODES; i++) {
        var current = level[i];
        if (seen.has(current) || (Array.isArray(current) && current.length > AXIS_GID_MAX_LIST)) { continue; }
        seen.add(current);
        visited += 1;
        var keys = ownKeys(current);
        if (keys.length > SEARCH_MAX_KEYS) { continue; }
        for (var j = 0; j < keys.length; j++) {
          var value = ownValue(current, keys[j]);
          if (typeof value === 'string' && /^[0-9]+$/.test(value)) { digits.push(value); }
          else if (isNode(value)) { next.push(value); }
        }
      }
      if (digits.length) { return digits.every(function (value) { return value === gid; }); }
      level = next;
    }
    return false;
  }

  /** Vị trí trong lưới của chỉ số thật; -1 khi vị trí đó đang ẩn hoặc bị lọc. */
  function compactIndex(index, real) {
    var low = 0;
    var high = index.length - 1;
    while (low <= high) {
      var middle = (low + high) >> 1;
      if (index[middle] === real) { return middle; }
      if (index[middle] < real) { low = middle + 1; } else { high = middle - 1; }
    }
    return -1;
  }

  /**
   * Ghép lưới với bảng quy đổi theo kích thước: bảng hàng dài bằng số hàng của lưới, bảng cột dài bằng số ô hàng 1.
   * Mỗi chiều phải có đúng một bảng khớp; số hàng bằng số cột thì không phân được hai bảng nên không nhận.
   */
  function pairAxes(grids, axes) {
    var view = null;
    for (var i = 0; i < grids.length; i++) {
      var head = ownValue(grids[i].grid, '0');
      if (!Array.isArray(head)) { continue; }
      var rowsLength = grids[i].grid.length;
      var rows = axes.filter(function (axis) { return axis.length === rowsLength; });
      var cols = axes.filter(function (axis) { return axis.length === head.length; });
      // Hàng đầu của lưới phải là hàng 1 thật, nếu không hàng mang mã cột đang bị ẩn và lưới khớp chỉ là tình cờ.
      if (rows.length !== 1 || cols.length !== 1 || rows[0] === cols[0] || rows[0][0] !== 0) { continue; }
      if (!view) { view = { rows: rows[0], cols: cols[0], grids: [] }; }
      if (view.rows === rows[0] && view.cols === cols[0]) { view.grids.push(grids[i]); }
    }
    return view;
  }

  /** Bước 1 tìm mọi object mang gid đang mở và mọi bảng quy đổi của sheet đó; bước 2 tìm lưới có hàng 1 chứa mã kỳ vọng ngay dưới các object mang gid. */
  function searchStep() {
    var state = search;
    if (!state) { return; }
    if (state.stage === 'owners') {
      var moreOwners = walkSlice(state.walk, function (item) {
        if (!item.parent) { return false; }
        var gidKey = ownerGidKey(item.node, state.gid);
        if (gidKey) { state.owners.push({ node: item.node, path: pathOf(item), gidKey: gidKey }); }
        if (axisOf(item.node) && nearestGidIs(item.node, state.gid)) { state.axes.push(pathOf(item)); }
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
    // Có lưới mà bảng quy đổi không ghép được vẫn nhớ lưới để báo đúng lỗi, nhưng hoãn dò lại để không quét trang mỗi lần chọn ô.
    if (!state.candidates.length) { failedAt[state.failKey] = Date.now(); return; }
    located[state.gid] = { grids: state.candidates, axes: state.axes };
    if (liveView(liveGridsOf(state.gid, state.codes).grids, state.gid).view) { delete failedAt[state.failKey]; }
    else { failedAt[state.failKey] = Date.now(); }
  }

  function startSearch(codes, gid) {
    if (search || !codes.length || !gid) { return; }
    var failKey = gid + '|' + codes.join('|');
    if (failedAt[failKey] && Date.now() - failedAt[failKey] < SEARCH_RETRY_MS) { return; }
    search = { stage: 'owners', codes: codes, gid: gid, failKey: failKey, walk: newWalk(window, SEARCH_MAX_DEPTH), owners: [], owner: null, gridWalk: null, found: new WeakSet(), candidates: [], axes: [] };
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
   * Có lưới hết hợp lệ (thường do vừa đổi sheet) thì báo `stale` để dò lại trong nền, các lưới còn hợp lệ vẫn đọc tiếp.
   */
  function liveGridsOf(gid, codes) {
    var grids = [];
    var stale = false;
    ((located[gid] || {}).grids || []).forEach(function (candidate) {
      var owner = resolvePath(window, candidate.ownerPath);
      var grid = isNode(owner) && ownValue(owner, candidate.gidKey) === gid ? resolvePath(owner, candidate.gridPath) : null;
      if (!Array.isArray(grid) || (codes.length && headerValueKey(ownValue(grid, '0'), codes) !== candidate.valueKey)) { stale = true; return; }
      grids.push({ grid: grid, valueKey: candidate.valueKey });
    });
    return { grids: grids, stale: stale || !grids.length };
  }

  /**
   * Bảng quy đổi đọc lại từ object chứa ở mỗi lần đọc vì Google thay mảng mới sau mỗi lần ẩn, bỏ ẩn hay lọc.
   * Object chứa không còn bảng hoặc gid gần nhất không còn đúng, hay bảng không ghép được với lưới, đều là Google đã đổi cấu trúc.
   */
  function liveView(grids, gid) {
    var axes = [];
    var stale = false;
    ((located[gid] || {}).axes || []).forEach(function (path) {
      var node = resolvePath(window, path);
      var axis = axisOf(node);
      if (!axis || !nearestGidIs(node, gid)) { stale = true; return; }
      if (axes.indexOf(axis) < 0) { axes.push(axis); }
    });
    var view = pairAxes(grids, axes);
    return { view: view, stale: stale || !view };
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

  /**
   * Ô chỉ có mặt khi ít nhất một lưới giữ giá trị của nó; các lưới cùng giữ mà khác giá trị là `conflict`.
   * Ô thật đang ẩn hoặc bị lọc không có trong lưới nên không có mặt. Lưới ghi ô trống là chuỗi rỗng, nên giá trị
   * `undefined`/`null` nghĩa là lưới này chưa biết ô đó, không phải ô trống.
   */
  function readCell(view, row, column) {
    var result = { present: false, value: '', conflict: false };
    var line = compactIndex(view.rows, row - 1);
    var place = compactIndex(view.cols, column - 1);
    if (line < 0 || place < 0) { return result; }
    view.grids.forEach(function (live) {
      var cells = ownValue(live.grid, String(line));
      var cell = isNode(cells) ? ownValue(cells, String(place)) : undefined;
      var raw = isNode(cell) ? ownValue(cell, live.valueKey) : undefined;
      if (raw === undefined || raw === null) { return; }
      var value = String(raw);
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
    var live = liveGridsOf(reply.gid, codes);
    var axes = live.grids.length ? liveView(live.grids, reply.gid) : { view: null, stale: true };
    if (live.stale || axes.stale) { startSearch(codes, reply.gid); }
    if (!live.grids.length) {
      reply.reason = search ? 'LIVE_GRID_SEARCHING' : 'LIVE_GRID_NOT_FOUND';
      return reply;
    }
    var view = axes.view;
    if (!view) {
      reply.reason = search ? 'LIVE_GRID_SEARCHING' : 'LIVE_AXIS_NOT_FOUND';
      return reply;
    }

    var headers = rowCells(ownValue(view.grids[0].grid, '0')).map(function (item) {
      var value = cellValue(item.cell, view.grids[0].valueKey).trim();
      var column = view.cols[item.index] + 1;
      return value ? { address: columnLetters(column) + '1', column: column, value: value } : null;
    }).filter(Boolean);
    reply.rawHeaderRow = headers;
    reply.complete = true;
    var conflict = false;

    plans.forEach(function (item) {
      var headerAddress = String(item.headerAddress || '');
      var header = addressParts(headerAddress);
      var valueAddress = String(item.valueAddressTemplate || '').replace('{row}', String(reply.row || ''));
      var value = addressParts(valueAddress);
      var headerCell = header ? readCell(view, header.row, header.column) : { present: false, value: '', conflict: false };
      if (headerCell.conflict) { conflict = true; }
      if (!valueAddress) {
        var headerMatched = headerCell.present && headerCell.value.trim() === String(item.expectedValue || '').trim();
        reply.reads.push({ token: String(item.token || ''), headerAddress: headerAddress, expectedValue: String(item.expectedValue || ''), actualValue: headerCell.value, matched: headerMatched, valueAddress: '', value: '', status: headerMatched ? 'ok' : (headerCell.present ? 'mismatch' : 'unavailable') });
        return;
      }
      var valueCell = value && reply.row > 0 ? readCell(view, value.row, value.column) : { present: false, value: '', conflict: false };
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
