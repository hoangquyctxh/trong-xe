document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Snowfall
    createSnowflakes();

    // 2. Add Holiday Banner (with Countdown placeholder)
    addHolidayBanner();

    // 3. Initialize Sparkle Cursor
    initSparkleCursor();
});

function createSnowflakes() {
    let snowContainer = document.getElementById('snow-container');
    if (!snowContainer) {
        snowContainer = document.createElement('div');
        snowContainer.id = 'snow-container';
        document.body.appendChild(snowContainer);
    }

    const snowflakeChars = ['❄', '❅', '❆', '•'];
    const numberOfSnowflakes = 40;

    for (let i = 0; i < numberOfSnowflakes; i++) {
        const snowflake = document.createElement('div');
        snowflake.classList.add('snowflake');
        snowflake.textContent = snowflakeChars[Math.floor(Math.random() * snowflakeChars.length)];

        // Randomize
        snowflake.style.left = Math.random() * 100 + 'vw';
        snowflake.style.fontSize = (Math.random() * 10 + 10) + 'px';
        snowflake.style.animationDuration = (Math.random() * 3 + 2) + 's';
        snowflake.style.animationDelay = Math.random() * 5 + 's';
        snowflake.style.opacity = Math.random();

        snowContainer.appendChild(snowflake);
    }
}

function addHolidayBanner() {
    const mainContainer = document.querySelector('.main-container');
    if (mainContainer && !document.querySelector('.holiday-banner')) {
        const banner = document.createElement('div');
        banner.classList.add('holiday-banner');

        banner.innerHTML = `
            <div class="holiday-title">
                🎄 Chúc Mừng Năm Mới <span>2026</span> 🎆
            </div>
            <div id="countdown" class="countdown-container">
                <!-- Javascript will populate this -->
            </div>
        `;

        const searchSection = document.getElementById('search-section');
        if (searchSection) {
            mainContainer.insertBefore(banner, searchSection);
        } else {
            mainContainer.prepend(banner);
        }

        // Start the countdown logic
        startCountdown();
    }
}

function startCountdown() {
    // Target Date: January 1, 2026
    const targetDate = new Date('January 1, 2026 00:00:00').getTime();

    function updateTimer() {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
            document.getElementById('countdown').innerHTML = "HAPPY NEW YEAR 2026! 🎉";
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        const countdownEl = document.getElementById('countdown');
        if (countdownEl) {
            countdownEl.innerHTML = `
                <div class="countdown-box"><span class="countdown-value">${days}</span><span class="countdown-label">Ngày</span></div>
                <div class="countdown-box"><span class="countdown-value">${hours}</span><span class="countdown-label">Giờ</span></div>
                <div class="countdown-box"><span class="countdown-value">${minutes}</span><span class="countdown-label">Phút</span></div>
                <div class="countdown-box"><span class="countdown-value">${seconds}</span><span class="countdown-label">Giây</span></div>
            `;
        }
    }

    setInterval(updateTimer, 1000);
    updateTimer(); // Initial call
}

function initSparkleCursor() {
    let sparkleTimeout;

    document.addEventListener('mousemove', (e) => {
        // Limit creation rate
        if (sparkleTimeout) return;

        sparkleTimeout = setTimeout(() => {
            createSparkle(e.clientX, e.clientY);
            sparkleTimeout = null;
        }, 50); // Every 50ms
    });
}

function createSparkle(x, y) {
    const sparkle = document.createElement('div');
    sparkle.classList.add('sparkle');

    // Randomize slightly
    const offsetX = (Math.random() - 0.5) * 10;
    const offsetY = (Math.random() - 0.5) * 10;

    sparkle.style.left = (x + offsetX) + 'px';
    sparkle.style.top = (y + offsetY) + 'px';

    // Array of festive colors
    const colors = ['#f8b229', '#d42426', '#ffffff', '#84fab0'];
    sparkle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

    document.body.appendChild(sparkle);

    // Remove after animation
    setTimeout(() => {
        sparkle.remove();
    }, 1000);
}
