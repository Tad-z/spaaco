import { z } from 'zod';
import { PAGE_KEYS } from '../constants/enums.js';

export const pageKeyParams = z.object({ key: z.enum(PAGE_KEYS.values) });

export type PageKeyParams = z.infer<typeof pageKeyParams>;
