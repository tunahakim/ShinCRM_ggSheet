<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 14. Bảng mapping trường FBM ↔ ShinCRM -->
<!-- split-doc-lines: 2524-2595 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 14. Bảng mapping trường FBM ↔ ShinCRM

Chương này là mapping nền để AI coding triển khai adapter FBM Phase 2. Tài liệu 2 là nguồn sự thật về field ShinCRM; chương này chỉ nói cách nối field FBM vào field ShinCRM và quy tắc chuyển đổi đặc thù FBM.

**Quy ước chiều đồng bộ:**

| Ký hiệu | Ý nghĩa |
|---|---|
| FBM→Shin | Lấy từ FBM về ShinCRM. |
| Shin→FBM | Đẩy từ ShinCRM lên FBM. |
| 2 chiều | Có thể lấy về và đẩy lên, có conflict resolution khi cả hai bên thay đổi. |
| Lưu raw | Không map vào field nghiệp vụ, chỉ lưu trong `fbm_raw_data` hoặc raw staging để truy vết. |

### 14.1. Khách hàng — `zccrAccount` ↔ `customers`

| FBM field | ShinCRM field / DB column | Chiều | Quy tắc |
|---|---|---|---|
| `stt_rec_kh` | `fbm_stt_rec_kh` | FBM→Shin | Khóa kỹ thuật mạnh nhất để liên kết KH. Không cho user sửa thủ công trừ admin/debug. |
| `ma_kh` | `fbm_ma_kh` | FBM→Shin | Mã hiển thị KH trên FBM. Dùng làm khóa phụ khi import hoạt động. |
| `ten_kh` | `customer_name` | 2 chiều | Tên KH. Khi import nếu trống → staging ERROR. |
| `ma_so_thue` | `tax_code` hoặc `id_card_number` | 2 chiều | FBM gộp MST/CCCD trong một field. ShinCRM tách: DN → `tax_code`, Cá nhân → `id_card_number`. Khi chưa xác định, lưu raw và để user duyệt. |
| `dien_thoai` | `phone` | 2 chiều | FBM chỉ nhận số; khi đẩy phải strip ký tự không phải số. ShinCRM vẫn lưu format user nhập. |
| `email` | `email` | 2 chiều | Email sai format từ FBM lưu raw/staging warning, không ghi vào field constrained nếu validation bật. |
| `dia_chi` | `address` | 2 chiều | Text đầy đủ. |
| `dc_lh_tinh` | `province` + `fbm_dc_lh_tinh` | 2 chiều | Map mã tỉnh FBM ↔ danh mục tỉnh ShinCRM. Giữ mã gốc trong `fbm_dc_lh_tinh`. |
| `dc_lh_qg` | `fbm_dc_lh_qg` | FBM→Shin | Mặc định VN khi đẩy nếu ShinCRM không có giá trị khác. |
| `website` | `website` | FBM→Shin | Lớp lấy thêm; chỉ cập nhật khi response có dữ liệu. |
| `nguon_dm` | `customer_source` + `fbm_nguon_dm` | 2 chiều | Map mã nguồn FBM ↔ danh mục nguồn KH ShinCRM. |
| `ma_tt` | `care_status` + `fbm_ma_tt` | 2 chiều | Map trạng thái FBM ↔ trạng thái chăm sóc ShinCRM qua category metadata. |
| `status` | `fbm_status` | FBM→Shin | 1=Hoạt động, 2=Đã chuyển đổi, 3=Không hoạt động. Không thay thế trực tiếp `care_status`. |
| `nv_kd` | `fbm_nv_kd` | FBM→Shin | Mã NV kinh doanh trên FBM. |
| `nv_tele` | `fbm_nv_tele` | FBM→Shin | Mã NV marketing/tele trên FBM. |
| `ngay_gd` | `fbm_ngay_gd` | FBM→Shin | Ngày giao dịch cuối. Date placeholder năm ≤1900 hoặc 1999-01-01 trong ngữ cảnh ngày giao dịch gần nhất → coi là null. |
| `datetime0` | `fbm_datetime0` | FBM→Shin | Ngày tạo trên FBM. |
| `nguoi_sua` | `fbm_nguoi_sua` | FBM→Shin | Người sửa cuối trên FBM. |
| Toàn bộ response FBM | `fbm_raw_data` | Lưu raw | Lưu snapshot JSON lần sync gần nhất để so sánh conflict/debug/rollback. |

