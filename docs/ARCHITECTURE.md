# Arquitectura del proyecto — NEROXA Master

## Objetivo

Este proyecto es exclusivamente el panel interno **NEROXA Master**. Es una copia separada del proyecto Pizza Perfect Plate, depurada de todo el código del MVP de pizzería. La interfaz/arquitectura Master existente se mantiene sin cambios funcionales.

## Estado actual

- **Framework/runtime:** React 19 + TanStack Start/Router + Vite.
- **Backend:** Supabase (Auth, Postgres y RPCs). La conexión con la base de datos original de Neroxa se tratará después de la limpieza; en esta fase no se toca el banco.
- **Shell:** `src/features/master/shell/MasterShell.tsx` (navegación lateral y layout del panel).
- **Módulos Master:** `src/features/master/{clients,commercial,subscriptions,finance}` con `types.ts` + `services.ts` por dominio.
- **Rutas:** `src/routes/master.tsx`, `master-clientes.tsx`, `master-comercial.tsx`, `master-assinaturas.tsx`, `master-financeiro.tsx`; `/` redirige a `/master`.
- **Autorización:** RPC `is_neroxa_staff` (llamado desde `src/features/master/clients/services.ts`), comprobado en cada módulo antes de cargar datos. La lógica vive en el banco; no se altera.
- **UI compartida:** solo `src/components/ui/button.tsx`, `card.tsx` y `src/lib/utils.ts`.
- **Superficie externa del Master:** exclusivamente `@/components/ui/{button,card}`, `@/integrations/supabase/*` y el shell de la app.

## Estructura

```
src/
├── features/
│   └── master/
│       ├── shell/MasterShell.tsx
│       ├── clients/      # types + services (incluye isNeroxaStaff)
│       ├── commercial/   # types + services
│       ├── subscriptions/# types + services
│       └── finance/      # types + services
├── components/
│   ├── ui/               # primitivas (button, card)
├── lib/
│   ├── error-capture.ts, error-page.ts, lovable-error-reporting.ts, utils.ts
├── integrations/
│   └── supabase/         # frontera de infraestructura (auto-gen, no editar)
└── routes/               # composición/roteamento
```

## Dependencias críticas

1. `src/integrations/supabase/client.ts` — frontera única con Supabase; alteración puede romper autenticación/preview.
2. `src/features/master/clients/services.ts` — contiene `isNeroxaStaff()` y todas las llamadas RPC de clientes.
3. `src/features/master/shell/MasterShell.tsx` — navegación y layout de todo el panel.
4. `supabase/config.toml` — auto-gen, no cambiar ajustes de proyecto.

## Reglas

- No reintroducir código del MVP Pizza Perfect Plate (storefront, carrito, checkout, panel de pizzería).
- No crear, apagar ni migrar tablas desde este proyecto; la conexión con la base de datos original se gestionará aparte.
- No mover lógica de autorización al frontend; se preserva el RPC `is_neroxa_staff` tal cual.
- Cada módulo nuevo del Master debe seguir el patrón `features/master/<dominio>/{types,services}.ts` + ruta propia.
