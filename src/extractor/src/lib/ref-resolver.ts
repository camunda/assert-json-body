import { OpenAPIV3 } from 'openapi-types';
import { SchemaOrRef } from './schema-flatten.js';

export function resolveRef(ref: string, components: Record<string, SchemaOrRef>, doc?: OpenAPIV3.Document): SchemaOrRef | undefined {
  if (doc && ref.startsWith('#/')) {
     const path = ref.substring(2).split('/');
     let current: any = doc;
     for (let i = 0; i < path.length; i++) {
        const seg = path[i];
        if (current === undefined || current === null) {
            break;
        }
        const decoded = decodeURIComponent(seg.replace(/~1/g, '/').replace(/~0/g, '~'));
        const next = current[decoded];
        current = next;
     }
     if (current) return current as SchemaOrRef;
  }
  // Fallback to naive lookup (legacy/test support)
  const name = ref.split('/').pop()!;
  return components[name];
}
