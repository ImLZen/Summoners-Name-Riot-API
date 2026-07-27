# Game Design Document — v0.01 lunar

## 1. Bucle principal

Elegir alunizaje → establecer hábitat → generar energía → asegurar oxígeno → explorar → extraer → conectar → expandir → comerciar o atacar → proteger la red → dominar o reconstruir.

## 2. Tiempo real

La simulación es continua. Las referencias visuales que muestran “turnos” son mockups y no definen la mecánica. La interfaz mostrará tiempo de partida, producción por segundo o minuto y acciones con duración.

## 3. Spawn

El jugador ve toda la región inicialmente abierta, pero no los recursos exactos fuera de su radio de reconocimiento. Cada punto válido muestra tres indicadores simples:

- seguridad relativa;
- acceso potencial a recursos;
- densidad estimada de rivales.

El jugador puede alunizar cerca de otros para buscar conflicto inmediato.

## 4. Recursos

### Energía

Alimenta edificios, sensores, extracción y defensa. Se produce en generadores y se distribuye por líneas. Una instalación sin energía pierde funciones antes de quedar inutilizada.

### Oxígeno

Sostiene población y actividad industrial. Se produce o procesa en nodos y circula por conductos. El corte de oxígeno genera una cuenta atrás visible y opciones de emergencia.

### Minerales

Material de construcción y reparación. Se obtiene en minas y se mueve mediante logística.

### Agua/Hielo

Recurso polar o de cráteres en sombra. Alimenta soporte vital y, en fases posteriores, combustible. En v0.01 funciona como insumo para oxígeno y expansión avanzada.

## 5. Territorio

Estados: neutral, propio, enemigo, disputado y no revelado. La simulación territorial puede conservar el modelo continuo de OpenFront; los hexágonos de los conceptos son una capa visual opcional o agrupación de sectores.

## 6. Estructuras

- **Hábitat:** capital local, población y almacenamiento básico.
- **Generador:** produce energía.
- **Nodo de oxígeno:** produce/distribuye oxígeno.
- **Mina:** produce minerales.
- **Extractor de hielo:** produce Agua/Hielo.
- **Punto de control:** amplía visión, administración y defensa.
- **Puerto lunar:** centro de rutas y logística de larga distancia.

Cada estructura debe tener una silueta inequívoca en tres escalas de zoom.

## 7. Redes

La red se modela como un grafo autoritativo:

- nodos = estructuras;
- aristas = conductos, líneas o rutas;
- capacidad = flujo máximo;
- estado = operativa, sobrecargada, dañada o cortada.

La UI distingue:

- energía: amarillo;
- oxígeno: azul;
- comercio/logística: cian discontinuo.

El color nunca será el único indicador.

## 8. Exploración

Rovers revelan terreno y recursos. La niebla mantiene visible la geografía general pero oculta instalaciones, cantidades y actividad reciente. La información antigua se muestra como estado desactualizado.

## 9. IA

Arquetipos:

- **Ingeniera:** protege redes y construye redundancia.
- **Prospectora:** explora y prioriza recursos raros.
- **Expansiva:** ocupa territorio neutral rápidamente.
- **Saboteadora:** busca nodos débiles y rutas críticas.

Los bots usan la misma niebla, recursos, capacidad de red y costes que humanos.

## 10. Conflicto

El MVP evita microgestión pesada. Las acciones ofensivas son:

- disputar territorio adyacente;
- dañar una conexión;
- capturar un punto de control;
- asediar un hábitat.

Una red cortada no destruye instantáneamente la colonia: activa reservas, degradación gradual y una ventana de respuesta.

## 11. Rutas comerciales

Una ruta conecta puertos o centros logísticos y genera ingresos/eficiencia mientras permanece operativa. Requiere continuidad y puede interrumpirse. En v0.01 el comercio es automático tras crear la conexión; no existe mercado complejo.

## 12. Evacuación y segunda vida

Tras una eliminación temprana:

1. se evacua parte de la población a un módulo orbital;
2. comienza un temporizador breve;
3. el jugador escoge un punto neutral permitido;
4. reaparece con un hábitat básico, recursos reducidos y protección temporal;
5. conserva su identidad y crónica;
6. solo puede hacerlo una vez.

## 13. Victoria

La v0.01 usa una condición principal: **control estratégico**, calculado por territorio sostenible, puntos de control y puertos operativos. La partida termina al alcanzar el umbral y mantenerlo durante un tiempo de confirmación.

## 14. Cronología objetivo

- 00:00–01:00 — carga y configuración.
- 01:00–02:30 — selección de spawn.
- 02:30–06:00 — primera base y exploración.
- 06:00–14:00 — expansión de IA y reducción del terreno neutral.
- 14:00–24:00 — redes, comercio y conflicto.
- 24:00+ — colonias avanzadas y control estratégico.
