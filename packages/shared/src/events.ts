import { z } from 'zod';

export const ClientEventSchemas = {
  'heartbeat': z.object({}),
  'global:send': z.object({
    body: z.string().min(1).max(500)
  })
};

export type ClientEvents = {
  [K in keyof typeof ClientEventSchemas]: z.infer<typeof ClientEventSchemas[K]>
};

export interface GlobalMessagePayload {
  id: string;
  body: string;
  alias: string;
  createdAt: string;
  flags?: string[];
}

export interface ServerEvents {
  'online-count': (count: number) => void;
  'error': (err: { message: string, code: string }) => void;
  'global:receive': (msg: GlobalMessagePayload) => void;
  'global:delete': (data: { id: string }) => void;
}
