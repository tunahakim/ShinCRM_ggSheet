# ShinCRM mini

CRM cá nhân một người dùng, dựng trên Google Sheet làm kho dữ liệu, Google Apps Script (GAS) làm phần chạy trên máy chủ, và một Chrome Extension làm phần chạy trên máy tại Việt Nam. Mục tiêu là một công cụ dùng được cho công việc bán hàng hằng ngày, không phải một sản phẩm hoàn hảo để bán, nên tiêu chí chọn giải pháp luôn là *đơn giản nhất mà đúng*, kèm yêu cầu gắt về code sạch (clean code) và trải nghiệm dùng (UI/UX).

Repo này hiện là **repo tài liệu và code tham chiếu**. Bản đang chạy thật nằm ngoài repo (xem mục Nơi đặt bản chạy thật). Toàn bộ thiết kế mới nằm ở `0_Documentation/Opus 4.8 tư vấn/`; đó là nguồn sự thật duy nhất khi có tranh chấp giữa tài liệu và code.

## Ba nơi chạy, không có nơi thứ tư

| Nơi chạy | Việc của nó | Không bao giờ làm |
|---|---|---|
| GAS (máy chủ) | Đọc và ghi Sheet, giữ toàn bộ luật nghiệp vụ, là bộ não của phần đồng bộ FBM | Không gọi FBM trực tiếp |
| Extension (máy tại Việt Nam) | Mọi việc dính FBM (gọi mạng tới FBM), bắt sự kiện bấm ô trên Sheet, giữ đồng hồ hẹn giờ | Không giữ luật nghiệp vụ, không tự quyết cái gì |
| Sidebar (giao diện) | Vẽ form, đọc dữ liệu từ RAM đã nạp, gửi lệnh lưu | Không chạm Sheet trực tiếp |

Bot Telegram/Zalo chỉ đi qua GAS, không phải nơi chạy thứ tư.

Luật chống rò rỉ quan trọng nhất là **phụ thuộc một chiều**: phần lõi (core) không bao giờ biết FBM tồn tại; phần bộ chuyển tiếp `fbm_sync` được phép đọc lõi, lõi không được phép đọc `fbm_sync`.

## Bản đồ thư mục

| Thư mục | Là gì | Trạng thái |
|---|---|---|
| `0_Documentation/Opus 4.8 tư vấn/` | Bộ tài liệu thiết kế chính thức của bản Google Sheet | Đang hoàn thiện tài liệu 09 |
| `0_Documentation/Nghiên cứu FBM/` | 15 chương nghiên cứu API của FBM, viết cho **một dự án khác** (ShinCRM trên Supabase) | Chỉ tra khi cần, phần lớn nội dung là thừa với bản Google Sheet |
| `1_ShinCRM_GAS/` | Code GAS cũ (18 tệp, ~3.500 dòng) do AI viết chắp vá | **Đang chạy được**, nhưng rối, thêm một trường phải sửa hàng chục chỗ. Giữ để tham chiếu, sẽ refactor hoặc bỏ |
| `2_ShinCRM_Extension/` | Bộ khung thư mục extension dự kiến | Gần như rỗng: hầu hết tệp chỉ có khối chú thích đầu tệp, chưa có logic |

## Bản đồ tài liệu

Tệp số thường (`02`, `03`, …) là tài liệu giải thích, có ví dụ và lý do. Tệp có chữ `A` (`02A`, `03A`, …) là **hợp đồng** (contract): bản rút gọn chỉ chứa tên chính thức đã chốt, quy tắc bất biến và điểm treo, dùng làm đầu vào cho phiên làm việc sau.

