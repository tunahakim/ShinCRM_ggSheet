/**
 * Ghi một khách hoặc một giao dịch mẫu vào Sheet giả dựng bằng `dungHop`, tra cột theo mã qua `ghiO`.
 *
 * Nhận đối tượng chứ không nhận tham số theo vị trí: hai bản cũ cùng tên nhận tham số khác thứ tự, và một lời gọi theo vị trí chuyển nhầm bản sẽ ghi tình trạng bản ghi vào ô MST mà không ai biết. Trường không truyền thì không ghi, trừ tình trạng bản ghi mặc định `active` như một bản ghi đang dùng.
 */

const { ghiO } = require('../dung-hop');

function ghiKhach(nen, hang, kh) {
  ghiO(nen, 'Customer', hang, '@CUS_MA_KH', kh.ma);
  ghiO(nen, 'Customer', hang, '@CUS_TEN_CTY', kh.ten);
  if (kh.mst !== undefined) { ghiO(nen, 'Customer', hang, '@CUS_MST', kh.mst); }
  ghiO(nen, 'Customer', hang, '@CUS_TT_BAN_GHI', kh.tinhTrang || 'active');
  if (kh.tim !== undefined) { ghiO(nen, 'Customer', hang, '@CUS_TIM_KIEM', kh.tim); }
}

/** `ngay` nhận cả `Date`, để ca kiểm chứng minh ngày không đi qua cầu `google.script.run` dưới dạng `Date`. */
function ghiGiaoDich(nen, hang, gd) {
  ghiO(nen, 'Activity', hang, '@ACT_MA_GD', gd.ma);
  ghiO(nen, 'Activity', hang, '@ACT_MA_KH', gd.maKhach);
  ghiO(nen, 'Activity', hang, '@ACT_NGAY_LAM_VIEC', gd.ngay);
  ghiO(nen, 'Activity', hang, '@ACT_TT_BAN_GHI', gd.tinhTrang || 'active');
}

module.exports = { ghiKhach, ghiGiaoDich };
