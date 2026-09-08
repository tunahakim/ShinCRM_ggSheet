/** Parser và vị từ bộ lọc hàng 3. Module này không đọc hoặc ghi Spreadsheet. */

function filterFieldType(field) {
  return String(field && field.type || 'TEXT').toUpperCase();
}

function filterText(value) {
  return normalizeText(value === null || value === undefined ? '' : value);
}

function filterNumber(value) {
  if (value === null || value === undefined || value === '') { return null; }
  var n = typeof value === 'number' ? value : Number(String(value).trim());
  return isFinite(n) ? n : null;
}

function filterDateText(value) {
  if (value === null || value === undefined || value === '') { return ''; }
  return String(value).trim();
}

function filterDateValue(raw, now) {
  var text = String(raw || '').trim().toLowerCase();
  var base = now instanceof Date ? new Date(now.getTime()) : new Date();
  var date = new Date(base.getTime());
  if (text === 'today') { return { value: dateTextToday(date), length: 10 }; }
  if (text === 'now') { return { value: dateTextMinute(date), length: 16 }; }
  var relative = /^([+-])(\d+)$/.exec(text);
  if (relative) {
    date.setDate(date.getDate() + (relative[1] === '+' ? 1 : -1) * Number(relative[2]));
    return { value: dateTextToday(date), length: 10 };
  }
  if (!/^\d{4}(?:-\d{2}(?:-\d{2}(?: \d{2}:\d{2})?)?)?$/.test(text)) { return null; }
  var parts = text.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2})(?: (\d{2}):(\d{2}))?)?)?$/);
  var year = Number(parts[1]);
  var month = parts[2] ? Number(parts[2]) : 1;
  var day = parts[3] ? Number(parts[3]) : 1;
  var hour = parts[4] ? Number(parts[4]) : 0;
  var minute = parts[5] ? Number(parts[5]) : 0;
  var check = new Date(year, month - 1, day, hour, minute);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day || check.getHours() !== hour || check.getMinutes() !== minute) { return null; }
  return { value: text, length: text.length };
}

function dateTextToday(date) {
  return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2);
}

function dateTextMinute(date) {
  return dateTextToday(date) + ' ' + ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
}

function filterParseTerm(raw, field, now) {
  var type = filterFieldType(field);
  var text = String(raw || '').trim();
  var negative = false;
  if (text.indexOf('<>') === 0) { negative = true; text = text.slice(2).trim(); }
  if (negative && /^(?:>=|<=|>|<)/.test(text)) { return { error: filterError(field, raw, FILTER_ERROR_MESSAGES.operator, '') }; }

  var quoted = false;
  if (text.charAt(0) === '"' || text.charAt(text.length - 1) === '"') {
    if (text.length < 2 || text.charAt(0) !== '"' || text.charAt(text.length - 1) !== '"') { return { error: filterError(field, raw, FILTER_ERROR_MESSAGES.quoted, '') }; }
    quoted = true;
    text = text.slice(1, -1);
  }
  if (quoted) { return { term: { negative: negative, kind: 'exact', value: type === 'TEXT' || type === 'SELECT' ? filterText(text) : text } }; }

  if ((type === 'NUMBER' || type === 'DATE') && /^.+\s+-\s+.+$/.test(text)) {
    return { error: filterError(field, raw, FILTER_ERROR_MESSAGES.rangeDash, '') };
  }

  var op = /^(>=|<=|>|<)(.*)$/.exec(text);
  if (op) {
    if (type !== 'NUMBER' && type !== 'DATE') { return { error: filterError(field, raw, 'Toán tử so sánh chỉ dùng cho cột số hoặc ngày.', 'Dùng giá trị chữ hoặc nháy kép.') }; }
    var bound = type === 'NUMBER' ? filterNumber(op[2]) : filterDateValue(op[2], now);
    if (bound === null || bound === undefined) { return { error: filterError(field, raw, type === 'NUMBER' ? FILTER_ERROR_MESSAGES.number : FILTER_ERROR_MESSAGES.date, '') }; }
    return { term: { negative: negative, kind: 'compare', op: op[1], value: type === 'DATE' ? bound.value : bound } };
  }

  var range = /^(.+)\.\.(.+)$/.exec(text);
  if (range) {
    if (type !== 'NUMBER' && type !== 'DATE') { return { error: filterError(field, raw, 'Khoảng chỉ dùng cho cột số hoặc ngày.', 'Dùng hai dấu chấm giữa hai giá trị.') }; }
    var left = type === 'NUMBER' ? filterNumber(range[1]) : filterDateValue(range[1], now);
    var right = type === 'NUMBER' ? filterNumber(range[2]) : filterDateValue(range[2], now);
    if (left === null || right === null || left === undefined || right === undefined) { return { error: filterError(field, raw, type === 'NUMBER' ? FILTER_ERROR_MESSAGES.number : FILTER_ERROR_MESSAGES.date, 'Viết hai giá trị hợp lệ ở hai bên dấu ..') }; }
    var lv = type === 'DATE' ? left.value : left;
    var rv = type === 'DATE' ? right.value : right;
    if (lv > rv) { return { error: filterError(field, raw, FILTER_ERROR_MESSAGES.rangeOrder, '') }; }
    return { term: { negative: negative, kind: 'range', from: lv, to: rv, precision: type === 'DATE' ? Math.max(left.length, right.length) : 0 } };
  }

  var wildcard = text.charAt(0) === '*' || text.charAt(text.length - 1) === '*';
  if (type === 'NUMBER' && !wildcard && text !== '') {
    var number = filterNumber(text);
    if (number === null) { return { error: filterError(field, raw, FILTER_ERROR_MESSAGES.number, '') }; }
    return { term: { negative: negative, kind: 'number', value: number } };
  }
  if (type === 'DATE' && !wildcard && text !== '') {
    var date = filterDateValue(text, now);
    if (!date) { return { error: filterError(field, raw, FILTER_ERROR_MESSAGES.date, '') }; }
    return { term: { negative: negative, kind: 'date', value: date.value, precision: date.length } };
  }
  var starts = text.charAt(0) === '*';
  var ends = text.charAt(text.length - 1) === '*';
  var body = text.slice(starts ? 1 : 0, ends ? -1 : undefined);
  return { term: { negative: negative, kind: starts && ends ? 'contains' : starts ? 'suffix' : ends ? 'prefix' : 'contains', value: filterText(body) } };
}

