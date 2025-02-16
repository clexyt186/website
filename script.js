document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.getElementById("menu-toggle");
    const menu = document.getElementById("menu");
    const homeLink = document.getElementById("home-link");
    const bookLink = document.getElementById("book-link");

    const images = document.querySelectorAll(".portfolio-item");
    const lightbox = document.getElementById("lightbox");
    const lightboxImage = document.getElementById("lightbox-image");
    const closeLightbox = document.getElementById("close-lightbox");
    const prevButton = document.getElementById("prev-button");
    const nextButton = document.getElementById("next-button");

    let position = 0;  // Track current image position
    const moveAmount = 300; // Pixels to move per click

    // ✅ Ensure hamburger menu works across all pages
    if (menuToggle) {
        menuToggle.addEventListener("click", () => {
            menu.classList.toggle("open");
        });
    }

    if (homeLink) {
        homeLink.addEventListener("click", (e) => {
            e.preventDefault();
            window.location.href = "index.html"; // Redirect to home
        });
    }

    if (bookLink) {
        bookLink.addEventListener("click", () => {
            window.open("https://calendar.app.google/EEFcSKDNxTCZHiQk9", "_blank");
        });
    }

    // ✅ Open Lightbox (Panoramic Viewer)
    images.forEach(image => {
        image.addEventListener("click", () => {
            lightboxImage.src = image.getAttribute("data-full");
            lightbox.classList.add("show");
            lightbox.style.display = "flex";
            position = 0; // Reset image position when opened
            lightboxImage.style.transform = `translateX(${position}px)`;
        });
    });

    // ✅ Close Lightbox
    closeLightbox.addEventListener("click", () => {
        lightbox.classList.remove("show");
        lightbox.style.display = "none";
    });

    // ✅ Move Left (View More of the Panoramic Image)
    nextButton.addEventListener("click", () => {
        position -= moveAmount;
        lightboxImage.style.transform = `translateX(${position}px)`;
    });

    // ✅ Move Right (Go Back to Previous View)
    prevButton.addEventListener("click", () => {
        position += moveAmount;
        lightboxImage.style.transform = `translateX(${position}px)`;
    });
});
document.addEventListener("DOMContentLoaded", () => {
    const bookButton = document.getElementById("book-now");

    // ✅ Open Google Calendar booking link
    bookButton.addEventListener("click", () => {
        window.open("https://calendar.app.google/EEFcSKDNxTCZHiQk9", "_blank");
    });
});
document.addEventListener("DOMContentLoaded", () => {
    const bookButton = document.getElementById("book-now");

    // ✅ Open Google Calendar booking link
    bookButton.addEventListener("click", () => {
        window.open("https://calendar.app.google/GVbGSUdeh2auEGBX7", "_blank");
    });
});
