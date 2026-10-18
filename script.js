(() => {
    const card = document.querySelector(".hct-card");
    if (!card) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let flashTimer;

    function setPointerState(event) {
        if (reduceMotion.matches || event.pointerType === "touch") return;

        const bounds = card.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
        const tiltX = (0.5 - y) * 14;
        const tiltY = (x - 0.5) * 16;
        const shiftX = (x - 0.5) * 12;
        const shiftY = (y - 0.5) * 12;

        card.style.setProperty("--hct-rx", tiltX.toFixed(2) + "deg");
        card.style.setProperty("--hct-ry", tiltY.toFixed(2) + "deg");
        card.style.setProperty("--hct-gx", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--hct-gy", (y * 100).toFixed(1) + "%");
        card.style.setProperty("--hct-sx", shiftX.toFixed(1) + "px");
        card.style.setProperty("--hct-sy", shiftY.toFixed(1) + "px");
        card.classList.add("hct-engaged");
    }

    function resetPointerState() {
        card.style.setProperty("--hct-rx", "0deg");
        card.style.setProperty("--hct-ry", "0deg");
        card.style.setProperty("--hct-gx", "50%");
        card.style.setProperty("--hct-gy", "35%");
        card.style.setProperty("--hct-sx", "0px");
        card.style.setProperty("--hct-sy", "0px");
        card.classList.remove("hct-engaged");
    }

    function flashFoil() {
        window.clearTimeout(flashTimer);
        card.classList.remove("hct-flash");
        void card.offsetWidth;
        card.classList.add("hct-flash");
        flashTimer = window.setTimeout(() => card.classList.remove("hct-flash"), 700);
    }

    card.addEventListener("pointermove", setPointerState);
    card.addEventListener("pointerleave", resetPointerState);
    card.addEventListener("blur", resetPointerState);
    card.addEventListener("click", flashFoil);
})();
