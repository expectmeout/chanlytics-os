/**
 * Report a problem's door (decision 0066): the frame's host opens its sheet through it, and a card whose read failed
 * offers "Report this" only while a host is there to open it. A module's one value, never a window global: the host
 * sets it as it mounts and takes it back as it goes.
 */
export const reportDoor: { open: ((what: string | null) => void) | null } = { open: null };
