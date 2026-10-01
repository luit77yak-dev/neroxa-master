# Roadmap — NEROXA Master

Este proyecto es exclusivamente el panel interno NEROXA Master (copia separada; el MVP Pizza Perfect Plate vive en su propio proyecto).

## Fase 0 — Separación del MVP (completada)
- [x] Escaneo de archivos, rutas e imports: inventario Master vs MVP
- [x] Eliminación del código MVP (storefront, carrito, checkout, configurador, panel de la pizzaría, rutas)
- [x] Eliminación de dependencias huérfanas
- [x] README / arquitectura / roadmap actualizados para NEROXA Master
- [x] Validación: build, lint y rutas Master sin errores

## Fase 1 — Conexión de datos
- [ ] Conectar la base de datos original de Neroxa (tablas neroxa_* + RPC is_neroxa_staff) según lo acordado
- [ ] Verificar gate de autorización de las páginas: Clientes, Comercial, Assinaturas, Financeiro

## Fase 2 — Nuevos módulos Master
- [ ] Produtos, Implantação, Domínios, Suporte, Configurações (secciones marcadas "Em breve" en el shell)
- [ ] Métricas reales en la Visión general (clientes, MRR, implantaciones)

## Fase 3 — Calidad
- [ ] Responsive y accesibilidad de los módulos Master
- [ ] Auditoría final (errores, hardcode, consistencia visual)
