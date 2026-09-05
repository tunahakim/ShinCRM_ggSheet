/**
 * Khung sidebar giả: bốn vùng cố định, thêm được id nào cần.
 *
 * Đủ cho `renderScreen` và `renderTarget` chạy trong Node mà không phải mở sidebar trên Google. Cố tình chỉ có `getElementById`, `innerHTML` và `hidden` — đúng ba thứ mà engine được phép dùng, nên tệp nào đụng tới thứ thứ tư sẽ nổ ngay chứ không lặng lẽ chạy được ở đây rồi hỏng trên Google.
 *
 * Một điểm bắt chước trình duyệt có chủ đích: thay `innerHTML` của một vùng thì mọi phần tử thêm bị xóa nội dung, vì trên trình duyệt các phần tử đó là con của vùng và vừa bị thay thế. Không có nó, nội dung một card do `renderTarget` ghi trước đó sẽ sống sót qua một lượt vẽ cả màn và cho ra phép kiểm đạt giả.
 */

const VUNG = ['sidebar-header', 'sidebar-info', 'sidebar-body', 'sidebar-footer'];

function khungGia(themId) {
  const els = {};
  const them = [].concat(themId || []);

  them.forEach((id) => { els[id] = { id: id, innerHTML: '', hidden: false }; });

  VUNG.forEach((id) => {
    let html = '';
    els[id] = {
      id: id,
      hidden: false,
      get innerHTML() { return html; },
      set innerHTML(v) {
        html = v;
        them.forEach((k) => { els[k].innerHTML = ''; });
      }
    };
  });

  return { _els: els, getElementById: (id) => els[id] || null };
}

module.exports = { khungGia, VUNG };
