# Group API

Tài liệu mô tả các API quản lý nhóm hiện có trong SplitMate.

## Thông tin chung

- **Base URL (local):** `http://localhost:3000/api`
- **Swagger UI:** `http://localhost:3000/api/docs`
- **Content-Type:** `application/json`
- Tất cả endpoint Group đều yêu cầu access token.

Gửi access token trong header:

```http
Authorization: Bearer <access_token>
```

## Cấu trúc dữ liệu

### Group

| Trường        | Kiểu                | Nullable | Mô tả                       |
| ------------- | ------------------- | -------- | --------------------------- |
| `id`          | `string` (UUID)     | Không    | ID của nhóm                 |
| `name`        | `string`            | Không    | Tên nhóm                    |
| `avatarUrl`   | `string`            | Có       | URL ảnh đại diện của nhóm   |
| `inviteCode`  | `string`            | Có       | Mã mời gồm 8 ký tự          |
| `createdById` | `string` (UUID)     | Không    | ID người tạo nhóm           |
| `createdAt`   | `string` (ISO 8601) | Không    | Thời điểm tạo nhóm          |
| `updatedAt`   | `string` (ISO 8601) | Không    | Thời điểm cập nhật gần nhất |

### Thành viên trong chi tiết Group

| Trường         | Kiểu                       | Nullable | Mô tả                              |
| -------------- | -------------------------- | -------- | ---------------------------------- |
| `membershipId` | `string` (UUID)            | Không    | ID bản ghi thành viên trong nhóm   |
| `id`           | `string` (UUID)            | Không    | ID người dùng                      |
| `name`         | `string`                   | Không    | Tên người dùng                     |
| `email`        | `string`                   | Không    | Email người dùng                   |
| `avatarUrl`    | `string`                   | Có       | URL ảnh đại diện người dùng        |
| `role`         | `OWNER \| ADMIN \| MEMBER` | Không    | Vai trò của người dùng trong nhóm  |
| `joinedAt`     | `string` (ISO 8601)        | Không    | Thời điểm người dùng tham gia nhóm |

Mã mời không phân biệt chữ hoa/chữ thường khi gửi lên. Hệ thống chuẩn hóa mã bằng cách xóa khoảng trắng ở hai đầu và chuyển thành chữ hoa. Các ký tự hợp lệ là `A-H`, `J-N`, `P-Z` và `2-9`; không sử dụng `I`, `O`, `0`, `1` để tránh nhầm lẫn.

## Danh sách endpoint

| Method | Endpoint          | Mô tả                                | Thành công    |
| ------ | ----------------- | ------------------------------------ | ------------- |
| `POST` | `/group`          | Tạo nhóm mới                         | `201 Created` |
| `POST` | `/group/join`     | Tham gia nhóm bằng mã mời            | `201 Created` |
| `GET`  | `/group`          | Lấy các nhóm của người dùng hiện tại | `200 OK`      |
| `GET`  | `/group/:groupId` | Lấy chi tiết nhóm kèm thành viên     | `200 OK`      |

## 1. Tạo nhóm

Tạo một nhóm mới. Người dùng đang đăng nhập sẽ đồng thời được thêm vào nhóm với vai trò `OWNER`.

```http
POST /api/group
```

### Request body

| Trường      | Kiểu     | Bắt buộc | Ràng buộc                                                        |
| ----------- | -------- | -------- | ---------------------------------------------------------------- |
| `name`      | `string` | Có       | Không được rỗng, tối đa 100 ký tự                                |
| `avatarUrl` | `string` | Không    | Chuỗi URL ảnh đại diện; hiện tại API chưa kiểm tra định dạng URL |

Ví dụ:

```json
{
  "name": "Summer trip",
  "avatarUrl": "https://example.com/group.png"
}
```

### Response thành công

Status: `201 Created`

