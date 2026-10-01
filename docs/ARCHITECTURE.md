# Arquitectura del proyecto — NEROXA Master

## Objetivo

Este proyecto es exclusivamente el panel interno **NEROXA Master**. Es una copia separada del proyecto Pizza Perfect Plate, depurada de todo el código del MVP de pizzería. La interfaz/arquitectura Master existente se mantiene sin cambios funcionales.

## Estado actual

- **Framework/runtime:** React 19 + TanStack Start/Router + Vite.
- **Backend:** Supabase (Auth, Postgres y RPCs), conectado al proyecto de plataforma de Neroxa. Los módulos Master reutilizan las entidades de plataforma existentes y mantienen una capa de compatibilidad donde el frontend necesita una interfaz más rica.
- **Shell:** `src/features/master/shell/MasterShell.tsx` (navegación lateral y layout del panel).
- **Módulos Master:** `src/features/master/{clients,commercial,subscriptions,finance}` con `types.ts` + `services.ts` por dominio.
- **Rutas:** `src/routes/master.tsx`, `master-clientes.tsx`, `master-comercial.tsx`, `master-assinaturas.tsx`, `master-financeiro.tsx`; `/` redirige a `/master`.
- **Autorización:** RPC `neroxa_is_platform_member` y `neroxa_has_platform_role`, comprobados en cada módulo antes de cargar datos. La autorización efectiva permanece en RLS dentro del banco.
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
- Las evoluciones del esquema Master deben hacerse mediante migraciones versionadas en el proyecto Supabase de plataforma. No se debe crear una segunda base paralela para el Master.
- No mover lógica de autorización al frontend; se preservan las funciones de plataforma `neroxa_is_platform_member` y `neroxa_has_platform_role`.
- Cada módulo nuevo del Master debe seguir el patrón `features/master/<dominio>/{types,services}.ts` + ruta propia.
