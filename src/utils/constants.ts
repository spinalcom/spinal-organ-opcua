
export const NAMES_TO_IGNORE = [
    "server",
    "locations",
    "aliases",
    // "deviceset",
    "networkset",
    "devicetopology",
] as readonly string[];



export const noSessionError = new Error("No session available, please connect first");
export const noSubscriptionError = new Error("No subscription available, please connect first");