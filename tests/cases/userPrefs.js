/**
 * Ca kiểm cho `server/state/UserPrefs.js`: ba núm chọn nhớ ở `UserProperties`. Tài liệu 07 Phần 6.
 *
 * Hai chiều đối xử ngược nhau, và đó là điều chính được canh ở đây. **Chiều đọc không bao giờ ném lỗi** vì nó nằm trên đường nạp lõi — nó nổ là cả lượt mở sidebar nổ; giá trị lạ hay kho gãy hẳn đều về ngầm định. **Chiều ghi ném lỗi ngay** vì ở đó sai là do code gọi sai, không phải do dữ liệu cũ.
 *
 * Canh thêm một điều mà bộ kiểm dễ bỏ qua: ghi núm chọn **không được chạm** `DocumentProperties`. Hai kho là hai kho, và trộn chúng thì một cái bấm núm sẽ đè lên khóa trạng thái bẩn.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows } = require('../lib/assert');

function chay(so) {
  section('UserPrefs — ba núm chọn nhớ ở UserProperties');

  const moi = dungHop();

  check(so, 'ba núm, mỗi núm một khóa lưu riêng',
    Object.keys(moi.hop.USER_PREFS).map((n) => n + '→' + moi.hop.USER_PREFS[n].key),
    ['followSelection→prefFollowSelection', 'autoRenderView→prefAutoRenderView', 'activityView→prefActivityView']);

  check(so, 'tệp mới chưa ai bấm gì thì cả ba về ngầm định, không phải null',
    moi.hop.userPrefsRead(), { followSelection: true, autoRenderView: true, activityView: 'active' });

  check(so, 'giá trị đã lưu đọc ra đúng kiểu, không phải chuỗi',
    dungHop({ userProps: { prefFollowSelection: 'false', prefAutoRenderView: 'true', prefActivityView: 'deleted' } }).hop.userPrefsRead(),
    { followSelection: false, autoRenderView: true, activityView: 'deleted' });

  // Chiều đọc gặp rác: mọi ca đều về ngầm định, cả công tắc lẫn núm nhiều nấc.
  const rac = [
    ['chuỗi rỗng', '', true],
    ['chữ hoa TRUE', 'TRUE', true],
    ['số 1', '1', true],
    ['chữ lạ', 'bat', true],
    ['đúng chuỗi false mới là tắt', 'false', false]
  ];
  rac.forEach((ca) => {
    check(so, 'công tắc — ' + ca[0] + ' đọc ra ' + ca[2],
      dungHop({ userProps: { prefAutoRenderView: ca[1] } }).hop.userPrefsRead().autoRenderView, ca[2]);
  });

  check(so, 'nấc lạ của núm nhiều nấc về ngầm định active, không trả nguyên văn',
    dungHop({ userProps: { prefActivityView: 'archived' } }).hop.userPrefsRead().activityView, 'active');

  // Kho gãy hẳn: chiều an toàn là ba ngầm định, không phải ném lỗi giữa lượt nạp lõi.
  const gay = dungHop();
  gay.hop.PropertiesService = { getUserProperties: function () { throw new Error('Đọc thuộc tính người dùng thất bại'); } };
  check(so, 'PropertiesService gãy hẳn thì trả ba ngầm định chứ không ném — đây là chiều an toàn',
    gay.hop.userPrefsRead(), { followSelection: true, autoRenderView: true, activityView: 'active' });

  const nua = dungHop();
  nua.hop.PropertiesService = {
    getUserProperties: function () {
      return { getProperty: function (key) { if (key === 'prefAutoRenderView') { throw new Error('Khóa này đọc không được'); } return null; } };
    }
  };
  check(so, 'gãy giữa lượt đọc cũng ra ba ngầm định, không ra khối nửa vời',
    nua.hop.userPrefsRead(), { followSelection: true, autoRenderView: true, activityView: 'active' });

  // Chiều ghi.
  const ghi = dungHop();
  const ra = ghi.hop.userPrefsWrite('activityView', 'all');
  check(so, 'ghi xong trả về cả khối núm và khối trạng thái bẩn, không trả riêng núm vừa ghi',
    [ra.ok, ra.prefs, Object.keys(ra.dirty).sort()],
    [true, { followSelection: true, autoRenderView: true, activityView: 'all' }, ['all', 'config', 'records', 'viewSheets']]);

  check(so, 'giá trị vào kho UserProperties dưới dạng chuỗi', ghi.userProps.prefActivityView, 'all');
  check(so, 'ghi núm chọn không chạm DocumentProperties — hai kho là hai kho',
    Object.keys(ghi.props).filter((k) => k.indexOf('pref') === 0), []);

  ghi.hop.userPrefsWrite('followSelection', false);
  check(so, 'công tắc tắt lưu thành chuỗi "false" và đọc lại ra false',
    [ghi.userProps.prefFollowSelection, ghi.hop.userPrefsRead().followSelection], ['false', false]);

  check(so, 'ghi núm này không làm đổi núm kia',
    ghi.hop.userPrefsRead(), { followSelection: false, autoRenderView: true, activityView: 'all' });

  checkThrows(so, 'tên núm lạ thì ném lỗi và kể tên các núm hiện có',
    () => ghi.hop.userPrefsWrite('tuDungThem', true), 'followSelection, autoRenderView, activityView');
  checkThrows(so, 'công tắc không nhận chuỗi "false" — kiểu sai là code gọi sai',
    () => ghi.hop.userPrefsWrite('autoRenderView', 'false'), 'chỉ nhận `true` hoặc `false`');
  checkThrows(so, 'núm nhiều nấc không nhận nấc lạ, và câu lỗi kể ba nấc',
    () => ghi.hop.userPrefsWrite('activityView', 'archived'), 'all, active, deleted');

  check(so, 'lời gọi bị chặn không ghi gì vào kho',
    ghi.hop.userPrefsRead(), { followSelection: false, autoRenderView: true, activityView: 'all' });

  // Phép nghiệm thu chạy trên Google: ghi thử rồi trả về giá trị ban đầu.
  const probe = dungHop({ userProps: { prefActivityView: 'active' } });
  const bao = probe.hop.probeUserPrefs();
  check(so, 'probeUserPrefs ghi thử một nấc khác rồi trả về nấc ban đầu',
    [bao.indexOf('(KHÔNG ĐẠT)'), probe.hop.userPrefsRead().activityView], [-1, 'active']);
}

module.exports = { chay };
