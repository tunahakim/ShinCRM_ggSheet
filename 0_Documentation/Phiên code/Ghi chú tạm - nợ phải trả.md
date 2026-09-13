# Ghi chú tạm - nợ phải trả

Tài liệu này chỉ ghi các việc còn thiếu đã đối chiếu với code hiện tại. Đây không phải hợp đồng kiến trúc và không thay thế các checklist chuyên môn. Các hạng mục đồng bộ FBM đã có code hoặc đã thuộc checklist riêng không lặp lại ở đây.

## Phạm vi còn lại

Phạm vi của ghi chú là lớp cấu hình chung của ShinCRM và màn hình quản trị trong Sidebar. `Category` vẫn lưu trên Sheet vì đây là danh mục người dùng sở hữu; Sidebar chỉ là giao diện nhập và quản lý. `Config` sẽ chuyển phần cấu hình vận hành sang `DocumentProperties`; Sidebar là giao diện nhập duy nhất cho phần này.

## Hiện trạng đã kiểm chứng

### Config

- `configParams()` đọc trực tiếp cặp cột tham số trên Sheet `Config` và giữ cache trong một lượt chạy tại `1_ShinCRM_GAS/server/config/Settings.js`.
- `configReadAll()` đọc trực tiếp các block `sheetSchema`, `defaults` và `sort` trên Sheet `Config`, đồng thời lấy `counters` từ khối tham số tại `1_ShinCRM_GAS/server/sheet/ConfigRead.js`.
- `CONFIG_COLUMNS` và tên các block của Config đang khai báo cứng trong `server/data/SheetLayout.js` và `server/sheet/ConfigRead.js`.
- `configParamCatalog()` đang khai báo trong code tên tham số, kiểu, lựa chọn và giá trị mặc định. Đây là metadata của schema, không phải giá trị người dùng nhập.
- Bộ đếm mã hiện đọc và ghi vào Sheet `Config` qua `server/gate/IdGate.js`.
- Chưa có `ConfigRepository`, cửa ghi Config từ Sidebar, hoặc endpoint `saveConfig`.

### Mã cột và schema

- Mã cột lõi và metadata trường nằm trong `DATA_SCHEMA`; `EntityRead` resolve mã cột sang vị trí thực tế bằng header Sheet tại thời điểm đọc.
- Mã cột không nên được sao chép vào `DocumentProperties`. Mọi thao tác cần vị trí cột phải đọc lại `readColumnMap()` từ header Sheet.
- Block `sheetSchema` hiện vẫn được dùng để suy ra kiểu cho cột ngoài `DATA_SCHEMA` trong `server/view/ViewSheetRenderer.js`. Nếu bỏ block này phải chốt nguồn schema thay thế hoặc chấp nhận mặc định `TEXT`.

### Category

- Danh sách mã danh mục và cột đi kèm nằm trong `CATEGORY_COLUMNS` tại `server/data/SheetLayout.js`.
- `categoryReadAll()` đọc giá trị từ Sheet `Category` và trả contract `{ categories, warnings }`.
- `WriteGate` chỉ đọc Category để kiểm tra giá trị SELECT khi lưu bản ghi; chưa có cửa ghi Category riêng.
- Chưa có `CategoryWriteGate`, endpoint ghi Category từ Sidebar, hoặc màn hình quản lý danh mục và mapping.
- Khi người dùng sửa trực tiếp Sheet `Category`, trigger chỉ đánh dấu trạng thái bẩn để Sidebar nạp lại; luồng Sidebar ghi mới phải tự đánh dấu bẩn sau khi ghi thành công.

### Sidebar

- `loadCore()` trả `config` và `categories`; client chỉ nạp chúng vào `Store`.
- Sidebar hiện chưa có màn hình quản lý Config hoặc Category. Màn hình cài đặt hiện có chỉ phục vụ điều khiển phiên đồng bộ.
- `UserPrefs` đã là ví dụ về luồng đầy đủ đọc/ghi Property qua Sidebar, nhưng đó là `UserProperties` theo từng người dùng và không phải repository cho Config dùng chung của file.

## Nợ phải trả

### 1. Tạo ConfigRepository

Tạo một cửa đọc/ghi duy nhất cho cấu hình dùng chung của Spreadsheet. Bên ngoài repository không được gọi trực tiếp `PropertiesService` hoặc đọc các ô Config để lấy giá trị vận hành.

Contract đọc phải giữ hình dạng tương thích với client hiện tại: `{ params, defaults, counters, sort }`. Repository phải phân biệt metadata schema trong code với giá trị cấu hình do người dùng nhập.

`DocumentProperties` nên lưu một payload JSON có phiên bản, namespace rõ ràng và thao tác ghi nguyên khối dưới khóa tài liệu. Không dùng từng property rời rạc cho các danh sách có thứ tự.

### 2. Tách mã cột khỏi dữ liệu Config

Mã cột lõi phải resolve từ `DATA_SCHEMA` và header Sheet tại thời điểm sử dụng. Không lưu vị trí cột trong Property.

Phải quyết định nguồn thay thế cho kiểu của cột người dùng thêm. Có hai phương án hợp lệ: giữ một schema mở rộng riêng trong code/Property, hoặc bỏ khai báo kiểu riêng và dùng `TEXT` cho cột không thuộc `DATA_SCHEMA`. Không được âm thầm coi `sheetSchema` cũ đã được thay thế khi chưa chọn một phương án.