| Tệp | Nội dung |
|---|---|
| `00. Lộ trình và checklist.md` | Đang ở đâu trên lộ trình, còn treo cái gì, việc phải làm theo thứ tự. **Đọc tệp này trước** |
| `01. Quy chuẩn nền ShinCRM.md` | Hiến pháp: triết lý, tám nguyên tắc code, ranh giới lõi/bộ chuyển tiếp, từ điển khái niệm, danh sách CẤM, quy tắc trình bày tài liệu, bản đồ tài liệu |
| `02. KIẾN TRÚC DỮ LIỆU ShinCRM.md` + `02A` | Bốn nhóm sheet, ba hàng tiêu đề, hiến pháp đọc cột theo mã `@`, luật cấp mã khách, cột đi kèm của `Category` |
| `03. Data schema & UI schema.md` + `03A` | `DATA_SCHEMA` (trường LÀ GÌ, nơi duy nhất trong lõi biết mã cột `@`), `UI_SCHEMA` (trường HIỆN Ở ĐÂU), `SYNC_SCHEMA` (của riêng `fbm_sync`) |
| `04. Bộ máy render và luồng lưu.md` | Block, `spatialConfig`, slot động, vẽ lại cục bộ, ngăn xếp form, luồng lưu năm trạm |
| `05. NẠP DỮ LIỆU VÀ RAM ShinCRM.md` + `05A` | Nạp một phát vào RAM, `Store`, nguồn-chọn khách hiện hành, trạng thái bẩn (dirty) |
| `06. CỬA GHI XUỐNG SHEET ShinCRM.md` | Cửa ghi duy nhất phía máy chủ: khóa tài liệu, chỉ ghi cột có khai, xóa mềm, hook trước khi xóa cứng |
| `07. LÀM MỚI DỮ LIỆU VÀ SHEET QUẢN TRỊ ShinCRM.md` | Làm mới dữ liệu, in ra các sheet quản trị `!` |
| `08. NGÔN NGỮ LỌC VÀ SẮP XẾP TRÊN SHEET QUẢN TRỊ.md` + `08A` | Cú pháp lọc/sắp xếp người dùng gõ trên sheet quản trị |
| `2026.08.26. Biên bản làm việc phiên đồng bộ FBM.md` | Bản chốt phiên 5A, sẽ thành `09. Đồng bộ FBM.md`: giao thức GAS–Extension, cắt lát MV3, dấu vân tay (fingerprint) ba chiều, mười cột mô tả bản ghi |
| `2026.08.19 - Thảo luận sơ bộ - Tài liệu A.md` | Ghi chép thảo luận ban đầu, giá trị lịch sử |

## Nơi đặt bản chạy thật

| Thứ | Đường dẫn / định danh |
|---|---|
| Dự án Apps Script | `scriptId` `1mmpSwWP0Ucl16-hGw1n2Hqi8wk4Fd26b3WyhC3C8RFLHiQ2BhRgXt7Tz` (múi giờ `Asia/Bangkok`, runtime V8), đẩy code bằng `clasp` từ `1_ShinCRM_GAS/` |
| Extension đang dùng thật | `D:\Program\0. Extension\MiniCRM_GoogleSheet` — chỉ có `content.js` (~78 dòng) và `manifest.json`, làm đúng một việc là bắc cầu sự kiện bấm ô trên Sheet, **chưa có một dòng code FBM nào** |

Bản khung trong `2_ShinCRM_Extension/` và bản chạy thật ở `D:\Program\...` là hai thứ khác nhau; khi bắt đầu code extension phải chọn một nơi làm nơi duy nhất, đừng nuôi hai bản.

## Khoảng cách giữa sheet đang chạy và thiết kế mới

Sheet đang chạy đã có sẵn ba hàng tiêu đề và mã cột `@` ở hàng 1, tức đúng tinh thần hiến pháp đọc cột. Nhưng tên sheet và tiền tố mã cột thì khác thiết kế mới:

| | Đang chạy | Thiết kế mới (tài liệu 02) |
|---|---|---|
| Sheet khách hàng | `ListKH`, mã `@KH_*` | `Customer`, mã `@CUS_*` |
| Sheet hoạt động | `Act`, mã `@ACT_*` | `Activity`, mã `@ACT_*` |
| Sheet danh mục / cấu hình | `Help`, `QL_System` | `Category`, `Config` |
| Mười cột mô tả bản ghi | chưa có | bắt buộc có |

Nghĩa là trước khi code mới chạy trên dữ liệu thật cần một lượt chuyển đổi sheet (đổi tên sheet, viết lại hàng 1, thêm cột), làm trên **bản sao** của tệp Sheet.

## Quy ước khi làm việc trong repo này

Khi viết tài liệu: **nghiêm cấm hardwrap** (mỗi đoạn văn là một dòng duy nhất, không tự ngắt dòng giữa đoạn); thuật ngữ tiếng Anh nên kèm nghĩa tiếng Việt trong ngoặc ở lần xuất hiện đầu; cái gì bày dạng bảng dễ nhìn hơn thì bày dạng bảng.

Khi viết code: một việc chỉ khai ở một nơi; thêm một trường có mặt trên form là sửa đúng hai dòng, một ở `DATA_SCHEMA` và một ở `UI_SCHEMA`; `UI_SCHEMA` không bao giờ chứa chuỗi `@`; không nơi nào chạm DOM ngoài bộ máy render; không cập nhật lạc quan (optimistic update), RAM chỉ đổi sau khi máy chủ xác nhận. Danh sách CẤM đầy đủ ở tài liệu `01`.

Nhánh làm việc hiện tại là `2026.08.26-Clade-code-tiep-tuc`, nhánh chính là `main`.
