import { Rotator } from '../types.js';

export type { Rotator };

export function defineRotator<T extends Rotator>(r: T): T {
  return r;
}

export function isRotator(obj: any): obj is Rotator {
  return obj && typeof obj.name === 'string' && typeof obj.rotate === 'function';
}
