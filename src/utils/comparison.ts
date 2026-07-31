export const hasSignificantChange = (
    oldVal: unknown,
    newVal: unknown,
    threshold = 0.01,
): boolean => {
    if (typeof oldVal !== 'number' || typeof newVal !== 'number') {
        return oldVal !== newVal;
    }

    if (Number.isNaN(oldVal) || Number.isNaN(newVal)) {
        return oldVal !== newVal;
    }

    return Math.abs(newVal - oldVal) > threshold;
};