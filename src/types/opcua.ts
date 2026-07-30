export interface AddressSpaceLike {
    rootFolder: {
        objects: object;
    };
}

export interface NamespaceLike {
    addObject(options: {
        browseName: string;
        organizedBy: object | string;
    }): {
        browseName: string;
    };

    addVariable(options: unknown): unknown;
}