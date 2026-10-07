import { z } from 'zod';

export const ClientEventSchemas = {
  'heartbeat': z.object({}),
  // For later: chat events can be added here
};

export type ClientEvents = {
  [K in keyof typeof ClientEventSchemas]: z.infer<typeof ClientEventSchemas[K]>
};

export interface ServerEvents {
  'online-count': (count: number) => void;
  'error': (err: { message: string, code: string }) => void;
}
