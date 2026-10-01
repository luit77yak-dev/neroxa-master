# Conversión del proyecto en NEROXA Master independiente

El código ya está copiado y la base de datos (vacía, con el esquema del MVP) se conectará después. Esta fase es solo limpieza estructural: eliminar todo el código del MVP Pizza Perfect Plate y dejar el proyecto 100% Neroxa Master, sin cambiar reglas de negocio ni tocar la base de datos (incluida la lógica de autorización `is_neroxa_staff`, que se queda tal cual).

## Resultado final

- Un proyecto exclusivo de NEROXA Master: `/` redirige a `/master` (única zona del sitio).
- Módulos intactos: Visión general, Clientes, Comercial, Assinaturas y Financeiro, con su shell, tipos, services y componentes.
- Cero código del MVP: tienda pública, carrito, checkout, configurador, seguimiento de pedido, panel de la pizzería y rutas asociadas.
- Sin dependencias huérfanas en `package.json`.

## Pasos

1. **Roadmap y documentación**
   - Reescribir `roadmap.md` con el roadmap de NEROXA Master (registro de esta limpieza como primer hito).
   - Reescribir `README.md` como proyecto NEROXA Master (descripción, módulos, stack).
   - Reescribir `docs/ARCHITECTURE.md` para reflejar solo el Master (la estructura con features/storefront ya no aplica). Conservar `docs/neroxa-master-architecture.md` tal cual.
   - Añadir regla en `AGENTS.md`: este proyecto es exclusivamente NEROXA Master; no reintroducir código del MVP.

2. **Rutas**
   - `src/routes/index.tsx` → redirect permanente a `/master` con metadatos de NEROXA Master.
   - Eliminar `src/routes/painel.tsx` y `src/routes/loja/$slug.tsx`.
   - `__root.tsx`: título, description, og:* y theme-color pasan de "Pizza Perfect Plate" a NEROXA Master; quitar la fuente Playfair Display (del MVP) y dejar Inter.

3. **Código MVP a eliminar** (verificado: nada del Master los importa)
   - `src/components/storefront/` (12 archivos), `src/features/storefront/`, `src/features/cart/`, `src/features/admin/`, `src/components/panel/`, `src/carrinho/` (compatibilidad huérfana).
   - `src/lib/domain/` completo (solo lo usaba el MVP).
   - `src/hooks/use-mobile.tsx` y `src/integrations/supabase/cron-auth.ts` (huérfanos, sin referencias).

4. **UI primitives** — el Master solo usa `button` y `card`:
   - Conservar `src/components/ui/button.tsx`, `card.tsx` y `src/lib/utils.ts`.
   - Eliminar el resto de `src/components/ui/*` (badge, dialog, skeleton, textarea, image-accordion, sidebar, form, chart… todos sin uso tras la limpieza).

5. **Dependencias huérfanas** (`bun remove`): recharts, embla-carousel-react, react-day-picker, cmdk, vaul, input-otp, sonner, react-resizable-panels, react-hook-form, @hookform/resolvers, zod, date-fns, y todos los `@radix-ui/*` salvo `react-slot`.

6. **CSS** — `src/styles.css`: mantener tokens y estilos base; recortar solo los bloques claramente del MVP (animaciones `storefront-*` y la sección `ppp-reference-storefront`), que están encapsulados y no afectan al Master.

7. **Validación**
   - Build y lint limpios; `/` redirige a `/master`; las 5 páginas Master cargan sin errores en consola; el gate `isNeroxaStaff()` funciona igual que antes (estado "sin autorización" visible sin sesión staff).

## Lo que NO se hace

- Ninguna migración ni cambio en la base de datos (el esquema del MVP copiado queda intacto en el proyecto; su conexión se tratará después).
- Ningún cambio en la lógica, textos ni diseño del Master.
