const { napClient, taoHopCat } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('Làm mới bản ghi bẩn — upsert bản ghi máy trả về và bỏ bản ghi đã biến mất');
  let hop;
  try {
    hop = taoHopCat({
      Store: {
        customers: { KH1: { id: 'KH1' }, KH2: { id: 'KH2' } },
        activitiesByCustomer: { KH1: [{ id: 'GD1', customerId: 'KH1' }] },
        upsertRecord(entity, record) { if (entity === 'customer') { this.customers[record.id] = record; } else { (this.activitiesByCustomer[record.customerId] || (this.activitiesByCustomer[record.customerId] = [])).push(record); } },
        removeRecord(entity, id) { if (entity === 'customer') { delete this.customers[id]; } else { Object.keys(this.activitiesByCustomer).forEach((key) => { this.activitiesByCustomer[key] = this.activitiesByCustomer[key].filter((record) => record.id !== id); }); } },
        applyRowMaps(maps) { this.rowMaps = maps; }
      },
      ingestUnpack: (fields, rows) => rows.map((row) => fields.reduce((record, field, i) => { record[field] = row[i]; return record; }, {})),
      renderScreen: () => { hop.rendered = true; }
    });
    napClient(hop, 'client/ram/refresh.html');
  } catch (err) { return ghiLoiNap(so, 'nạp refresh', err); }
  hop.refreshRecordsApply({
    ok: true,
    customer: { fields: ['id'], rows: [['KH1']] },
    activity: { fields: ['id', 'customerId'], rows: [['GD2', 'KH1']] },
    affectedCustomerIds: ['KH1', 'KH2'],
    rowMaps: { Customer: { '4': 'KH1' } }
  }, ['GD2']);
  check(so, 'bản ghi customer còn trên máy chủ được upsert, bản ghi biến mất bị bỏ', [Object.keys(hop.Store.customers), hop.Store.customers.KH1.id, hop.Store.customers.KH2], [['KH1'], 'KH1', undefined]);
  check(so, 'activity mới được upsert và rowMap được thay cùng lượt', [hop.Store.activitiesByCustomer.KH1.length, hop.Store.rowMaps.Customer['4'], hop.rendered], [1, 'KH1', true]);
}

module.exports = { chay };
