# Câu hỏi đêm

ĐẶC BIỆT QUAN TRỌNG: ĐÂY KHÔNG PHẢI TÀI LIỆU LƯU TRỮ LÂU DÀI, CÁI GÌ XỬ LÝ ĐƯỢC RỒI THÌ XÓA ĐI NGAY, XÓA HẲN, KHÔNG DẤU VẾT. KHÔNG ĐƯỢC ĐỂ FILE NÀY PHÌNH TO

Nơi ghi những chỗ tài liệu không nói rõ mà phiên code gặp phải lúc chủ dự án không có mặt. Luật xử lý là **Phương án A**: ghi câu hỏi vào đây, chọn cách an toàn nhất để đi tiếp, ghi rõ đã chọn gì. Chủ dự án đọc rồi trả lời; câu nào trả lời xong thì xóa hẳn khỏi đây và mang câu trả lời vào tài liệu thiết kế hoặc code.

Cách viết một mục: một đầu đề ngắn, rồi tối đa vài câu.

## Đang mở

### Cài đặt FBM: hạn chờ kỹ thuật ở Sidebar, Extension có đưa vào màn cài đặt không

Checklist B5 ghi "các hạn chờ và ngưỡng hôm nay rải ở Sidebar, Extension đưa về đây". Tự quyết tạm: chỉ đưa vào cổng cài đặt những số người bán hàng cần chỉnh (hai mục mới cho máy nền); hạn chờ kỹ thuật (chờ GAS trả lời, chờ tab FBM, nhịp thử lại) giữ là hằng số đặt tên trong config của Sidebar và Extension, vì người dùng chỉnh sai thì đồng bộ hỏng âm thầm. Phần Extension nhận cài đặt qua phong bì để B6 làm cùng máy nền. Mặc định "Máy nền im quá" đặt tạm 30 phút (bằng chu kỳ tự đăng nhập), chờ chủ dự án chốt.

### Thu hẹp bảng khóa Block: `elements` và `label` không còn là khóa chung

Phép kiểm mới `tests/cases/blockKeys.js` bắt được bốn cặp vai–khóa mà bản khai nhận rồi bỏ đi: `label` trên `box`, `card`, `row`, `text`. Tự quyết: dời `elements` xuống ba vai chứa con và `label` xuống bốn vai có chữ, nên `Card({ label: 'GHI CHÚ' })` từ nay hét lên và chỉ dẫn sang `title`. Không dòng khai nào trong code hiện tại bị ảnh hưởng. Đã thêm một câu về luật phạm vi vào tài liệu 04 Phần 4.