function filterParseCell(raw, field, now) {
  var input = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!input) { return { terms: [], errors: [] }; }
  var terms = [];
  var errors = [];
  input.split(';').forEach(function (part) {
    if (!String(part).trim()) { return; }
    var parsed = filterParseTerm(part, field, now);
    if (parsed.error) { errors.push(parsed.error); }
    else { terms.push(parsed.term); }
  });
  return { terms: terms, errors: errors };
}

function filterCompareText(value, term) {
  var text = filterText(value);
  if (term.kind === 'exact') { return text === term.value; }
  if (term.kind === 'prefix') { return text.indexOf(term.value) === 0; }
  if (term.kind === 'suffix') { return text.slice(-term.value.length) === term.value; }
  return text.indexOf(term.value) !== -1;
}

function filterTermMatches(value, term, field) {
  var type = filterFieldType(field);
  var empty = value === null || value === undefined || value === '';
  var match = false;
  if (term.kind === 'contains' || term.kind === 'exact' || term.kind === 'prefix' || term.kind === 'suffix') {
    match = filterCompareText(value, term);
  } else if (term.kind === 'number') { match = filterNumber(value) === term.value; }
  else if (term.kind === 'date') { match = filterDateText(value).slice(0, term.precision) === term.value.slice(0, term.precision); }
  else if (term.kind === 'compare') {
    var actual = type === 'NUMBER' ? filterNumber(value) : filterDateText(value).slice(0, term.value.length);
    match = actual !== null && actual !== '' && (term.op === '>' ? actual > term.value : term.op === '>=' ? actual >= term.value : term.op === '<' ? actual < term.value : actual <= term.value);
  } else if (term.kind === 'range') {
    var current = type === 'NUMBER' ? filterNumber(value) : filterDateText(value).slice(0, term.precision);
    match = current !== null && current !== '' && current >= term.from && current <= term.to;
  }
  return term.negative ? !match : match;
}

function filterCellMatches(value, parsed, field) {
  if (!parsed || parsed.errors && parsed.errors.length) { return false; }
  var positive = parsed.terms.filter(function (term) { return !term.negative; });
  var negative = parsed.terms.filter(function (term) { return term.negative; });
  return (!positive.length || positive.some(function (term) { return filterTermMatches(value, term, field); })) && negative.every(function (term) { return filterTermMatches(value, term, field); });
}
