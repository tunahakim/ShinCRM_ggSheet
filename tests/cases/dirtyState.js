/**
 * Ca kiểm cho `server/state/DirtyState.js`: khối trạng thái bẩn đính kèm **mọi** phản hồi máy chủ.
 *
 * Điều được canh ở đây là **hàm này không bao giờ ném lỗi**. Nó nằm trên đường phản hồi của mọi lời gọi, nên nó nổ là cả sidebar nổ — và nổ vì một dấu ngoặc thiếu ở một khóa mà người ta sửa bằng tay lúc gỡ lỗi thì càng vô lý. Vì thế phép kiểm đưa vào đủ loại rác: JSON hỏng, JSON đúng nhưng không phải mảng, `PropertiesService` gãy hẳn.
 *
 * Chiều rỗng cũng được canh: khối rỗng nghĩa là "không biết có gì bẩn", dẫn tới không vẽ lại gì cả. Đó là chiều an toàn, còn chiều nguy hiểm là đoán bừa ra một danh sách bẩn rồi đi ghi đè dữ liệu.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check } = require('../lib/assert');

function chay(so) {
  section('Trạng thái bẩn — khối này không được phép ném lỗi, vì nó nằm trên mọi đường phản hồi');

  const nenRong = dungHop({ sheets: ['Config', 'Log'] });
  check(so, 'bốn khóa khai đúng tên thuộc tính của DocumentProperties',
    nenRong.hop.DIRTY_KEYS,
    { viewSheets: 'dirtyViewSheets', records: 'dirtyRecords', config: 'dirtyConfig', all: 'dirtyAll' });

  check(so, 'tệp mới chưa ai ghi gì thì cả bốn đều rỗng, không phải undefined',
    nenRong.hop.dirtyStateRead(),
    { viewSheets: [], records: [], config: false, all: false });

  // Đường đọc bình thường: JSON mảng, đúng thứ chiều ghi ở chặng làm mới sẽ ghi ra.
  const nen = dungHop({
    sheets: ['Config', 'Log'],
    props: {
      dirtyViewSheets: '["Bảng tổng","Bảng thầu"]',
      dirtyRecords: '["KH0001","KH0007"]',
      dirtyConfig: 'true',
      dirtyAll: 'false'
    }
  });

  check(so, 'JSON mảng đọc ra đúng mảng đó',
    nen.hop.dirtyStateRead(),
    { viewSheets: ['Bảng tổng', 'Bảng thầu'], records: ['KH0001', 'KH0007'], config: true, all: false });

  // Ba dạng rác khác nhau, cả ba đều phải ra mảng rỗng hoặc danh sách đọc được, tuyệt đối không ném.
  const rac = [
    ['chuỗi rỗng', '', []],
    ['JSON thiếu ngoặc đóng thì rơi về tách theo dấu phẩy', '["KH0001", "KH0002"', ['["KH0001"', '"KH0002"']],
    ['danh sách gõ tay bằng dấu phẩy, cắt khoảng trắng hai đầu', ' KH0001 , KH0002 ,, KH0003 ', ['KH0001', 'KH0002', 'KH0003']],
    ['JSON đúng cú pháp nhưng là object thì coi như không có gì', '{"KH0001":true}', []],
    ['JSON đúng cú pháp nhưng là số thì cũng vậy', '42', []],
    ['một mã trần không có ngoặc kép nào', 'KH0009', ['KH0009']]
  ];

  rac.forEach((ca) => {
    const hop = dungHop({ sheets: ['Config', 'Log'], props: { dirtyRecords: ca[1] } }).hop;
    check(so, 'dirtyRecords — ' + ca[0], hop.dirtyStateRead().records, ca[2]);
  });

  // Hai cờ boolean so bằng đúng chuỗi 'true'. Nới ra thành "chuỗi nào cũng tính là bật" thì một ô gõ chữ `false` sẽ bật cờ.
  const co = [
    ['true', true],
    ['false', false],
    ['TRUE', false],
    ['1', false],
    ['', false]
  ];

  co.forEach((ca) => {
    const hop = dungHop({ sheets: ['Config', 'Log'], props: { dirtyConfig: ca[0] } }).hop;
    check(so, 'dirtyConfig "' + ca[0] + '" thành ' + ca[1] + ' — chỉ đúng chuỗi true mới là bật', hop.dirtyStateRead().config, ca[1]);
  });

  // Ca tệ nhất: `PropertiesService` gãy hẳn. Đây là ca không dựng được bằng cách truyền props, nên thay hẳn thứ toàn cục đó.
  const nenGay = dungHop({ sheets: ['Config', 'Log'] });
  nenGay.hop.PropertiesService = {
    getDocumentProperties: function () { throw new Error('Đọc thuộc tính tài liệu thất bại'); }
  };

  check(so, 'PropertiesService gãy hẳn thì trả khối rỗng chứ không ném — đây là chiều an toàn',
    nenGay.hop.dirtyStateRead(),
    { viewSheets: [], records: [], config: false, all: false });

  // Ca gãy nửa đường: mở được nhưng `getProperty` nổ ở khóa thứ hai.
  const nenNua = dungHop({ sheets: ['Config', 'Log'] });
  nenNua.hop.PropertiesService = {
    getDocumentProperties: function () {
      return {
        getProperty: function (key) {
          if (key === 'dirtyRecords') { throw new Error('Khóa này đọc không được'); }
          return null;
        }
      };
    }
  };

  check(so, 'gãy ở giữa lượt đọc cũng ra khối rỗng, không ra khối nửa vời',
    nenNua.hop.dirtyStateRead(),
    { viewSheets: [], records: [], config: false, all: false });

  // Phép nghiệm thu chạy trên Google: bốn dòng, mỗi khóa một dòng.
  const bao = nen.hop.probeDirtyState();
  check(so, 'probeDirtyState in đúng bốn dòng, mỗi khóa một dòng',
    bao,
    ['dirtyViewSheets: Bảng tổng, Bảng thầu', 'dirtyRecords: 2 mã', 'dirtyConfig: true', 'dirtyAll: false']);

  check(so, 'probeDirtyState trên tệp mới nói rõ là rỗng chứ in ra khoảng trắng',
    nenRong.hop.probeDirtyState(),
    ['dirtyViewSheets: rỗng', 'dirtyRecords: rỗng', 'dirtyConfig: false', 'dirtyAll: false']);

  return so;
}

module.exports = { chay };
