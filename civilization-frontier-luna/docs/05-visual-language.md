# Lenguaje visual aprobado — especificación producible

## Estado

**Aprobado por producto para v0.01.** Las referencias están en `docs/visual-references/`.

## Intención

Ciencia ficción lunar limpia, oscura y accesible. La superficie es silenciosa; la infraestructura y las decisiones brillan. Debe parecer atractiva sin exigir render 3D ni arte AAA.

## Implementación real

- Juego web 2D.
- Mapa lunar base en escala de grises.
- Sprites 2D prerenderizados o ilustrados.
- Territorios y niebla mediante overlays.
- Rutas mediante líneas y marcadores animados.
- UI modular con HTML/CSS/Lit.
- Sin iluminación dinámica compleja.
- Sin cámara 3D ni rotación libre.

## Jerarquía

1. Selección, amenaza y acción actual.
2. Propiedad, fronteras y territorio disputado.
3. Energía, oxígeno y rutas.
4. Hábitats, puertos y puntos de control.
5. Recursos y estructuras secundarias.
6. Decoración.

## Paleta funcional

- Fondo/UI: negros azulados y grises fríos.
- Jugador/selección: azul-cian.
- Energía: amarillo.
- Oxígeno: azul claro.
- Minerales: violeta.
- Agua/Hielo: cian hielo.
- Peligro: rojo/naranja.
- Aliado: verde o cian con símbolo específico.

No se comunica ningún estado únicamente con color.

## Familias de assets

### Estructuras

Hábitat, mina, extractor de hielo, nodo de oxígeno, generador, puerto lunar y punto de control. Siluetas distintas, núcleo brillante mínimo, tres niveles de escala.

### Unidades

Rover explorador y rover logístico. Movimiento simple sobre superficie, sin físicas avanzadas. Los drones son candidatos posteriores, no obligatorios.

### Redes

- Comercial: cian discontinuo con nodos circulares.
- Oxígeno: azul continuo con pulsos.
- Energía: amarillo con nodos cuadrados.

### Territorio

Neutral, jugador, enemigo, disputado y niebla. Los hexágonos son una propuesta de lectura, no una obligación del motor.

## Reglas de densidad

- Una estructura debe reconocerse a 50% de zoom.
- Al alejarse, las estructuras se agregan en iconos/contadores.
- Las rutas secundarias reducen brillo y grosor al alejarse.
- El fondo nunca compite con fronteras ni conexiones.
- El panel contextual muestra detalles que no deben vivir permanentemente en el mapa.

## Movimiento

- Pulso de oxígeno: suave y lento.
- Energía: destellos cortos en nodos.
- Comercio: puntos que avanzan por la ruta.
- Construcción: 0,5–1,2 segundos de ensamblaje/fade.
- Daño: parpadeo y alerta, sin explosiones largas.
- Modo de movimiento reducido disponible.

## Elementos mostrados pero no aprobados funcionalmente

Las imágenes pueden mostrar textos o elementos de composición que no pertenecen a v0.01:

- turnos;
- nivel de comandante y XP;
- tienda o progreso persistente;
- múltiples condiciones de victoria;
- drones complejos;
- árbol de investigación completo;
- iconos decorativos sin función definida.

Estos elementos no se implementan salvo tarea y ADR específicas.

## Referencias

Consulta `docs/visual-references/README.md` para la función exacta de cada imagen.
