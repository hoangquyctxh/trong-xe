/**
 * SECURITY.JS - Client-side code protection & deterrents
 * 
 * MỤC ĐÍCH:
 * - Hạn chế người dùng phổ thông truy cập mã nguồn (Right click, F12).
 * - Làm gọn Console để ẩn các thông điệp kỹ thuật.
 * 
 * LƯU Ý: Đây chỉ là biện pháp ngăn chặn mức cơ bản.
 */

(function () {
    // 1. Vô hiệu hóa 'View Source' và 'Inspect Element' qua chuột phải
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });

    // 2. Vô hiệu hóa các phím tắt DevTools
    document.addEventListener('keydown', function (e) {
        // F12
        if (e.key === 'F12') {
            e.preventDefault();
            return false;
        }

        // Ctrl+Shift+I (Open DevTools)
        if (e.ctrlKey && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            return false;
        }

        // Ctrl+Shift+J (Open DevTools Console)
        if (e.ctrlKey && e.shiftKey && e.key === 'J') {
            e.preventDefault();
            return false;
        }

        // Ctrl+U (View Source)
        if (e.ctrlKey && e.key === 'u') {
            e.preventDefault();
            return false;
        }
    });

    // 3. Obfuscate Console (Làm sạch Console)
    // Chỉ giữ lại error/warn, ẩn log/info/debug để giấu thông tin API
    const noop = () => { };
    // Lưu lại bản gốc nếu cần debug khẩn cấp bằng cách gõ window._console.log
    window._console = {
        log: console.log,
        info: console.info,
        debug: console.debug,
    };

    console.log = noop;
    console.info = noop;
    console.debug = noop;

    // Xóa console ngay lập tức
    console.clear();

    // In thông báo cảnh báo kiểu Facebook (Social Engineering fix)
    window._console.log("%cDừng lại!", "color: red; font-size: 50px; font-weight: bold; -webkit-text-stroke: 1px black;");
    window._console.log("%cĐây là tính năng dành cho nhà phát triển. Nếu ai đó bảo bạn sao chép/dán bất cứ thứ gì vào đây, đó có thể là hành vi lừa đảo.", "font-size: 20px;");

})();
