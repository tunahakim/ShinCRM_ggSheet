<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 11. Danh mục dropdown (Lookup Data) -->
<!-- split-doc-lines: 2117-2381 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 11. Danh mục dropdown (Lookup Data)

### 11.1 Cách lấy danh mục — GetCompletionList

**Endpoint:** `POST /FastBusiness.DataService.asmx/GetCompletionList`

Đây là endpoint chuyên dùng để lấy danh sách giá trị cho dropdown/autocomplete. Mỗi danh mục có một controller riêng.

**Payload mẫu:**

```json
{
  "prefixText": "",
  "count": 100,
  "contextKey": "",
  "controller": "<tên controller danh mục>",
  "type": 0,
  "filter": "",
  "externalFilter": "",
  "language": "v",
  "cookie": "<fbmPayloadCookie>"
}
```

Giải thích các trường: `prefixText` rỗng = lấy tất cả, có giá trị = tìm kiếm (autocomplete). `count` = số kết quả tối đa. `type` có 3 giá trị: `0` = lấy trang đầu, `2` = khởi tạo (init), `99` = validate/resolve mã thành tên (gửi `prefixText` = mã, nhận về tên), `102` = phân trang (lấy trang tiếp). `filter` = điều kiện lọc phụ (VD: lọc quận theo tỉnh). `externalFilter` = điều kiện lọc bổ sung.

**Response:** `{ "d": [["mã", "tên"], ["mã", "tên"], ...] }` — mảng 2 chiều, mỗi phần tử là cặp [mã, tên].

### 11.2 Trạng thái KH (crLeadStatus) — 7 giá trị

Bảng DB: `crdmttdm`. Trường mã: `ma_tt`. Trường tên: `ten_tt`.

| Mã | Tên | Ghi chú |
|----|-----|---------|
| `BG` | Gửi báo giá | |
| `CS` | Đang chăm sóc | Trạng thái mặc định khi tạo KH mới |
| `DT` | Gửi dự thảo hợp đồng | |
| `FA` | KH Fail | |
| `HD` | Đã ký hợp đồng | |
| `MK` | KD Chuyển trả MKT | Kinh doanh trả lại cho Marketing |
| `TN` | Ít tiềm năng | |

Trên cây tổ chức (GetTreeItem), 7 giá trị nhóm thành 3 nhóm lớn: #1 Tiềm năng (TN, MK, FA), #2 Đang chăm sóc (CS, BG, DT), #3 Đã ký hợp đồng (HD).

Liên hệ giữa `ma_tt` và `status` trên form KH: `ma_tt` là mã trạng thái chăm sóc (TN/MK/FA/CS/BG/DT/HD). Trường `status` là trạng thái active/conversion của FBM, map về `fbm_status` (1=Hoạt động, 2=Đã chuyển đổi, 3=Không hoạt động), không thay thế trực tiếp `care_status`. Khi tạo KH mới, gửi `ma_tt = "CS"` và `status = "1"`.

### 11.3 Nguồn tiềm năng (crLeadSource) — 11 giá trị

Bảng DB: `crdmngdm`. Trường mã: `ma_nguon`. Trường tên: `ten_nguon`.

| Mã | Tên |
|----|-----|
| `DTGT` | CT - Đại lý, đối tác |
| `FCD` | Từ FCD |
| `HOITHAO` | MKT - Hội thảo |
| `KDTUTIM` | KD - Tự tìm |
| `KHAC` | Nguồn khác |
| `KHCUGT` | KD - KH giới thiệu |
| `KHCUNC` | KD - KH nâng cấp, bổ sung |
| `KHEMAIL` | CT - KH email đến |
| `KHGOIDEN` | CT - KH gọi đến |
| `NVGT` | Nhân viên trong Cty giới thiệu |
| `TELEMKTG` | MKT - Tele |

Trường bắt buộc khi tạo KH mới: `nguon_dm` phải chứa một trong các mã trên.

### 11.4 Quy mô DN (crdmqmo) — 6 giá trị

Bảng DB: `crdmqmo`. Trường mã: `ma_qmo`. Trường tên: `ten_qmo`.

