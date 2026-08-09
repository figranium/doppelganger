import type { CaptchaCategory, DetectionResult } from './types';

/**
 * Serializable payload shape produced inside the page context (browser side).
 * Kept structurally identical to DetectionResult minus the timestamp, which
 * is stamped on the Node side to avoid clock drift between contexts.
 */
type RawDetection = Omit<DetectionResult, 'detectedAt'>;

/**
 * Minimal Playwright-shaped Page interface so this module has no hard
 * dependency on the `playwright` package — only the two calls it needs.
 */
export interface DetectionCapablePage {
    evaluate<T>(pageFunction: () => T): Promise<T>;
    url(): string;
}

/**
 * Runs inside the browser page context (via page.evaluate). Inspects the
 * live DOM — including iframes reachable from the same origin and shadow
 * roots — and classifies interactive elements it finds. This function body
 * is serialized and executed in-browser; it must not reference outer scope.
 */
export function collectDetectionsInPage(): RawDetection[] {
    const results: RawDetection[] = [];

    const classify = (el: Element): CaptchaCategory | null => {
        const tag = el.tagName.toLowerCase();
        const attrs = (el.getAttribute('class') || '') + ' ' + (el.getAttribute('id') || '');
        const lower = attrs.toLowerCase();

        if (tag === 'iframe') {
            const src = (el.getAttribute('src') || '').toLowerCase();
            if (/recaptcha|hcaptcha|turnstile|funcaptcha|arkose/.test(src)) return 'widget-frame';
        }
        if (/slider|drag-?handle|puzzle/.test(lower)) return 'slider';
        if (tag === 'audio' || /audio-?(challenge|captcha|prompt)/.test(lower)) return 'audio';
        if (/grid|tile-?matrix|image-?grid/.test(lower)) return 'grid';
        if (/rotate|orientation|3d-?rotate/.test(lower)) return 'rotational';
        if (/distorted|obfuscated-?text|char-?captcha/.test(lower)) return 'distorted-text';
        if (tag === 'form') return 'form';
        return null;
    };

    const boundsOf = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };

    const signatureOf = (el: Element): string => {
        const id = el.id ? `#${el.id}` : '';
        const cls = el.getAttribute('class') ? `.${el.getAttribute('class')!.trim().split(/\s+/).join('.')}` : '';
        return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 200);
    };

    const selectorOf = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        const cls = el.getAttribute('class');
        if (cls) return `${el.tagName.toLowerCase()}.${cls.trim().split(/\s+/).join('.')}`;
        return el.tagName.toLowerCase();
    };

    const visit = (root: Document | ShadowRoot, frameUrl: string | null, inShadowDom: boolean) => {
        const all = root.querySelectorAll('*');
        all.forEach((el) => {
            const category = classify(el);
            if (category) {
                results.push({
                    category,
                    selector: selectorOf(el),
                    frameUrl,
                    inShadowDom,
                    coordinates: boundsOf(el),
                    signature: signatureOf(el),
                });
            }
            const shadow = (el as Element).shadowRoot;
            if (shadow) {
                visit(shadow, frameUrl, true);
            }
        });
    };

    visit(document, null, false);

    // Best-effort same-origin iframe traversal; cross-origin frames throw and are skipped,
    // which is expected — those are exactly the widget-frame cases already caught above.
    document.querySelectorAll('iframe').forEach((frame) => {
        try {
            const doc = (frame as HTMLIFrameElement).contentDocument;
            if (doc) {
                visit(doc, (frame as HTMLIFrameElement).src || null, false);
            }
        } catch {
            // Cross-origin — inaccessible by design, already classified as widget-frame if matched.
        }
    });

    return results;
}

export type DetectionListener = (result: DetectionResult) => void;

/**
 * Observer that inspects a page's DOM/frame/shadow-DOM state and emits
 * classified DetectionResult events. Contains no solving logic — it only
 * detects, classifies, and reports coordinates.
 */
export class CaptchaDetectionObserver {
    private readonly page: DetectionCapablePage;
    private readonly listeners: Set<DetectionListener> = new Set();

    constructor(page: DetectionCapablePage) {
        this.page = page;
    }

    onDetection(listener: DetectionListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Runs a single detection pass over the current page state and emits results. */
    async scan(): Promise<DetectionResult[]> {
        const raw = await this.page.evaluate(collectDetectionsInPage);
        const detectedAt = Date.now();
        const results: DetectionResult[] = raw.map((r) => ({ ...r, detectedAt }));
        for (const result of results) {
            for (const listener of this.listeners) {
                listener(result);
            }
        }
        return results;
    }
}
