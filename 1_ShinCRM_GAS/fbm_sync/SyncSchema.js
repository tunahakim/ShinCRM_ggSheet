// Apps Script does not guarantee file evaluation order; preserve modules already loaded.
var FbmSync = (typeof FbmSync === 'undefined' || !FbmSync) ? {} : FbmSync;

/** Cột metadata riêng của đồng bộ; lõi chỉ nhận DATA_SCHEMA, không đọc ngược SYNC_SCHEMA. */

/** Cột sync đặt sau cột lõi; Activity giữ ít cột vì mã khách là khóa tra cứu. */
var SYNC_SCHEMA = {

  customer: {
    fbmId: { code: '@CUS_FBM_ID', type: 'TEXT', label: 'FBM ID' },
    fbmCustomerCode: { code: '@CUS_MA_KH_FBM', type: 'TEXT', label: 'Mã khách FBM' },
    fbmHash: { code: '@CUS_HASH_FBM', type: 'TEXT', label: 'Dấu vân FBM' },
    syncStatus: { code: '@CUS_SYNC_TT', type: 'TEXT', label: 'Tình trạng đồng bộ' },
    syncedAt: { code: '@CUS_SYNC_LUC', type: 'DATE', label: 'Đồng bộ lúc', precision: 'minute' }
  },

  activity: {
    fbmId: { code: '@ACT_FBM_ID', type: 'TEXT', label: 'FBM ID' },
    fbmHash: { code: '@ACT_HASH_FBM', type: 'TEXT', label: 'Dấu vân FBM' },
    syncStatus: { code: '@ACT_SYNC_TT', type: 'TEXT', label: 'Tình trạng đồng bộ' }
  }

};

/** Trả danh sách cột sync theo tên sheet, giữ đúng thứ tự hiển thị. */
function syncColumnsForSheet(sheetName) {
  var entity = { Customer: 'customer', Activity: 'activity' }[sheetName];
  if (!entity) { return []; }

  var fields = SYNC_SCHEMA[entity];
  return Object.keys(fields).map(function (fieldName) {
    return [fields[fieldName].code, fields[fieldName].label];
  });
}

/** Gọi bộ dựng cột chung; module này chỉ cung cấp schema, không chạm SpreadsheetApp. */
function fbmEnsureSyncColumns(source) {
  if (typeof ensureColumnsThroughWriteGate !== 'function') {
    throw new Error('Thiếu cửa dựng cột chung; không ghi schema trực tiếp trong module đồng bộ.');
  }
  return ensureColumnsThroughWriteGate(source, syncColumnsForSheet);
}

