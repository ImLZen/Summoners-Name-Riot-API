# v0.01 — Alfa vertical slice lunar

## Objetivo

Demostrar que una partida lunar en tiempo real es comprensible y divertida con bots y grupos privados pequeños antes de construir cuentas, pagos, matchmaking público o infraestructura compleja.

## Especificación de partida

- Duración objetivo inicial: **18–28 minutos**.
- Jugadores locales: 1 humano + 7 bots; benchmark hasta 15 bots.
- Multijugador privado posterior: 2–16 humanos.
- Mapa: una sección jugable de la cara visible lunar, inspirada en regiones reales y ajustada por equilibrio.
- Recursos: Energía, Oxígeno, Minerales y Agua/Hielo.
- Terreno: llanuras de mare, tierras altas, cráteres, sombras polares y corredores logísticos.
- Estructuras MVP: Hábitat, Generador, Nodo de oxígeno, Mina, Extractor de hielo, Punto de control y Puerto lunar.
- Unidades MVP: Rover explorador y rover logístico abstracto.
- Redes: energía, oxígeno y ruta comercial.
- Combate: presión territorial y sabotaje/ataque abstracto a nodos; sin unidades tácticas complejas.
- Respawn: una evacuación y nuevo alunizaje por jugador antes del corte final.

## Flujo obligatorio

1. Cargar partida y escoger configuración básica.
2. Ver el mapa disponible y elegir un punto válido de alunizaje.
3. Crear el primer hábitat en menos de 30 segundos.
4. Explorar y revelar recursos cercanos.
5. Construir energía y oxígeno suficientes para sostener la colonia.
6. Expandir a territorio neutral.
7. Observar a la IA expandirse bajo las mismas reglas.
8. Construir al menos una conexión entre dos instalaciones.
9. Establecer una ruta logística o comercial.
10. Encontrar otra facción y entender el conflicto.
11. Sufrir o provocar un corte de suministro comprensible.
12. Reaparecer una vez si la derrota ocurre antes del corte.
13. Completar una condición de victoria y ver resumen.

## Sistemas obligatorios

- Semilla determinista.
- Spawn seleccionable y validado por servidor.
- Niebla de guerra sin fuga de datos.
- Territorio neutral, propio, enemigo y disputado.
- Economía autoritativa de cuatro recursos.
- Producción y consumo de energía/oxígeno.
- Grafo de conexiones de suministro.
- Siete estructuras y dos unidades abstractas.
- Bots: expansión, producción, rutas, defensa y agresión básica.
- Conflicto sobre nodos e infraestructura.
- Una segunda vida.
- Telemetría local y benchmark.
- UI jugable con ratón y escalable a distintas resoluciones de escritorio.

## Exclusiones explícitas

- Modelado o cámara 3D en tiempo real.
- Combate táctico con docenas de tipos de unidad.
- Física orbital realista.
- Cara oculta completa de la Luna.
- Más de un mapa jugable.
- Cuentas, XP, niveles de comandante o inventario persistente.
- Tienda, pagos o cosméticos.
- Clanes, chat público o ranking.
- Árbol tecnológico complejo.
- Aplicación móvil nativa.
- Conversión obligatoria del motor a hexágonos reales.

## Criterios de aceptación

- 4 de 5 jugadores nuevos aterrizan y sostienen oxígeno sin explicación verbal.
- 4 de 5 identifican visualmente energía, oxígeno y rutas.
- Al menos 60% juega una segunda partida en la misma sesión.
- Un corte de red muestra causa, efecto y recuperación posibles.
- La IA no usa información oculta ni bonificaciones secretas en dificultad normal.
- 16 jugadores privados completan una partida sin divergencia.
- El cliente no puede alterar recursos, conexiones o territorio desde el navegador.
- La escena objetivo mantiene 60 FPS en el equipo de referencia; nunca menos de 30 FPS durante carga normal.