```json
{
  "success": true,
  "data": {
    "id": "ee5e3ae8-e6f2-44a0-9a55-5c0efb251ca1",
    "name": "Summer trip",
    "avatarUrl": "https://example.com/group.png",
    "inviteCode": "7KMQ4WXP",
    "createdById": "16fd2706-8baf-433b-82eb-8c7fada847da",
    "createdAt": "2026-09-26T13:30:00.000Z",
    "updatedAt": "2026-09-26T13:30:00.000Z"
  }
}
```

### Lỗi có thể gặp

| Status | Code                    | Trường hợp                                                          |
| ------ | ----------------------- | ------------------------------------------------------------------- |
| `400`  | `BAD_REQUEST`           | Body không hợp lệ, thiếu `name`, `name` rỗng hoặc dài hơn 100 ký tự |
| `401`  | `UNAUTHORIZED`          | Thiếu access token, token sai hoặc đã hết hạn                       |
| `500`  | `INTERNAL_SERVER_ERROR` | Không thể tạo mã mời duy nhất hoặc có lỗi hệ thống                  |

### cURL

```bash
curl -X POST "http://localhost:3000/api/group" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Summer trip",
    "avatarUrl": "https://example.com/group.png"
  }'
```

## 2. Tham gia nhóm bằng mã mời

Thêm người dùng đang đăng nhập vào nhóm với vai trò `MEMBER`.

```http
POST /api/group/join
```

### Request body

| Trường       | Kiểu     | Bắt buộc | Ràng buộc                                       |
| ------------ | -------- | -------- | ----------------------------------------------- |
| `inviteCode` | `string` | Có       | Chính xác 8 ký tự hợp lệ sau khi được chuẩn hóa |

Ví dụ:

```json
{
  "inviteCode": "7KMQ4WXP"
}
```

Giá trị như `" 7kmq4wxp "` cũng được chấp nhận và được chuẩn hóa thành `"7KMQ4WXP"`.

### Response thành công

Status: `201 Created`

API trả về thông tin nhóm vừa tham gia:

```json
{
  "success": true,
  "data": {
    "id": "ee5e3ae8-e6f2-44a0-9a55-5c0efb251ca1",
    "name": "Summer trip",
    "avatarUrl": "https://example.com/group.png",
    "inviteCode": "7KMQ4WXP",
    "createdById": "16fd2706-8baf-433b-82eb-8c7fada847da",
    "createdAt": "2026-09-26T13:30:00.000Z",
    "updatedAt": "2026-09-26T13:30:00.000Z"
  }
}
```

### Lỗi có thể gặp

| Status | Code           | Message/Trường hợp                                                     |
| ------ | -------------- | ---------------------------------------------------------------------- |
| `400`  | `BAD_REQUEST`  | Mã mời sai độ dài, sai định dạng hoặc body không hợp lệ                |
| `401`  | `UNAUTHORIZED` | Thiếu access token, token sai hoặc đã hết hạn                          |
| `404`  | `NOT_FOUND`    | `Invite code is invalid` — không tìm thấy nhóm ứng với mã mời          |
| `409`  | `CONFLICT`     | `You are already a member of this group` — người dùng đã là thành viên |

### cURL

```bash
curl -X POST "http://localhost:3000/api/group/join" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "inviteCode": "7KMQ4WXP"
  }'
```

## 3. Lấy danh sách nhóm của tôi

Lấy tất cả nhóm mà người dùng đang đăng nhập là thành viên. Kết quả được sắp xếp theo `createdAt` giảm dần, nhóm mới nhất đứng trước.

```http
GET /api/group
```

Endpoint hiện tại chưa hỗ trợ phân trang.

### Response thành công

Status: `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": "ee5e3ae8-e6f2-44a0-9a55-5c0efb251ca1",
      "name": "Summer trip",
      "avatarUrl": "https://example.com/group.png",
      "inviteCode": "7KMQ4WXP",
      "createdById": "16fd2706-8baf-433b-82eb-8c7fada847da",
      "createdAt": "2026-09-26T13:30:00.000Z",
      "updatedAt": "2026-09-26T13:30:00.000Z"
    },
    {
      "id": "ac24de00-6107-409c-a5ce-9bb3b3460179",
      "name": "House expenses",
      "avatarUrl": null,
      "inviteCode": "M6RT2YQH",
      "createdById": "9ba2eabe-ac27-4726-a693-f195fce343d1",
      "createdAt": "2026-09-20T08:15:00.000Z",
      "updatedAt": "2026-09-20T08:15:00.000Z"
    }
  ]
}
```

