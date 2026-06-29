const randomBetween = (min, max) => min + Math.random() * (max - min);

async function moveMouseHumanlike(page, targetX, targetY, options = {}) {
    const { cursorGlide, startX: providedStartX, startY: providedStartY } = options;

    // If cursorGlide is true and we have a starting point, use it.
    // Otherwise, simulate a quick jump near the target for standard execution speed.
    const startX = (cursorGlide && providedStartX !== undefined && providedStartX !== null) ? providedStartX : targetX + (Math.random() - 0.5) * 120;
    const startY = (cursorGlide && providedStartY !== undefined && providedStartY !== null) ? providedStartY : targetY + (Math.random() - 0.5) * 120;

    const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));

    // Sync the actual browser mouse position to the tracked start before
    // beginning the curve. Use multiple micro-steps to avoid a visible spike.
    if (cursorGlide) {
        // If the sync distance is large, it's likely we fell out of sync.
        // Perform a human-like move to the "start" position instead of a jump.
        if (distance > 30) {
            const syncSteps = Math.min(15, Math.max(5, Math.floor(distance / 12)));
            await page.mouse.move(startX, startY, { steps: syncSteps });
        } else {
            await page.mouse.move(startX, startY, { steps: 5 });
        }
    }

    let steps = 8 + Math.floor(Math.random() * 6);
    if (cursorGlide) {
        // More steps = smaller per-step distance = lower peak speed
        steps = Math.max(25, Math.min(80, Math.floor(distance / 8))) + Math.floor(Math.random() * 8);
    }

    const ctrlX = (startX + targetX) / 2 + (Math.random() - 0.5) * Math.min(60, distance * 0.15);
    const ctrlY = (startY + targetY) / 2 + (Math.random() - 0.5) * Math.min(60, distance * 0.15);

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;

        // Easing function to slow down at start and end
        const easeT = cursorGlide ? (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2) : t;
        const inv = 1 - easeT;

        const curveX = inv * inv * startX + 2 * inv * easeT * ctrlX + easeT * easeT * targetX;
        const curveY = inv * inv * startY + 2 * inv * easeT * ctrlY + easeT * easeT * targetY;
        const jitterX = (Math.random() - 0.5) * (cursorGlide ? 0.6 : 2);
        const jitterY = (Math.random() - 0.5) * (cursorGlide ? 0.6 : 2);

        await page.mouse.move(curveX + jitterX, curveY + jitterY, { steps: 1 });

        if (cursorGlide) {
            await page.waitForTimeout(Math.random() * 18 + 14);
        }
    }
}

async function idleMouse(page, maxDuration = 5000) {
    const viewport = page.viewportSize() || { width: 1280, height: 720 };
    const startTime = Date.now();
    const drifts = 3 + Math.floor(Math.random() * 3);
    let x = (viewport.width / 2) + (Math.random() - 0.5) * 200;
    let y = (viewport.height / 2) + (Math.random() - 0.5) * 200;

    for (let i = 0; i < drifts; i++) {
        if (Date.now() - startTime >= maxDuration) break;

        const targetX = Math.random() * viewport.width;
        const targetY = Math.random() * viewport.height;
        const steps = 20 + Math.floor(Math.random() * 20);
        for (let s = 0; s < steps; s++) {
            if (Date.now() - startTime >= maxDuration) break;
            x += (targetX - x) / (steps - s);
            y += (targetY - y) / (steps - s);
            await page.mouse.move(x, y, { steps: 1 });
            // Small pause between steps to keep it backgroundish
            await page.waitForTimeout(Math.random() * 10 + 5);
        }
        if (Math.random() < 0.4 && (Date.now() - startTime < maxDuration)) {
            await page.waitForTimeout(Math.min(maxDuration - (Date.now() - startTime), 200 + Math.random() * 600));
        }
    }
    return { x, y };
}

async function overshootScroll(page, targetY) {
    const overshoot = (Math.random() > 0.5 ? 1 : -1) * (40 + Math.floor(Math.random() * 120));
    const smoothTarget = targetY + overshoot;

    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), smoothTarget);
    await page.waitForTimeout(250 + Math.random() * 400);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), targetY);
    if (Math.random() < 0.35) {
        await page.waitForTimeout(120 + Math.random() * 200);
        await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), (Math.random() - 0.5) * 60);
    }
}

const punctuationPause = /[.,!?;:]/;

async function humanType(page, selector, text, options = {}) {
    const { allowTypos = false, naturalTyping = false, fatigue = false } = options;
    if (selector) await page.focus(selector);
    const chars = text.split('');
    let burstCounter = 0;
    const burstLimit = naturalTyping ? Math.floor(randomBetween(6, 16)) : 999;
    const baseDelay = naturalTyping ? randomBetween(12, 55) : randomBetween(25, 80);
    const typeChar = async (char, delay) => {
        try {
            await page.keyboard.press(char, { delay });
        } catch (err) {
            await page.keyboard.insertText(char);
            if (delay) await page.waitForTimeout(delay);
        }
    };

    for (const char of chars) {
        if (naturalTyping && burstCounter >= burstLimit) {
            await page.waitForTimeout(randomBetween(60, 180));
            burstCounter = 0;
        }

        if (allowTypos && Math.random() < (naturalTyping ? 0.1 : 0.04)) {
            const keys = 'qwertyuiopasdfghjklzxcvbnm';
            const typo = keys[Math.floor(Math.random() * keys.length)];
            await page.keyboard.press(typo, { delay: 40 + Math.random() * 120 });
            if (Math.random() < 0.5) {
                await page.waitForTimeout(60 + Math.random() * 120);
            }
            await page.keyboard.press('Backspace', { delay: 40 + Math.random() * 120 });
            if (Math.random() < 0.3) {
                await page.keyboard.press(typo, { delay: 40 + Math.random() * 120 });
                await page.keyboard.press('Backspace', { delay: 40 + Math.random() * 120 });
            }
        }

        const extra = punctuationPause.test(char) ? randomBetween(60, 150) : randomBetween(0, 40);
        const fatiguePause = fatigue && Math.random() < 0.06 ? randomBetween(90, 200) : 0;
        await typeChar(char, baseDelay + extra + fatiguePause);
        burstCounter += 1;

        if (naturalTyping && char === ' ') {
            await page.waitForTimeout(randomBetween(20, 80));
        }
    }
}

module.exports = {
    moveMouseHumanlike,
    idleMouse,
    overshootScroll,
    humanType
};
