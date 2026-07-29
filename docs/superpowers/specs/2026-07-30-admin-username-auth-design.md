# Thiết kế đăng nhập quản trị bằng tên `admin`

## Mục tiêu

Cho phép một tài khoản quản trị riêng đăng nhập bằng tên `admin` và mật khẩu `1`, đồng thời không để JWT của tài khoản đã bị xóa làm hỏng trải nghiệm đăng nhập.

## Phạm vi

- Chỉ tạo một tài khoản có vai trò `admin`.
- Không tạo tài khoản Giảng viên trong thay đổi này.
- Form đăng nhập chấp nhận cả email thông thường và tên đăng nhập `admin`.
- `admin` được ánh xạ ở phía ứng dụng sang một định danh email kỹ thuật nội bộ của Supabase; email này không hiển thị trong giao diện.
- Tài khoản được xác nhận sẵn và gắn vai trò `admin` trong dữ liệu hồ sơ/quyền hiện có.
- Chính sách mật khẩu của dự án được điều chỉnh ở mức thấp nhất mà Supabase cho phép. Nếu Supabase không cho phép một ký tự, hệ thống không giả vờ tạo thành công mà phải báo rõ giới hạn thực tế.

## Luồng đăng nhập

1. Người dùng nhập `admin` và `1`.
2. Ứng dụng chuẩn hóa tên đăng nhập, ánh xạ `admin` sang định danh nội bộ rồi gửi yêu cầu Supabase Auth.
3. Supabase cấp phiên hợp lệ.
4. Ứng dụng đọc hồ sơ và xác nhận vai trò `admin`.
5. Người dùng được chuyển đến dashboard/quản trị.

Email học viên vẫn đi qua luồng đăng nhập hiện tại và không bị ánh xạ.

## Phiên JWT mồ côi

Khi JWT hợp lệ về mặt chữ ký nhưng `sub` không còn tồn tại trong Auth:

- phiên/cookie cũ được xóa;
- người dùng được chuyển về `/login`;
- giao diện hiển thị thông báo yêu cầu đăng nhập lại;
- không để lỗi thô `User from sub claim in JWT does not exist` xuất hiện.

## An toàn và giới hạn

Mật khẩu `1` không an toàn và chỉ được triển khai vì yêu cầu rõ ràng của chủ hệ thống. Service-role chỉ được dùng phía máy chủ. Định danh kỹ thuật không được đưa vào thông báo, HTML hoặc bundle phía trình duyệt.

## Kiểm thử

- Unit test ánh xạ chính xác `admin`, không ánh xạ email thông thường.
- Unit test phiên có `sub` đã bị xóa được coi là chưa đăng nhập.
- Kiểm thử production đăng nhập bằng `admin`/`1` và truy cập được trang quản trị.
- Kiểm tra tài khoản có đúng vai trò `admin`.
- Chạy toàn bộ test, typecheck, lint và build trước khi deploy.