**Trường ShinCRM không đồng bộ sang FBM:** `parent_customer_id`, `urgency`, `potential`, `verification_status`, `notes`, `custom_field_1..3`, `primary_contact_*`, `last_activity_*`, `owner_user_id`, audit/system fields. Các trường này là quản trị nội bộ ShinCRM.

### 14.2. Hoạt động — `zccrAccountTask` ↔ `activities`

| FBM field | ShinCRM field / DB column | Chiều | Quy tắc |
|---|---|---|---|
| `id` | `fbm_id` | FBM→Shin | Khóa kỹ thuật hoạt động FBM. Dùng chống trùng global. |
| `stt_rec` | `fbm_stt_rec` / liên kết KH qua `customers.fbm_stt_rec_kh` | FBM→Shin | Khóa KH trên FBM. Khi import activity, ưu tiên match sau `customer_id` ShinCRM. |
| `ma_kh` | `fbm_ma_kh` | FBM→Shin | Mã hiển thị KH; dùng fallback match KH khi thiếu `stt_rec`. |
| `ma_cv` | `activity_type` + `fbm_ma_cv` | 2 chiều | Map mã công việc FBM ↔ `activity_type`. Nếu không map được → `activity_type = UNKNOWN`, lưu mã gốc ở `fbm_ma_cv`. |
| `start_date` / `end_date` | `activity_date`, `fbm_start_date`, `fbm_end_date` | 2 chiều | ShinCRM dùng một `activity_date`; khi đẩy FBM set start/end cùng ngày. |
| `start_time` / `end_time` | `fbm_start_time`, `fbm_end_time` | Shin→FBM | Mặc định `"00:00"` và `"01:00"` theo Tài liệu 2. |
| `noi_dung` | `content` | 2 chiều | Nội dung chi tiết hoạt động. |
| `status` | `activity_status` + `fbm_status` | FBM→Shin | Map nếu có danh mục tương ứng; nếu không rõ, lưu `fbm_status` và dùng default `COMPLETED` khi import thủ công cần tạo activity. |
| `owner` / tên NV | `fbm_owner` | FBM→Shin | Tên người tạo trên FBM. UI có thể hiển thị theo config `sidebar_settings.activityAuthor`. |
| `nguoi_sua` | `fbm_nguoi_sua` | FBM→Shin | Người sửa cuối trên FBM. |
| `datetime0` | `entry_date` + `fbm_datetime0` | FBM→Shin | Ngày nhập liệu trên FBM. ShinCRM giữ `entry_date` bất biến khi tạo. |
| `event_yn` | `fbm_event_yn` | Shin→FBM | Luôn `0`. |
| `type` | `fbm_type` | Shin→FBM | Luôn `"1"`. |
| `muc_do` | `fbm_muc_do` | Shin→FBM | Luôn `"2"`. |
| File ticket / attachment metadata | Raw staging / Phase sau | Lưu raw | Phase 1/2 chưa upload file đính kèm từ ShinCRM. |

**Trường ShinCRM không đồng bộ sang FBM:** `activity_nature`, `expected_value`, `notes`, reminder inline fields, `contact_id`, contact snapshots, `owner_user_id`, audit/system fields. Khi cần lưu NLH tham gia hoạt động từ FBM mà FBM không có khóa NLH ổn định, lưu vào raw/staging note thay vì ép vào `contact_id`.

### 14.3. Người liên hệ và dữ liệu phụ

| FBM object | ShinCRM mapping | Chiều | Quy tắc |
|---|---|---|---|
| `zccrAccountLH` | `contacts` + `contact_links` hoặc staging KH parse NLH chính | FBM→Shin | FBM NLH dùng để gợi ý tạo contact/link. Không tự merge contact nếu thiếu khóa mạnh; user duyệt qua staging. |
| `zccrAccountTeam` | Raw/staging hoặc log chuyển giao Phase 2+ | FBM→Shin | Dùng phát hiện NV khác làm việc / chuyển giao KH. Không map vào `owner_user_id` nếu chưa có quyết định user/admin. |
| `v2_crContract` | Phase sau: Deal/Contract module riêng | FBM→Shin | Phase 1 không có bảng hợp đồng riêng. Chỉ lưu raw nếu cần tham khảo. |
| `zccrdmduanKD` | Phase sau: Deal module riêng | FBM→Shin | Không ép vào bảng `customers` hoặc `activities`. |

---