| Mã | Tên | Số nhân sự |
|----|-----|-----------|
| `SN` | Doanh nghiệp siêu nhỏ | 1-10 |
| `NH` | Doanh nghiệp nhỏ | 10-200 |
| `VU` | Doanh nghiệp quy mô vừa | 200-300 |
| `LN` | Doanh nghiệp lớn | 300-1.000 |
| `RL` | Doanh nghiệp rất lớn | 1.000-10.000 |
| `TD` | Tập đoàn | Trên 10.000 |

### 11.5 Phân loại KH (crAccountType) — 17 giá trị (ĐẦY ĐỦ)

Bảng DB: `crdmloaikh`. Trường mã: `ma_loai`. Trường tên: `ten_loai`. Đây là danh mục phân loại theo ngành nghề, không phải trường bắt buộc.

| Mã | Tên |
|----|-----|
| `00` | 00. Không rõ |
| `01` | 01. Dệt may, da giày |
| `02` | 02. Xây dựng, xây lắp, cầu đường |
| `03` | 03. Vật liệu xây dựng |
| `04` | 04. Cơ khí, ôtô, chế tạo máy, điện |
| `05` | 05. Khai thác khoáng sản |
| `06` | 06. Hoá chất, nhựa, dược-mỹ phẩm |
| `07` | 07. Thực phẩm, nước giải khát |
| `08` | 08. Điện tử, tin học, viễn thông |
| `09` | 09. Giấy, bao bì, văn phòng phẩm |
| `10` | 10. Thiết bị VP, nội thất |
| `11` | 11. In ấn, báo chí |
| `12` | 12. Thương mại, XNK |
| `13` | 13. Hành chính sự nghiệp |
| `14` | 14. D.vụ, tư vấn, vận tải, giải trí |
| `15` | 15. Kỹ thuật, công nghệ cao |
| `99` | 99. Khác |

Lưu ý: tên hiển thị trên FBM có kèm mã ở đầu (VD: "06. Hoá chất, nhựa, dược-mỹ phẩm"). Khi gửi form, chỉ gửi mã (VD: `"06"`).


### 11.6 Lĩnh vực kinh doanh (crIndustry) — 42 giá trị (ĐẦY ĐỦ)

Bảng DB: `crdmlvkd`. Trường mã: `ma_lv`. Trường tên: `ten_lv`. Không phải trường bắt buộc.

| Mã | Tên | Mã | Tên |
|----|-----|----|-----|
| `01` | Nông nghiệp | `22` | Xây dựng |
| `02` | Lâm nghiệp | `23` | Sửa chữa, bảo dưỡng |
| `03` | Thủy sản | `24` | Phân phối |
| `04` | Khai khoáng | `25` | Bán lẻ |
| `05` | Xăng dầu | `26` | Vận tải, Logistics |
| `06` | Thực phẩm | `27` | Du lịch, lưu trú |
| `07` | Bia, rượu, NGK | `28` | Viễn thông |
| `08` | Dệt may | `29` | Phần mềm, IT |
| `09` | Thời trang | `30` | Dịch vụ tài chính |
| `10` | Da giầy | `31` | Bất động sản |
| `11` | Gỗ, nội thất | `32` | Giáo dục |
| `12` | Giấy | `33` | Y tế, bệnh viện |
| `13` | Hóa chất | `34` | Gia dụng |
| `14` | Dược phẩm | `35` | Phi chính phủ |
| `15` | Nhựa, cao su | `36` | Thiết bị y tế |
| `16` | Thép, kim loại | `37` | Văn phòng phẩm |
| `17` | Linh kiện điện tử | `38` | Bao bì |
| `18` | Thiết bị điện | `39` | Dịch vụ, tư vấn |
| `19` | Cơ khí, chế tạo máy | `40` | Nhiều lĩnh vực |
| `20` | Năng lượng, điện | `41` | Khác |
| `21` | Công ích | `99` | Nhà hàng |

### 11.7 Công việc (crJob) — 12 giá trị

Bảng DB: `crdmcv`. Trường mã: `ma_cv`. Trường tên: `ten_cv`.

| Mã | Tên | Ghi chú |
|----|-----|---------|
| `00` | Chưa liên hệ được | |
| `01` | Bàn giao, chuyển nguồn hợp đồng | |
| `BG` | Gửi báo giá | Trùng mã với trạng thái KH |
| `DM` | Demo & Khảo sát | |
| `DT` | Gửi hợp đồng dự thảo | Trùng mã với trạng thái KH |
| `FA` | Fail | Trùng mã với trạng thái KH |
| `GD` | Gọi điện chăm sóc | Phổ biến nhất |
| `HD` | Ký hợp đồng | Trùng mã với trạng thái KH |
| `HG` | Hẹn gặp | |
| `MK` | Chuyển lại KH cho MKT | Trùng mã với trạng thái KH |
| `TL` | Gửi tài liệu giới thiệu | |
| `TN` | Chuyển trạng thái xuống KH ít tiềm năng | Trùng mã với trạng thái KH |

