# Thiết kế sửa trang thi thử và trạng thái tải

## Mục tiêu

Luồng bắt đầu thi thử phải tạo được đề 40 câu hợp lệ, phản hồi ngay sau khi người dùng bấm nút và không chuyển sang trang lỗi chung khi máy chủ gặp sự cố.

## Nguyên nhân gốc

Định nghĩa `public.start_attempt` mới nhất trong migration `202608020008_fixed_practice_order.sql` tạo `question_snapshot` thiếu `id` và `difficulty`. Cả `startMockExam` và `loadExamSession` đều kiểm tra hai trường này, vì vậy lượt thi được tạo trong cơ sở dữ liệu nhưng ứng dụng ném `EXAM_SNAPSHOT_INVALID` khi đọc lại snapshot. `ExamLaunchForm` không bắt lỗi từ server action nên lỗi thoát lên error boundary của Next.js.

## Thiết kế đã duyệt

### Cơ sở dữ liệu

Thêm migration tiếp nối, không sửa lịch sử migration đã chạy. Migration định nghĩa lại `public.start_attempt(uuid, uuid, uuid)` với hai nhánh tách biệt:

- Luyện tập giữ thứ tự `practice_position` và không có thời hạn.
- Thi thử dùng bộ phân bổ hiện có `allocate_mock_exam_questions`, lấy đúng 40 câu theo chương và độ khó, giữ thứ tự đáp án cố định theo lượt thi và đặt thời hạn từ cấu hình.

Mỗi snapshot phải có `id`, `chapter_id`, `content`, `difficulty` và bốn phương án gồm `id`, `label`, `content`. Snapshot thi thử không chứa `is_correct` hay `explanation`.

RPC phải từ chối tạo lượt thi nếu không phân bổ đủ số câu đã cấu hình, thay vì tạo một lượt thi hỏng.

### Trải nghiệm bắt đầu thi

`ExamLaunchForm` quản lý ba trạng thái: sẵn sàng, đang tạo đề và thất bại.

- Khi gửi: nút bị khóa, hiện spinner và dòng “Đang tạo đề thi…”.
- Khi thành công: điều hướng đến `/exam/{attemptId}`; route-level loading tiếp tục hiển thị trong lúc trang phiên thi tải dữ liệu.
- Khi thất bại: giữ nguyên trang, khôi phục nút và hiện cảnh báo tiếng Việt có thể thử lại. Không để lỗi server action thoát lên error boundary.

Thêm `loading.tsx` tại route mock exam và route phiên thi để các lần chuyển trang đều có giao diện tải nhất quán, responsive và hỗ trợ `prefers-reduced-motion`.

### Biên lỗi

Server action trả kết quả phân biệt `{ ok: true, url }` hoặc `{ ok: false, message }` cho các lỗi dự kiến. Chi tiết nội bộ của Supabase không được đưa ra trình duyệt. Lỗi xác thực vẫn do lớp bảo vệ phiên hiện hành xử lý.

## Kiểm thử

- Kiểm thử migration xác nhận snapshot chứa đủ trường công khai, không lộ đáp án và dùng bộ phân bổ thi thử.
- Kiểm thử component xác nhận trạng thái pending xuất hiện ngay, chặn gửi lặp, điều hướng khi thành công và hiển thị cảnh báo khi thất bại.
- Kiểm thử route loading xác nhận nội dung có ngữ nghĩa `status` và nhãn dễ hiểu.
- Chạy toàn bộ unit test, typecheck, lint phạm vi thay đổi và production build trước khi push.

## Phạm vi triển khai

Ngoài luồng thi thử và migration liên quan, trang kết quả đã nộp có thêm thanh điều hướng xem lại. Thanh này hiển thị `Câu X / tổng số câu`, có nút `Câu trước` và `Câu tiếp`, đồng thời hỗ trợ phím `←`/`→`. Mỗi lần chuyển sẽ cuộn và đưa focus đến thẻ câu tương ứng; nút biên bị khóa ở câu đầu/cuối. Phím tắt không hoạt động khi focus nằm trong phần tử nhập liệu.

Không thay đổi dữ liệu câu hỏi Markdown, logic chấm điểm, modal rà soát trước khi nộp, luồng luyện tập hoặc các thay đổi cục bộ chưa commit của người dùng.
