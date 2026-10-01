# NEROXA Master

Panel interno de la plataforma Neroxa. Este proyecto es exclusivamente **NEROXA Master**: administra clientes, comercial, assinaturas y financeiro de la plataforma. El producto de cliente (Pizza Perfect Plate) vive en su propio proyecto independiente.

## Módulos

- **Visión general** (`/master`) — centro operacional de la plataforma.
- **Clientes** (`/master-clientes`) — base comercial, contactos y transiciones de estado.
- **Comercial** (`/master-comercial`) — leads, propuestas y contratos.
- **Assinaturas** (`/master-assinaturas`) — planos contratados y recorrência.
- **Financeiro** (`/master-financeiro`) — cobranças, pagamentos e inadimplência.

Módulos futuros (Produtos, Implantação, Domínios, Suporte, Configurações) aparecen deshabilitados en el shell hasta su activación.

## Autorización

El acceso a los módulos se comprueba con el RPC `is_neroxa_staff` en Supabase (llamado desde `src/features/master/clients/services.ts`). La autorización real vive en el banco/RLS; el frontend solo refleja el estado.

## Stack

- React 19 + TanStack Start/Router + Vite (edge-ready)
- Tailwind CSS v4 + shadcn-style primitives (solo `button` y `card`)
- Supabase (Auth + Postgres RPCs)

## Documentación

- `docs/neroxa-master-architecture.md` — fundación arquitectónica del Master (consértese).
- `docs/ARCHITECTURE.md` — estructura actual del código.
- `roadmap.md` — fases pendientes.

## Desarrollo

```bash
bun install
bun run dev     # desarrollo (localhost:8080)
bun run build   # build de producción
bun run lint    # eslint
```
