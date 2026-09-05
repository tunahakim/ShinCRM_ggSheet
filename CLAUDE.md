## 1. Làm việc với người dùng

- AI được khuyến kích trao đổi và phản biện với người dùng, chỉ ra các điểm thấy mâu thuẫn hoặc chưa hợp lý, kể cả việc nội dung đó do AI tự viết hay do người dùng đưa ra. Điều quan trọng với tôi là tính hiệu quả chứ không phải răm rắp nghe theo.
- Các nội dung quan trọng phải thảo luận với người dùng, đợi người dùng ra quyết định rồi mới ghi vào tài liệu hoặc code, tuyệt đối cấm việc AI tự tự quyết định mà người dùng không hề biết gì.
- Thường xuyên báo cáo tiến độ công việc cho người dùng qua màn hình chat.

## 2. Các luật khi viết tài liệu:

- Nghiêm cấm hard wrap, kể cả khi viết Description cho commit github hay khi viết code. Trừ khi viết comment code ở cuối dòng code thì được, còn docstring cũng cấp hard wrap
- Nếu sử dụng thuật ngữ tiếng Anh thì cần có đóng mở ngoặc (tiếng Việt) để tôi hiểu.
- Nếu 1 mục của tài liệu bất kỳ có dạng todo - nếu như đã thực hiện xong thì xóa phần đó chứ không lưu như lịch sử. Bởi vì nếu ghi dạng - việc A: đã thực hiện xong thì tài liệu sẽ rất dài và nặng, và nội dung tài liệu sẽ chứa toàn rác. Nhớ: xóa hẳn, không còn dấu vết. Bởi vì dấu vết chính là lịch sử github rồi - cùng lắm thì tóm tắt trong Description của commit thôi.
- Với các dạng sơ đồ ASCII, sơ đồ cây thư mục,... thì cân nhắc việc có hard wrap hay không, tôi nghiêng về phía là có hard wrap ở sơ đồ cây thư mục để dễ theo dõi, vì chỗ này nếu để trình đọc markdown tự xuống dòng thì sẽ làm sơ đồ cây thư mục rất rối và khó xem.

## 3. Git Commit

- Viết tiếng Việt có dấu
- Viết cả Description - không hard wrap. Viết ngắn gọn không lan man dài dòng. Mỗi ý là 1 dòng.

## 4. Cây thư mục code

- Dựng thêm tệp code hoặc thư mục code nào thì bổ sung ngay một dòng mô tả vào `0_Documentation/Phiên code/Cây thư mục code.md` trong cùng lượt làm việc đó, đừng để dồn sang lượt sau.
- Tổ chức thư mục phải khoa học, mỗi tệp làm đúng một nhiệm vụ. Không rải phẳng hàng chục tệp vào một thư mục.

## 5. Viết code

- Docstring ngắn gọn thôi, vì code bên dưới đã tự giải thích rồi. Tuy vậy docstring vẫn cần thiết để tôi dễ hiểu các file code - nhưng không được dài dòng lê thê