Các cấu hình `defaults` và `sort` nếu tiếp tục dùng mã cột phải resolve mã qua schema tại lúc chạy; nếu đổi sang tên field thì phải có hàm resolve duy nhất và báo lỗi khi field không còn tồn tại.

### 3. Tạo cửa ghi Config từ Sidebar

Thêm endpoint GAS nhận object cấu hình, kiểm tra toàn bộ trước khi ghi, khóa tài liệu, ghi Property, xóa cache đọc và trả lại snapshot mới.

Giá trị sai kiểu, khóa lạ, khóa trùng, phiên bản không hỗ trợ hoặc cấu hình tham chiếu field không tồn tại phải bị từ chối trước khi thay đổi dữ liệu.

Sau khi ghi thành công phải đánh dấu trạng thái cấu hình bẩn để các Sidebar khác nạp lại. Không ghi ngược Config Sheet trừ khi có một bước di chuyển dữ liệu được chỉ định rõ.

### 4. Tạo cửa ghi Category từ Sidebar

Thêm `CategoryWriteGate` riêng với storage là Sheet `Category`. Cửa này nhận bản ghi một dòng hoặc một lô mapping, resolve cột theo mã trong `CATEGORY_COLUMNS`, khóa tài liệu, kiểm tra dữ liệu, ghi đúng vùng, `flush`, đánh dấu bẩn và trả lại `categoryReadAll()`.

Sidebar không được tự ghép chuỗi mapping hoặc tự quyết định vị trí cột. Quy tắc mã đi kèm, giá trị trùng và cảnh báo phải nằm ở GAS để mọi nguồn nhập dùng cùng một luật.

Cửa ghi Category không được mở rộng `writeGateSave()`, vì `writeGateSave()` chỉ phục vụ Customer và Activity.

### 5. Dựng màn hình quản trị

Thêm hai màn hình độc lập trong Sidebar: `Cài đặt` cho Config và `Danh mục & ánh xạ` cho Category. Mỗi màn hình chỉ dựng form, gửi action tới GAS, nhận contract kết quả và thay snapshot trong RAM.

Màn hình Category cần hỗ trợ tối thiểu xem danh mục hiện có, thêm/sửa một giá trị, nhập mapping theo lô, xem trước thay đổi và hiển thị lỗi theo từng dòng. Không lưu danh mục trong browser hoặc Property làm nguồn sự thật.

### 6. Di chuyển dữ liệu Config hiện có

Viết một bước migration đọc Config Sheet cũ qua đúng parser hiện tại, kiểm tra không mất dữ liệu, ghi payload Property phiên bản đầu tiên và chỉ sau khi xác nhận thành công mới ngừng đọc giá trị vận hành từ Sheet.

Migration phải quy định rõ cách xử lý `params`, `defaults`, `sort` và bộ đếm. Không xóa Config Sheet trong cùng bước đầu tiên; giữ khả năng rollback hoặc đối chiếu cho tới khi nghiệm thu xong.

## Contract cần giữ ổn định

```text
ConfigRepository.read()  -> { params, defaults, counters, sort, version }
ConfigRepository.write(input) -> { ok, config, dirty }
CategoryRepository.read() -> { categories, warnings }
CategoryRepository.write(input) -> { ok, categories, warnings, dirty }
```

Client chỉ biết contract trên, không biết storage là Sheet hay `DocumentProperties`. GAS là nơi resolve schema, mã cột, kiểm tra, khóa và quyết định nghiệp vụ.

## Kiểm thử tối thiểu

- Đọc Config từ Property khi không có Sheet Config.
- Ghi Config sai kiểu, khóa lạ, khóa trùng và ghi đồng thời.
- Cache Config bị xóa sau khi ghi và Sidebar nhận snapshot mới.
- Mã cột bị đổi vị trí trên header nhưng thao tác đọc/ghi vẫn resolve đúng theo mã.
- Ghi Category một dòng và nhiều dòng, giữ nguyên các cột khác.
- Mapping Category trùng, thiếu mã, mã không tồn tại và dữ liệu rỗng.
- Sidebar nạp lại sau khi Category hoặc Config bị thay đổi từ một phiên khác.

## Thứ tự triển khai

1. Chốt contract và phân loại các block Config.
2. Viết `ConfigRepository` cùng migration và test offline.
3. Thêm endpoint và màn hình Config.
4. Viết `CategoryWriteGate` cùng test ghi một dòng/bulk.
5. Thêm màn hình Category và mapping.
6. Chạy `node tests/run.js`, sau đó nghiệm thu trên Sheet DEV trước khi dùng dữ liệu thật.

## Quyết định cần chốt trước khi code

- Bộ đếm mã có chuyển cùng Config sang `DocumentProperties` hay được coi là state hệ thống riêng trong `DocumentProperties`.
- Kiểu của cột người dùng thêm lấy từ schema nào sau khi bỏ `@CFG_COT_MA` và `@CFG_COT_KIEU` khỏi Config.
- `defaults` và `sort` lưu khóa theo mã cột hay theo đường dẫn field trong `DATA_SCHEMA`.
