const { napClient, taoHopCat } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

async function chay(so) {
  section('Làm mới bản ghi bẩn — upsert bản ghi máy trả về và bỏ bản ghi đã biến mất');
  let hop;
  try {
    hop = taoHopCat({
      Store: {
        customers: { KH1: { id: 'KH1' }, KH2: { id: 'KH2' } },
        activitiesByCustomer: { KH1: [{ id: 'GD1', customerId: 'KH1' }] },
        upsertRecord(entity, record) { if (entity === 'customer') { this.customers[record.id] = record; } else { (this.activitiesByCustomer[record.customerId] || (this.activitiesByCustomer[record.customerId] = [])).push(record); } },
        removeRecord(entity, id) { if (entity === 'customer') { delete this.customers[id]; } else { Object.keys(this.activitiesByCustomer).forEach((key) => { this.activitiesByCustomer[key] = this.activitiesByCustomer[key].filter((record) => record.id !== id); }); } },
      },
      ingestUnpack: (fields, rows) => rows.map((row) => fields.reduce((record, field, i) => { record[field] = row[i]; return record; }, {})),
      ScreenState: { screen: 'view', currentCustomerId: 'KH1', formStack: [] },
      SCREEN_VIEW: 'view',
      screenViewDropStale: () => null,
      screenViewRender: () => { hop.rendered = true; return {}; }
    });
    napClient(hop, 'client/ram/refresh.html');
  } catch (err) { return ghiLoiNap(so, 'nạp refresh', err); }
  hop.refreshRecordsApply({
    ok: true,
    customer: { fields: ['id'], rows: [['KH1']] },
    activity: { fields: ['id', 'customerId'], rows: [['GD2', 'KH1']] },
    affectedCustomerIds: ['KH1', 'KH2'],
  }, ['GD2']);
  check(so, 'bản ghi customer còn trên máy chủ được upsert, bản ghi biến mất bị bỏ', [Object.keys(hop.Store.customers), hop.Store.customers.KH1.id, hop.Store.customers.KH2], [['KH1'], 'KH1', undefined]);
  check(so, 'activity mới được upsert và màn hình được vẽ lại cùng lượt', [hop.Store.activitiesByCustomer.KH1.length, hop.rendered], [1, true]);

  hop.Store.categories = { leadSource: ['Cũ'] };
  hop.refreshCategoryApply({ ok: true, categories: { leadSource: ['Mới'] } });
  check(so, 'Category reload thay nguyên bảng danh mục và vẽ lại màn hiện tại',
    [hop.Store.categories, hop.rendered], [{ leadSource: ['Mới'] }, true]);

  hop.Store.customers.KH3 = { id: 'KH3' };
  hop.Store.activitiesByCustomer.KH1.push({ id: 'GD3', customerId: 'KH1' });
  hop.refreshRecordsApply({
    ok: true,
    customer: { fields: ['id'], rows: [] },
    activity: { fields: ['id', 'customerId'], rows: [] },
    affectedCustomerIds: ['KH3'],
    removedRecordIds: ['GD3', 'KH3']
  }, ['GD3', 'KH3']);
  check(so, 'mã Customer/Activity biến mất được remove trực tiếp bằng removedRecordIds',
    [hop.Store.customers.KH3, hop.Store.activitiesByCustomer.KH1.some((record) => record.id === 'GD3')],
    [undefined, false]);

  let counterHop;
  try {
    counterHop = taoHopCat({
      Store: { config: { counters: { customer: 12, activity: 34 } }, customers: {}, activitiesByCustomer: {}, upsertRecord(entity, record) { this.customers[record.id] = record; }, removeRecord() {} },
      ingestUnpack: (fields, rows) => rows.map((row) => fields.reduce((record, field, i) => { record[field] = row[i]; return record; }, {})),
      ScreenState: { screen: 'view', currentCustomerId: '', formStack: [] },
      SCREEN_VIEW: 'view',
      screenViewDropStale: () => null,
      screenViewRender: () => ({})
    });
    napClient(counterHop, 'client/ram/refresh.html');
    napClient(counterHop, 'client/schema/fieldLogic.html');
    napClient(counterHop, 'client/save/saveFlow.html');
  } catch (err) { return ghiLoiNap(so, 'nạp refresh + saveFlow + fieldLogic', err); }
  const truocLuu = counterHop.fieldLogicNextCode('customer', 'CUS-');
  counterHop.saveFlowApply('customer', { fields: ['id'], rows: [['CUS-000013']], counters: { customer: 13, activity: 34 } });
  const sauLuu = counterHop.fieldLogicNextCode('customer', 'CUS-');
  counterHop.refreshReloadPayload({ mode: 'records', customer: { fields: ['id'], rows: [['CUS-000014']] }, activity: { fields: ['id', 'customerId'], rows: [] }, affectedCustomerIds: ['CUS-000014'], counters: { customer: 14, activity: 34 } });
  check(so, 'mã xem trước trên form khách mới tăng đúng một bậc sau phản hồi lưu và sau payload reloadRecords',
    [truocLuu, sauLuu, counterHop.fieldLogicNextCode('customer', 'CUS-'), counterHop.fieldLogicNextCode('activity', 'ACT-')],
    ['CUS-000013', 'CUS-000014', 'CUS-000015', 'ACT-000035']);

  const entityHop = taoHopCat({
    Store: {
      customers: { KH1: { id: 'KH1' }, KH2: { id: 'KH2' } },
      activitiesByCustomer: { KH1: [{ id: 'GD1', customerId: 'KH1' }], KH2: [{ id: 'GD2', customerId: 'KH2' }] },
      upsertRecord(entity, record) {
        if (entity === 'customer') { this.customers[record.id] = record; return; }
        var list = this.activitiesByCustomer[record.customerId] || (this.activitiesByCustomer[record.customerId] = []);
        var at = list.findIndex((item) => item.id === record.id);
        if (at >= 0) { list[at] = record; } else { list.push(record); }
      },
      removeRecord(entity, id) {
        if (entity === 'customer') { delete this.customers[id]; delete this.activitiesByCustomer[id]; return; }
        Object.keys(this.activitiesByCustomer).forEach((key) => { this.activitiesByCustomer[key] = this.activitiesByCustomer[key].filter((record) => record.id !== id); });
      }
    },
    ingestUnpack: (fields, rows) => rows.map((row) => fields.reduce((record, field, i) => { record[field] = row[i]; return record; }, {})),
    ScreenState: { screen: 'view', currentCustomerId: 'KH1', formStack: [] },
    SCREEN_VIEW: 'view',
    screenViewDropStale: () => null,
    screenViewRender: () => { entityHop.rendered = true; return {}; }
  });
  napClient(entityHop, 'client/ram/refresh.html');
  entityHop.refreshEntityApply('customer', {
    ok: true,
    customer: { fields: ['id', 'companyName'], rows: [['KH1', 'Tên mới']] }
  });
  check(so, 'nạp thủ công Customer thay toàn bộ bản ghi và dọn bản ghi cũ qua cửa Store',
    [Object.keys(entityHop.Store.customers), entityHop.Store.customers.KH1.companyName, entityHop.Store.customers.KH2, entityHop.Store.activitiesByCustomer.KH2],
    [['KH1'], 'Tên mới', undefined, undefined]);
  entityHop.refreshEntityApply('activity', {
    ok: true,
    activity: { fields: ['id', 'customerId'], rows: [['GD9', 'KH1']] }
  });
  check(so, 'nạp thủ công Activity thay toàn bộ lịch sử và dọn giao dịch cũ',
    [entityHop.Store.activitiesByCustomer.KH1.map((record) => record.id), entityHop.Store.activitiesByCustomer.KH2],
    [['GD9'], undefined]);
  entityHop.sidebarBoot = () => { throw new Error('payload nạp trọn thực thể không được khởi động lại Sidebar'); };
  entityHop.refreshReloadPayload({ mode: 'entity', entity: 'customer', customer: { fields: ['id', 'companyName'], rows: [['KH3', 'Khách mới'], ['KH1', 'Tên mới']] }, counters: { customer: 3 } });
  check(so, 'payload mode entity từ lời hỏi áp bằng refreshEntityApply: thay trọn Customer, không gọi sidebarBoot, giữ Activity',
    [Object.keys(entityHop.Store.customers).sort(), entityHop.Store.customers.KH3.companyName, entityHop.Store.activitiesByCustomer.KH1.map((record) => record.id)],
    [['KH1', 'KH3'], 'Khách mới', ['GD9']]);

  const configHop = taoHopCat({
    Store: { categories: {}, config: {}, customers: {}, activitiesByCustomer: {} },
    ScreenState: { screen: 'view', currentCustomerId: '', formStack: [] },
    SCREEN_VIEW: 'view',
    screenViewRender: () => { configHop._rendered = true; return {}; }
  });
  napClient(configHop, 'client/ram/refresh.html');
  const configManual = configHop.refreshManualSheetApply({ ok: true, target: 'config', reloadMode: 'config', config: { params: { X: '1' }, defaults: {}, counters: {}, sort: [], sheetSchema: {} } });
  check(so, 'Config reload thay Store.config và vẽ màn hiện tại',
    [configHop.Store.config.params.X, configHop._rendered, configManual.ok], ['1', true, true]);

  const fullCoreHop = taoHopCat();
  napClient(fullCoreHop, 'client/ram/refresh.html');
  let bootOptions = null;
  let resetCalled = false;
  fullCoreHop.screenStateGoView = () => { resetCalled = true; };
  fullCoreHop.sidebarBoot = (options) => { bootOptions = options; return Promise.resolve({ ok: true }); };
  await fullCoreHop.refreshFullCore({ ok: true, reloadMode: 'fullCore' });
  check(so, 'full-core reload tự động không reset màn hình và yêu cầu bootstrap giữ surface hiện tại',
    [resetCalled, bootOptions], [false, { preserveView: true }]);

  const syncRefreshHop = taoHopCat({
    ScreenState: { screen: 'view', currentCustomerId: 'KH1', formStack: [] },
    SCREEN_VIEW: 'view',
    FBM_SYNC_CLIENT: { active: true, lastStatus: { phase: 'idle' } },
    screenViewRender: () => { syncRefreshHop._viewRendered = true; },
    fbmSyncPaint: (status) => { syncRefreshHop._syncPainted = status; }
  });
  napClient(syncRefreshHop, 'client/ram/refresh.html');
  const syncRender = syncRefreshHop.refreshDecideAndRender({ ok: true, applied: true, mode: 'fullCore' });
  check(so, 'payload reload trực tiếp cũng không vẽ đè shell Đồng bộ',
    [syncRender.screen, syncRender.rendered, syncRefreshHop._viewRendered, syncRefreshHop._syncPainted],
    ['sync', false, undefined, { phase: 'idle' }]);
}

module.exports = { chay };
