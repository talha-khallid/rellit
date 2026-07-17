// Shared helpers for inline-image (custom component) styling & behavior.
//
// Each image has two independent "inactive" behaviors:
//   beforeBehavior — how it looks BEFORE its line has played (line is in the future)
//   afterBehavior  — how it looks AFTER its line has played (line is in the past)
// Each is one of: 'visible' | 'dim' | 'collapse' | 'hidden'.
//
// Older projects only stored a single `inactiveBehavior` ('hidden'|'collapse'|
// 'dimmed'); getBehaviors() maps that onto the before/after pair so existing
// videos keep working.

export const BEHAVIOR_OPTIONS = [
    { value: 'visible', label: 'Keep visible' },
    { value: 'dim', label: 'Dim' },
    { value: 'collapse', label: 'Collapse' },
    { value: 'hidden', label: 'Hide' }
];

const LEGACY_MAP = {
    collapse: 'collapse',
    dimmed: 'dim',
    hidden: 'hidden'
};

export const getBehaviors = (comp) => {
    const legacy = LEGACY_MAP[comp?.inactiveBehavior] || 'hidden';
    return {
        before: comp?.beforeBehavior || legacy,
        after: comp?.afterBehavior || legacy
    };
};

// Default style/behavior for a freshly created image. Collapse on both sides is
// the requested default (image takes no space until its line plays, then
// disappears again afterwards).
export const newComponentDefaults = () => ({
    beforeBehavior: 'collapse',
    afterBehavior: 'collapse',
    borderRadius: 0,
    rotation: 0,
    offsetX: 0,
    offsetY: 0
});