Nếu người dùng chưa tham gia nhóm nào, `data` là mảng rỗng:

```json
{
  "success": true,
  "data": []
}
```

### Lỗi có thể gặp

| Status | Code           | Trường hợp                                    |
| ------ | -------------- | --------------------------------------------- |
| `401`  | `UNAUTHORIZED` | Thiếu access token, token sai hoặc đã hết hạn |

### cURL

```bash
curl "http://localhost:3000/api/group" \
  -H "Authorization: Bearer <access_token>"
```

## 4. Lấy chi tiết nhóm kèm thành viên

Chỉ thành viên của nhóm mới lấy được chi tiết. Danh sách `members` được sắp xếp theo thời điểm tham gia tăng dần.

```http
GET /api/group/:groupId
```

### Path parameter

| Trường    | Kiểu            | Mô tả       |
| --------- | --------------- | ----------- |
| `groupId` | `string` (UUID) | ID của nhóm |

### Response thành công

Status: `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "ee5e3ae8-e6f2-44a0-9a55-5c0efb251ca1",
    "name": "Summer trip",
    "avatarUrl": "https://example.com/group.png",
    "inviteCode": "7KMQ4WXP",
    "createdById": "16fd2706-8baf-433b-82eb-8c7fada847da",
    "createdAt": "2026-09-26T13:30:00.000Z",
    "updatedAt": "2026-09-26T13:30:00.000Z",
    "members": [
      {
        "membershipId": "313a2753-ce82-462a-85ce-d1ff858f82ed",
        "id": "16fd2706-8baf-433b-82eb-8c7fada847da",
        "name": "Thanh",
        "email": "thanh@example.com",
        "avatarUrl": null,
        "role": "OWNER",
        "joinedAt": "2026-09-26T13:30:00.000Z"
      },
      {
        "membershipId": "94d9ba70-e2b2-4e85-a868-00255d921b60",
        "id": "e277ad2c-d1f2-4672-99c3-09cf5bfd75b7",
        "name": "An",
        "email": "an@example.com",
        "avatarUrl": "https://example.com/an.png",
        "role": "MEMBER",
        "joinedAt": "2026-09-26T14:00:00.000Z"
      }
    ]
  }
}
```

### Lỗi có thể gặp

| Status | Code           | Trường hợp                                                       |
| ------ | -------------- | ---------------------------------------------------------------- |
| `400`  | `BAD_REQUEST`  | `groupId` không phải UUID v4 hợp lệ                              |
| `401`  | `UNAUTHORIZED` | Thiếu access token, token sai hoặc đã hết hạn                    |
| `404`  | `NOT_FOUND`    | Nhóm không tồn tại hoặc người dùng hiện tại không thuộc nhóm này |

### cURL

```bash
curl "http://localhost:3000/api/group/ee5e3ae8-e6f2-44a0-9a55-5c0efb251ca1" \
  -H "Authorization: Bearer <access_token>"
```

## Định dạng lỗi chung

Mọi lỗi trả về theo cấu trúc:

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "details": ["Invite code must be exactly 8 characters"]
  },
  "timestamp": "2026-09-26T13:30:00.000Z",
  "path": "/api/group/join"
}
```

`details` chỉ xuất hiện khi API có thêm thông tin chi tiết, chẳng hạn các lỗi validation.

## Ghi chú nghiệp vụ

- Người tạo nhóm có vai trò `OWNER`.
- Người tham gia qua mã mời có vai trò `MEMBER`.
- Một người dùng chỉ có thể là thành viên của một nhóm một lần.
- Endpoint chi tiết nhóm trả về thành viên cùng vai trò tương ứng.
- `inviteCode` được trả về trong dữ liệu nhóm của các endpoint hiện tại.
