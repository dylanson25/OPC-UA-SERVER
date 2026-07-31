import { z } from 'zod';

export const validateUnique = <T>(
    items: T[],
    selector: (item: T) => string,
    field: string,
    ctx: z.RefinementCtx,
    basePath: (string | number)[] = [],
    getPath: (item: T, index: number) => (string | number)[] = (
        _item,
        index,
    ) => [...basePath, index],
) => {
    const seen = new Map<string, (string | number)[]>();

    items.forEach((item, index) => {
        const value = selector(item);
        const itemPath = getPath(item, index);

        if (seen.has(value)) {
            ctx.addIssue({
                code: 'custom',
                path: [...itemPath, field],
                message: `Duplicate ${field}: '${value}'.`,
            });
        }

        seen.set(value, itemPath);
    });
};