Danh mục này dùng cho cả bảng KH (trường `ma_cv`) và bảng hoạt động. Các mã trùng với trạng thái KH (BG, DT, FA, HD, MK, TN) gợi ý rằng khi tạo hoạt động với một công việc nhất định, trạng thái KH có thể tự động cập nhật theo.

### 11.8 Tỉnh/thành (crProvinceCity) — 34 giá trị (ĐẦY ĐỦ)

Bảng DB: `crdmtinh`. Trường mã: `ma_tinh`. Trường tên: `ten_tinh`.

| Mã | Tên | Mã | Tên |
|----|-----|----|-----|
| `AGG` | An Giang | `LCI` | Lào Cai |
| `BNH` | Bắc Ninh | `LCU` | Lai Châu |
| `CBG` | Cao Bằng | `LDG` | Lâm Đồng |
| `CBT` | Cao Bằng | `LSN` | Lạng Sơn |
| `CMU` | Cà Mau | `NAN` | Nghệ An |
| `CTO` | Cần Thơ | `NBH` | Ninh Bình |
| `DBN` | Điện Biên | `PTO` | Phú Thọ |
| `DLK` | Đắk Lắk | `QNH` | Quảng Ninh |
| `DNG` | Đà Nẵng | `QNI` | Quảng Ngãi |
| `DNI` | Đồng Nai | `QTI` | Quảng Trị |
| `DTP` | Đồng Tháp | `SLA` | Sơn La |
| `GLI` | Gia Lai | `THA` | Thanh Hóa |
| `HCM` | Hồ Chí Minh | `TNH` | Tây Ninh |
| `HNI` | Hà Nội | `TNN` | Thái Nguyên |
| `HPG` | Hải Phòng | `TQG` | Tuyên Quang |
| `HTH` | Hà Tĩnh | `VLG` | Vĩnh Long |
| `HYN` | Hưng Yên | | |
| `KHA` | Khánh Hòa | | |

Lưu ý: FBM chỉ có 34 tỉnh/thành, không phải 63 tỉnh thành như thực tế Việt Nam. Có 2 mã cùng trỏ đến "Cao Bằng" (`CBG` và `CBT`) — có thể là lỗi dữ liệu hoặc phân vùng cũ. Trường `dc_lh_tinh` là trường bắt buộc khi tạo KH mới — phải gửi một trong các mã trên.

ShinCRM không coi danh sách này là danh sách tỉnh/thành chính. ShinCRM dùng danh sách hành chính hiện hành trong `categories(province)`; mapping sang FBM qua `fbm_push_code`, `fbm_pull_codes`, và metadata như `oldProvinceCodes`. Ví dụ `HUE` có thể tồn tại ở ShinCRM dù FBM không có mã riêng; `CBT` có thể chỉ nằm trong `fbm_pull_codes` để nhận dữ liệu cũ.

### 11.9 Quận/huyện (crDistrict)

Bảng DB: `crdmquan`. Trường mã: `ma_quan`. Trường tên: `ten_quan`. Danh mục này filter theo tỉnh — khi lấy, truyền `filter` hoặc `externalFilter` chứa mã tỉnh. Ví dụ: mã quận `CBT03` thuộc tỉnh CBT, resolve qua `type: 99` trả về tên "Phường Tân Giang".

### 11.10 Quốc gia (crCountry) — 36 giá trị (ĐẦY ĐỦ)

Bảng DB: `crdmqg`. Trường mã: `ma_qg`. Trường tên: `ten_qg`.

