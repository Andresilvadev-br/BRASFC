import type { IconName } from '../icons.ts';

export type CareerLink = { href: string; label: string; icon: IconName; badge?: number; alert?: boolean };
export type CareerGroup = { label: string; items: CareerLink[] };
