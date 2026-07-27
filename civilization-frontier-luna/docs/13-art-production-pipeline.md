# Pipeline de producción artística 2D

## Objetivo

Traducir la dirección visual aprobada a assets ejecutables, consistentes y baratos de renderizar.

## Fases

### 1. Silueta

Cada estructura se dibuja en monocromo a 64 px. Debe reconocerse sin color ni etiqueta.

### 2. Paleta y materiales

Se aplican metal gris, luces cian y un acento funcional. No se usan texturas pequeñas que desaparezcan en zoom.

### 3. Variantes

Se generan 1× y 2×. Las facciones se diferencian por tint, halo, bandera o máscara, no por rehacer el edificio completo.

### 4. Atlas

Assets aprobados se empaquetan en atlas de hasta 2048×2048 con nombres estables.

### 5. Integración

Cada asset se prueba en:

- 50% zoom;
- 100% zoom;
- 200% zoom;
- fondo claro/oscuro;
- territorio propio/enemigo;
- daltonismo simulado.

### 6. Rendimiento

Se mide batching, memoria, tiempo de carga y número de sprites. Un asset visualmente mejor que rompe el presupuesto no entra en v0.01.

## Lista MVP

1. Hábitat.
2. Generador.
3. Nodo de oxígeno.
4. Mina.
5. Extractor de hielo.
6. Punto de control.
7. Puerto lunar.
8. Rover explorador.
9. Rover logístico.
10. Iconos de cuatro recursos.
11. Tres rutas.
12. Cinco estados territoriales.

## Arte de concepto vs arte de producción

Las imágenes de referencia definen composición, jerarquía, paleta y siluetas. No se recortan directamente para uso final. Los textos, resoluciones y detalles se rediseñan en componentes reales.

## Nomenclatura

`category_asset_variant_scale_state.ext`

Ejemplo: `structure_habitat_a_1x_idle.webp`.
