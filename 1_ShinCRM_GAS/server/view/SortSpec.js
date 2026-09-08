/** Parser và comparator sắp xếp sheet quản trị. */
var SORT_LEVELS = { asc: ['tang', 'tangdan', 'az', 'asc'], desc: ['giam', 'giamdan', 'za', 'desc'] };

function sortSpecLevel(value) {
  var key = normalizeText(value).replace(/[^a-z0-9]/g, '');
  if (SORT_LEVELS.asc.indexOf(key) >= 0 || key.indexOf('tangdan') === 0 || key.indexOf('az') >= 0) { return 'asc'; }
  if (SORT_LEVELS.desc.indexOf(key) >= 0 || key.indexOf('giamdan') === 0 || key.indexOf('za') >= 0) { return 'desc'; }
  return '';
}

function sortSpecParse(levels, fieldByCode) {
  var errors = [];
  var result = [];
  (levels || []).forEach(function (item) {
    var code = String(item && item.col || '').trim();
    var direction = sortSpecLevel(item && item.level);
    if (!code && !item.level) { return; }
    if (!code || !item.level) { return; }
    if (!/^@(?:CUS|ACT)_/.test(code) || !fieldByCode || !fieldByCode[code]) { errors.push('Không tìm thấy cột ' + code + ' trong kho dữ liệu.'); return; }
    if (!direction) { errors.push('Không hiểu chiều sắp xếp "' + item.level + '".'); return; }
    result.push({ code: code, direction: direction, field: fieldByCode[code] });
  });
  return { specs: result, errors: errors };
}

function sortSpecComparator(specs, fieldValues) {
  var list = (specs || []).slice();
  return function (a, b) {
    for (var i = 0; i < list.length; i++) {
      var spec = list[i];
      var av = a[spec.code] === undefined ? fieldValues(a, spec.code) : a[spec.code];
      var bv = b[spec.code] === undefined ? fieldValues(b, spec.code) : b[spec.code];
      var ae = av === null || av === undefined || av === '';
      var be = bv === null || bv === undefined || bv === '';
      if (ae || be) { if (ae !== be) { return ae ? 1 : -1; } continue; }
      var cmp = String(av).localeCompare(String(bv), 'vi');
      if (spec.field && spec.field.type === 'NUMBER') { cmp = Number(av) - Number(bv); }
      if (cmp) { return spec.direction === 'desc' ? -cmp : cmp; }
    }
    return 0;
  };
}
