const PI = Math.PI;
const TAU = PI * 2;
let nextPlateId = 0;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function numericOption(value, fallback, min, max) {
    const number = Number(value);
    return clamp(Number.isFinite(number) ? number : fallback, min, max);
}

/**
 * Mount a Chladni plate inside an element containing the .cpl-stage markup.
 * Options: grains (700–3200), dot (0.9–2.6), amp (0.2–2), and modes (3–8).
 * Returns a cleanup function for single-page applications and embedded uses.
 */
export function mountChladniPlate(root, options = {}) {
    if (!root || typeof root.querySelector !== "function") return () => {};

    const stage = root.querySelector(".cpl-stage");
    const canvas = root.querySelector(".cpl-canvas");
    const badge = root.querySelector(".cpl-mode");
    const context = canvas && canvas.getContext("2d");
    if (!stage || !canvas || !context) return () => {};

    const hint = root.querySelector(".cpl-hint");
    if (hint) {
        hint.id = "cpl-hint-" + (++nextPlateId);
        stage.setAttribute("aria-describedby", hint.id);
    }

    const grainCount = Math.round(numericOption(options.grains, 2300, 700, 3200));
    const grainSize = numericOption(options.dot, 1.5, 0.9, 2.6);
    const amplitude = numericOption(options.amp, 1, 0.2, 2);
    const maxModes = Math.round(numericOption(options.modes, 6, 3, 8));
    const grid = 30;
    const lookupSize = 2048;
    const lookupMask = lookupSize - 1;
    const lookupScale = lookupSize / TAU;
    const lookup = new Float32Array(lookupSize);

    for (let i = 0; i < lookupSize; i += 1) {
        lookup[i] = Math.sin((i / lookupSize) * TAU);
    }

    function fastSin(angle) {
        return lookup[(Math.trunc(angle * lookupScale) & lookupMask)];
    }

    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let radius = 0;
    let dpr = 1;

    function resize() {
        width = stage.clientWidth || 340;
        height = stage.clientHeight || 340;
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        centerX = width / 2;
        centerY = height / 2 + height * 0.04;
        radius = Math.min(width, height) * 0.4;
    }

    let grainX = new Float32Array(grainCount);
    let grainY = new Float32Array(grainCount);
    let grainVx = new Float32Array(grainCount);
    let grainVy = new Float32Array(grainCount);

    function seedGrains() {
        for (let i = 0; i < grainCount; i += 1) {
            grainX[i] = Math.random();
            grainY[i] = Math.random();
            grainVx[i] = 0;
            grainVy[i] = 0;
        }
    }
    seedGrains();

    const holdDuration = 5.6;
    const morphDuration = 1.25;
    let n;
    let m;
    let targetN;
    let targetM;
    let startN;
    let startM;
    let morphing = false;
    let phaseEnd = holdDuration;

    function pickModes() {
        const high = Math.max(3, maxModes);
        targetN = 2 + Math.floor(Math.random() * (high - 1));
        targetM = 2 + Math.floor(Math.random() * (high - 1));
        if (targetM === targetN) targetM = targetN === high ? targetN - 1 : targetN + 1;
    }

    pickModes();
    n = targetN;
    m = targetM;
    startN = targetN;
    startM = targetM;

    function stepPhase(now) {
        if (now <= phaseEnd) return;
        if (morphing) {
            morphing = false;
            phaseEnd = now + holdDuration;
            startN = targetN;
            startM = targetM;
        } else {
            morphing = true;
            phaseEnd = now + morphDuration;
            startN = targetN;
            startM = targetM;
            pickModes();
        }
    }

    function field(x, y, a, b) {
        return fastSin(a * PI * x) * fastSin(b * PI * y) - fastSin(b * PI * x) * fastSin(a * PI * y);
    }

    let yaw = 0.52;
    let pitch = 0.72;
    let yawVelocity = 0;
    let pitchVelocity = 0;
    let drag = null;

    const vertexCount = (grid + 1) * (grid + 1);
    const vertexX = new Float32Array(vertexCount);
    const vertexY = new Float32Array(vertexCount);
    const vertexZ = new Float32Array(vertexCount);
    const fieldOfView = 3.6;
    let yawCos = 1;
    let yawSin = 0;
    let pitchCos = 1;
    let pitchSin = 0;

    function project(x, y, z, out) {
        const rotatedX = x * yawCos + z * yawSin;
        const rotatedZ = -x * yawSin + z * yawCos;
        const rotatedY = y * pitchCos - rotatedZ * pitchSin;
        const depth = y * pitchSin + rotatedZ * pitchCos;
        const perspective = fieldOfView / (fieldOfView + depth * 1.5);
        out[0] = centerX + rotatedX * perspective * radius * 2;
        out[1] = centerY + rotatedY * perspective * radius * 2;
        out[2] = depth;
    }

    const projected = [0, 0, 0];
    const depthBins = 24;
    const binCapacity = 5200;
    const binX = Array.from({ length: depthBins }, () => new Float32Array(binCapacity));
    const binY = Array.from({ length: depthBins }, () => new Float32Array(binCapacity));
    const binCounts = new Int32Array(depthBins);
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listeners = [];

    function listen(target, name, handler, listenerOptions) {
        target.addEventListener(name, handler, listenerOptions);
        listeners.push(() => target.removeEventListener(name, handler, listenerOptions));
    }

    let startTime = performance.now();
    let elapsed = 0;
    let lastFrame = 0;
    let frameId = 0;
    let running = true;

    function scheduleFrame() {
        if (running && !frameId) frameId = requestAnimationFrame(frame);
    }

    function frame(timestamp) {
        frameId = 0;
        if (!running) return;

        const now = (timestamp - startTime) / 1000;
        const dt = Math.min(0.05, Math.max(0, now - lastFrame));
        lastFrame = now;
        elapsed = now;

        const reduceMotion = motionQuery.matches;
        if (!reduceMotion) {
            stepPhase(elapsed);
            if (morphing) {
                let progress = clamp(1 - (phaseEnd - elapsed) / morphDuration, 0, 1);
                progress = progress * progress * (3 - 2 * progress);
                n = startN + (targetN - startN) * progress;
                m = startM + (targetM - startM) * progress;
            } else {
                n = targetN;
                m = targetM;
            }
        }
        if (badge) badge.textContent = targetN + " . " + targetM;

        if (!drag) {
            yaw += yawVelocity + (reduceMotion ? 0 : 0.0021);
            pitch += pitchVelocity;
            yawVelocity *= 0.93;
            pitchVelocity *= 0.93;
            pitch = clamp(pitch, 0.12, 1.42);
        }

        const oscillator = reduceMotion ? 0.55 : fastSin(elapsed * 6.9);
        const displacement = 0.2 * amplitude * oscillator;
        const movementDt = reduceMotion ? 0 : dt;
        yawCos = Math.cos(yaw);
        yawSin = Math.sin(yaw);
        pitchCos = Math.cos(pitch);
        pitchSin = Math.sin(pitch);

        let vertex = 0;
        for (let row = 0; row <= grid; row += 1) {
            const v = row / grid;
            for (let column = 0; column <= grid; column += 1, vertex += 1) {
                const u = column / grid;
                project(u - 0.5, -field(u, v, n, m) * displacement, v - 0.5, projected);
                vertexX[vertex] = projected[0];
                vertexY[vertex] = projected[1];
                vertexZ[vertex] = projected[2];
            }
        }

        context.clearRect(0, 0, width, height);
        for (let band = 0; band < 2; band += 1) {
            context.beginPath();
            for (let row = 0; row <= grid; row += 1) {
                const base = row * (grid + 1);
                for (let column = 0; column < grid; column += 1) {
                    const first = base + column;
                    const second = first + 1;
                    const isFar = (vertexZ[first] + vertexZ[second]) * 0.5 > 0;
                    if ((band === 0) !== isFar) continue;
                    context.moveTo(vertexX[first], vertexY[first]);
                    context.lineTo(vertexX[second], vertexY[second]);
                }
            }
            for (let column = 0; column <= grid; column += 1) {
                for (let row = 0; row < grid; row += 1) {
                    const first = row * (grid + 1) + column;
                    const second = first + grid + 1;
                    const isFar = (vertexZ[first] + vertexZ[second]) * 0.5 > 0;
                    if ((band === 0) !== isFar) continue;
                    context.moveTo(vertexX[first], vertexY[first]);
                    context.lineTo(vertexX[second], vertexY[second]);
                }
            }
            context.strokeStyle = band === 0 ? "rgba(126, 158, 196, 0.13)" : "rgba(158, 194, 236, 0.3)";
            context.lineWidth = 1;
            context.stroke();
        }

        const pull = 0.01 * movementDt * 60;
        const jitter = 0.0013 * (reduceMotion ? 0 : 1);
        const damping = Math.pow(0.9, movementDt * 60);
        const sampleStep = 0.006;
        binCounts.fill(0);

        for (let i = 0; i < grainCount; i += 1) {
            let x = grainX[i];
            let y = grainY[i];
            const value = Math.abs(field(x, y, n, m));
            const gradientX = Math.abs(field(x + sampleStep, y, n, m)) - value;
            const gradientY = Math.abs(field(x, y + sampleStep, n, m)) - value;
            grainVx[i] -= gradientX * pull;
            grainVy[i] -= gradientY * pull;
            grainVx[i] += (Math.random() - 0.5) * jitter * (0.32 + value * 0.9);
            grainVy[i] += (Math.random() - 0.5) * jitter * (0.32 + value * 0.9);
            grainVx[i] *= damping;
            grainVy[i] *= damping;
            x += grainVx[i];
            y += grainVy[i];

            if (x < 0.03 || x > 0.97 || y < 0.03 || y > 0.97) {
                x = 0.12 + Math.random() * 0.76;
                y = 0.12 + Math.random() * 0.76;
                grainVx[i] = 0;
                grainVy[i] = 0;
            }
            grainX[i] = x;
            grainY[i] = y;

            project(x - 0.5, -field(x, y, n, m) * displacement - 0.012, y - 0.5, projected);
            const bin = clamp(Math.trunc(((projected[2] + 0.8) / 1.6) * (depthBins - 1)), 0, depthBins - 1);
            const count = binCounts[bin];
            if (count < binCapacity) {
                binX[bin][count] = projected[0];
                binY[bin][count] = projected[1];
                binCounts[bin] = count + 1;
            }
        }

        for (let bin = depthBins - 1; bin >= 0; bin -= 1) {
            const count = binCounts[bin];
            if (!count) continue;
            const depth = 1 - bin / (depthBins - 1);
            const size = grainSize * (0.7 + depth * 0.6);
            const alpha = 0.34 + depth * 0.6;
            const halfSize = size * 0.5;
            context.beginPath();
            for (let i = 0; i < count; i += 1) {
                context.rect(binX[bin][i] - halfSize, binY[bin][i] - halfSize, size, size);
            }
            context.fillStyle = "rgba(240, 228, 200, " + alpha.toFixed(3) + ")";
            context.fill();
        }

        if (!reduceMotion || drag) scheduleFrame();
    }

    function onPointerDown(event) {
        drag = { x: event.clientX, y: event.clientY };
        try {
            stage.setPointerCapture(event.pointerId);
        } catch (_) {
            // Pointer capture may be unavailable in embedded browsing contexts.
        }
        scheduleFrame();
    }

    function onPointerMove(event) {
        if (!drag) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.x = event.clientX;
        drag.y = event.clientY;
        yaw += dx * 0.008;
        pitch = clamp(pitch + dy * 0.006, 0.12, 1.42);
        yawVelocity = dx * 0.008;
        pitchVelocity = dy * 0.006;
        scheduleFrame();
    }

    function endDrag(event) {
        if (!drag) return;
        drag = null;
        try {
            stage.releasePointerCapture(event.pointerId);
        } catch (_) {
            // The browser may already have released the pointer.
        }
        scheduleFrame();
    }

    function onKeyDown(event) {
        if (event.key === "ArrowLeft") {
            yaw -= 0.2;
            event.preventDefault();
        } else if (event.key === "ArrowRight") {
            yaw += 0.2;
            event.preventDefault();
        } else if (event.key === "ArrowUp") {
            pitch = Math.max(0.12, pitch - 0.14);
            event.preventDefault();
        } else if (event.key === "ArrowDown") {
            pitch = Math.min(1.42, pitch + 0.14);
            event.preventDefault();
        } else {
            return;
        }
        scheduleFrame();
    }

    function onVisibilityChange() {
        if (document.hidden) {
            running = false;
            if (frameId) cancelAnimationFrame(frameId);
            frameId = 0;
        } else if (!running) {
            running = true;
            startTime = performance.now() - elapsed * 1000;
            lastFrame = elapsed;
            scheduleFrame();
        }
    }

    function destroy() {
        running = false;
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        for (const removeListener of listeners) removeListener();
        if (resizeObserver) resizeObserver.disconnect();
    }

    function onResize() {
        resize();
        scheduleFrame();
    }

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
    if (resizeObserver) resizeObserver.observe(stage);
    resize();
    listen(window, "resize", onResize);
    listen(stage, "pointerdown", onPointerDown);
    listen(stage, "pointermove", onPointerMove);
    listen(stage, "pointerup", endDrag);
    listen(stage, "pointercancel", endDrag);
    listen(stage, "keydown", onKeyDown);
    listen(document, "visibilitychange", onVisibilityChange);
    if (typeof motionQuery.addEventListener === "function") {
        listen(motionQuery, "change", scheduleFrame);
    }
    scheduleFrame();
    return destroy;
}

for (const root of document.querySelectorAll("[data-chladni-plate]")) {
    mountChladniPlate(root);
}
