## 2025-05-22 - [Keyboard Accessibility for Action Items]
**Learning:** Interactive elements implemented as `div` or `span` without proper ARIA roles and keyboard listeners are invisible to screen readers and inaccessible to keyboard users. In a complex drag-and-drop interface like the Task Editor, custom interactive targets must also be explicitly excluded from drag operations (e.g., via `isInteractiveTarget` helpers) to prevent interaction conflicts.
**Action:** Always use `role="button"`, `tabIndex={0}`, and `onKeyDown` (Enter/Space) for custom interactive elements. Ensure they have descriptive `aria-label` and `title` attributes. Update drag-and-drop boundary checks to include these new interactive roles.

## 2025-05-22 - [Standardized Tab Accessibility and Focus States]
**Learning:** Button groups used as tabs (Settings, History filters, Results views) lack inherent semantic structure for screen readers and often have invisible focus indicators when the active state is high-contrast (e.g., solid white background).
**Action:** Standardize tab patterns with `role="tablist"`, `role="tab"`, and `aria-selected`. Use `focus-visible:ring-2 focus-visible:ring-blue-500` for active/high-contrast tab states to ensure keyboard focus is always visible against any background.

## 2025-05-22 - [Standardized Accessibility for Global Overlays]
**Learning:** Global app overlays (alerts, confirmations, and modals) often lack consistent ARIA roles and visible focus indicators, making critical system feedback inaccessible to keyboard and screen reader users. High-contrast elements (like white buttons) require specific ring colors (e.g., `blue-500`) to remain visible against light backgrounds.
**Action:** Implement `role="alert"` or `role="status"` on notification containers based on severity. Ensure all modal/alert buttons have `focus-visible:ring-2` with context-appropriate colors (`blue-500` for light, `white/50` for dark) and explicit `aria-label` for icon-only actions.

## 2026-03-20 - [Form Submission Feedback and State Validation]
**Learning:** Destructive or configuration-heavy actions (like proxy management) without clear submission states or input validation can lead to confusing race conditions or invalid data. Standardizing focus rings across all panel actions improves discoverability for keyboard users.
**Action:** Always implement `disabled` states and loading spinners for async submission buttons (like "Add Proxy"). Ensure focus rings use high-contrast variants (`blue-500`) for solid light backgrounds and standard variants (`white/50`) for dark/glass surfaces. Add `title` and `aria-label` to provide dual context for mouse and screen-reader users.

## 2026-03-21 - [Password Visibility Toggles and Form Accessibility]
**Learning:** Password fields without visibility toggles are prone to entry errors, especially in "Confirm Password" flows. Standardizing focus rings (`focus-visible:ring-2`) across all form inputs is critical for keyboard accessibility in dark glass-themed UIs. Toggles must have unique `aria-label` and `title` attributes (e.g., "Show password" vs "Show password confirmation") to ensure they are distinct for screen readers and satisfy strict testing requirements.
**Action:** Implement visibility toggles as absolute-positioned buttons within relative input containers. Use `pr-12` on the input to prevent text overlap. Always include `focus-visible:ring-white/50` for inputs on dark backgrounds.

## 2026-03-22 - [Interactive Headers as Buttons]
**Learning:** Structural headers that act as toggles (like "On Execution" in the Canvas) must be implemented as `<button>` elements rather than `<div>` with `onClick`. This ensures they are reachable via keyboard and properly identified by screen readers. Using `aria-expanded` provides necessary state feedback.
**Action:** Use `<button type="button">` for all interactive section headers. Include `aria-expanded`, `aria-label`, and `title`. Ensure high-contrast focus rings (`focus-visible:ring-white/50` for dark themes) are applied.

## 2026-03-23 - [Sticky Note Header Actions and Accessibility]
**Learning:** Manual hover state management for header actions is prone to accessibility gaps (invisible to keyboard users). Using Tailwind's `group-hover` combined with `group-focus-within` ensures actions are visible both on mouse hover and when a keyboard user tabs into the component. Standardizing icons with `MaterialIcon` and focus rings with `focus-visible:ring-white/50` maintains consistency across the glass-morphism design system.
**Action:** Use `group-focus-within` for all hover-triggered action bars. Standardize focus indicators on dark backgrounds with `white/50` rings.
