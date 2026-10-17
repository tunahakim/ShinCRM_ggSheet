# Quy tắc riêng phiên UI và Schema

Chỉ đọc tệp này khi phiên có chạm giao diện Sidebar, screen schema, component, CSS hoặc catalog/resolver trình bày. Quy tắc chung toàn repo nằm ở `AGENTS.md`; tệp này chỉ thêm phần riêng, không nhắc lại.

## Schema

- Screen schema chỉ mô tả ý định và hành vi người dùng: cấu trúc, vùng/ID, nhãn, `action`, dữ liệu và trạng thái tương tác; không mô tả cách trình bày.
- Không đưa vào screen schema: `className`, `rootClass`, `classes`, `*Class`, selector DOM, chuỗi CSS, `style` tự do, token `primary/error/muted`.
- `action` là hợp đồng hành vi; không thêm `purpose` hay trường diễn giải trùng khi `action` đã đủ nghĩa.

## Trình bày và component

- Cách trình bày (`variant`, `state`, `muted`...) được ánh xạ tập trung ở lớp UI/catalog/resolver; schema chỉ khai dữ liệu có nghĩa với người dùng.
- Mỗi quyết định trình bày và mỗi trạng thái chỉ có một nơi sở hữu; không khai lại map/class, không ghép class trực tiếp ở controller.
- Dùng chung component khi cấu trúc và hành vi giống nhau; khác nhãn, dữ liệu, `action` hoặc callback thì truyền tham số, không tạo component theo tên nghiệp vụ.
- Ngoại lệ chỉ được có ở renderer primitive, DOM nội bộ của component, slot domain có stylesheet riêng và host tĩnh; ngoại lệ phải ghi rõ và không chảy ngược vào schema.
- Giao diện dùng CSS thuần và SVG nội tuyến, không dùng framework (khung thư viện). `spatialConfig` giữ mọi quyết định khoảng cách. Vẻ ngoài trong `9_Code_cu_tham_chieu/src/ui/Styles.html` là đặc tả hình thức: chỉ đọc, không sửa code cũ.

## Kiểm thử

- Mỗi quy tắc schema/UI quan trọng phải có kiểm thử tự động chặn tái phạm, không chỉ dựa vào trí nhớ hay review tay.