| Mã | Tên | Mã | Tên |
|----|-----|----|-----|
| `00000001` | Việt Nam | `00000019` | Úc |
| `00000002` | Mỹ | `00000020` | Đan Mạch |
| `00000003` | Nga | `00000021` | Philippin |
| `00000004` | Nhật | `00000022` | Phần Lan |
| `00000005` | Trung Quốc | `00000023` | Bỉ |
| `00000006` | Malaysia | `00000024` | Canada |
| `00000007` | Đài Loan | `00000025` | Áo |
| `00000008` | Hàn Quốc | `00000026` | Indonesia |
| `00000009` | Singapore | `00000027` | Tây Ban Nha |
| `00000010` | Thái Lan | `00000028` | Dominica |
| `00000011` | Đức | `00000029` | Campuchia |
| `00000012` | Thụy Sỹ | `00000030` | New Zealand |
| `00000013` | Anh | `00000031` | Ý |
| `00000014` | Pháp | `00000032` | Ba Lan |
| `00000015` | Ấn Độ | `00000033` | Ai Len |
| `00000016` | Thụy Điển | `00000034` | Hà Lan |
| `00000017` | Hồng Kông | `US` | Hoa Kỳ |
| `00000018` | Kuwait | `VN` | Việt Nam |

Lưu ý: Việt Nam xuất hiện 2 lần với 2 mã khác nhau (`"00000001"` và `"VN"`). Tương tự Mỹ có `"00000002"` và `"US"`. Khi tạo KH mới, form FBM mặc định gửi `dc_lh_qg = "VN"` — giá trị này hoạt động bình thường.

### 11.11 Sản phẩm (crdmsp) — 18 giá trị (ĐẦY ĐỦ)

Bảng DB: `crdmsp`. Trường mã: `ma_sp`. Trường tên: `ten_sp`. Lấy được từ module báo cáo (crptsk16).

| Mã | Tên |
|----|-----|
| `DT` | Đào tạo |
| `F1` | Fast Business Online |
| `FA` | Fast Accounting 11 |
| `FB` | Fast Business |
| `FC` | Fast CRM Online |
| `FD` | Fast DMS Online |
| `FE` | Fast e-Contract |
| `FF` | Fast Financial |
| `FH` | Fast HRM Online |
| `FI` | Fast E-Invoice |
| `FK` | Fast Book |
| `FO` | Fast Accounting Online |
| `FP` | FAP - Hành chính sự nghiệp |
| `FT` | Fast Accounting 12 |
| `FW` | Fast Accounting Web |
| `FX` | Fast Accounting 10.2 |
| `HDDV` | Hóa đơn đầu vào |
| `KH` | Sản phẩm khác |

### 11.12 Nhân viên (crUser)

Bảng DB: `vsysuserinfo`. Tổng: 375 nhân viên (đang hoạt động). Filter mặc định: `user_yn = 1 and s1 <> '1'`. Khi dùng cho autocomplete NV Marketing: filter thêm `status='1' and s1='1'`. Khi dùng cho autocomplete NV Kinh doanh: filter thêm `status='1'`.

Lấy qua `GetCompletionList` với `controller: "crUser"`, `type: 2` (init) hoặc `type: 0` (trang đầu), `type: 102` (phân trang).

### 11.13 Bảng mapping mã ↔ tên

Khi đọc từ grid (`GetGridViewPage`), FBM trả về TÊN hiển thị. Khi gửi lên form (`GetDirViewPage` lưu), phải gửi MÃ. Bảng dưới đây là tham chiếu chuyển đổi:

| Trường trên grid (tên) | Trường trên form (mã) | Controller danh mục | Bảng DB |
|------------------------|----------------------|--------------------|---------| 
| `ten_tt` (Trạng thái KH) | `ma_tt` | crLeadStatus | crdmttdm |
| `ten_nguon_dm` (Nguồn) | `nguon_dm` | crLeadSource | crdmngdm |
| `ten_lv` (Lĩnh vực) | `ma_lvkd` | crIndustry | crdmlvkd |
| `ten_loai` (Phân loại KH) | `loai_kh` | crAccountType | crdmloaikh |
| `ten_qmo` (Quy mô) | `qm_ns` | crdmqmo | crdmqmo |
| `ten_dclh_tinh` (Tỉnh) | `dc_lh_tinh` | crProvinceCity | crdmtinh |
| `ten_cv` (Công việc) | `ma_cv` | crJob | crdmcv |
| `ten_sp` (Sản phẩm) | `ma_sp` | crdmsp | crdmsp |

Quy tắc cho ShinCRM khi đồng bộ: đọc grid → nhận TÊN → tra bảng mapping để lưu MÃ. Đẩy lên FBM → gửi MÃ.

---

