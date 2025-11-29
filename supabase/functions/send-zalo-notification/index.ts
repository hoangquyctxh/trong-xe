// File: supabase/functions/send-zalo-notification/index.ts

// Dòng này để import các thư viện cần thiết
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Lấy Access Token của Zalo từ biến môi trường bí mật trên Supabase
const ZALO_ACCESS_TOKEN = Deno.env.get("ZALO_ACCESS_TOKEN");
const ZALO_API_URL = "https://business.zalo.me/api/zns/send";

// Bắt đầu hàm server
serve(async (req) => {
  // Dòng này để xử lý CORS, cho phép trình duyệt của bạn gọi đến function này
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  }

  // NÂNG CẤP QUAN TRỌNG: Khởi tạo một "quản trị viên" Supabase ngay trong function.
  // Nó sử dụng SERVICE_ROLE_KEY để có toàn quyền cập nhật cơ sở dữ liệu.
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // Lấy các thông tin mà client (main.js) gửi lên
    const { phone, template_id, template_data, unique_id } = await req.json();

    // Kiểm tra các thông tin cần thiết
    if (!ZALO_ACCESS_TOKEN) throw new Error("Zalo Access Token chưa được cấu hình trên server.");
    if (!phone || !template_id || !unique_id) throw new Error("Thiếu SĐT, template_id hoặc unique_id của giao dịch.");

    // ---- BẮT ĐẦU LUỒNG XỬ LÝ CHÍNH ----

    // 1. GỌI ĐẾN ZALO API ĐỂ GỬI TIN NHẮN
    const zaloResponse = await fetch(ZALO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "access_token": ZALO_ACCESS_TOKEN },
      body: JSON.stringify({ phone, template_id, template_data, tracking_id: unique_id }),
    });

    const zaloResult = await zaloResponse.json();

    // 2. CẬP NHẬT KẾT QUẢ VÀO BẢNG `transactions`
    if (zaloResult.error) {
      // Nếu Zalo trả về lỗi...
      const errorMessage = `[Zalo API Error ${zaloResult.error}] ${zaloResult.message}`;
      // ...thì cập nhật lỗi đó vào cột `zalo_error_message`
      await supabaseAdmin.from('transactions')
        .update({ zalo_error_message: errorMessage })
        .eq('unique_id', unique_id);
      // Ném lỗi ra để client (main.js) biết và hiển thị thông báo đỏ
      throw new Error(errorMessage);
    } else {
      // Nếu gửi thành công...
      // ...thì cập nhật ID tin nhắn vào cột `zalo_message_id`
      await supabaseAdmin.from('transactions')
        .update({ 
            zalo_message_id: zaloResult.data.msg_id,
            zalo_error_message: null // Xóa lỗi cũ đi nếu lần này gửi thành công
        })
        .eq('unique_id', unique_id);
    }

    // 3. TRẢ KẾT QUẢ VỀ CHO CLIENT
    return new Response(JSON.stringify(zaloResult), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 200,
    });

  } catch (error) {
    // Nếu có bất kỳ lỗi nào trong khối try, trả về thông báo lỗi cho client
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 400,
    });
  }
});
