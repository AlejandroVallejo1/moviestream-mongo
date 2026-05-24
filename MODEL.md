# Modelo documental de MovieStream

Este documento explica cómo se traduce el modelo relacional original de MovieStream (Oracle) a un modelo documental en MongoDB, y por qué se tomó cada decisión.

## Punto de partida (resumen del modelo relacional)

En Oracle teníamos estas tablas principales:

- `MOVIE` (catálogo de películas)
- `GENRE` (catálogo de géneros)
- `CUSTOMER` (clientes)
- `CUSTOMER_SEGMENT` (catálogo de segmentos demográficos)
- `CUSTSALES` (ventas: relaciona cliente, película y método de pago)
- `ACTIVITY` (interacciones del cliente con películas: vistas, etc.)

Relaciones:
- `CUSTOMER.SEGMENT_ID` → `CUSTOMER_SEGMENT` (N a 1)
- `CUSTSALES.CUST_ID` → `CUSTOMER` (N a 1)
- `CUSTSALES.MOVIE_ID` → `MOVIE` (N a 1)
- `CUSTSALES.GENRE_ID` → `GENRE` (denormalizado dentro de la venta)
- `ACTIVITY.CUST_ID` → `CUSTOMER` (N a 1)
- `MOVIE` a `GENRE` es N a N (una película puede tener varios géneros)

La actividad además pide modelar **actores** (no estaban en el esquema original, los agrego como entidad nueva para cumplir con el requisito de "al menos 10 actores").

## Modelo documental propuesto

Quedan **4 colecciones**:

1. `movies`
2. `genres`
3. `actors`
4. `users` (equivalente a CUSTOMER, con interacciones embebidas)

No hay colección para `CUSTSALES` ni `ACTIVITY` ni `CUSTOMER_SEGMENT`. Esa información vive embebida dentro de `users` (o en el documento de la película, cuando es información agregada).

---

## Colecciones en detalle

### `genres`

```json
{
  "_id": ObjectId("..."),
  "name": "Sci-Fi",
  "short_name": "SCI",
  "description": "Speculative future or science."
}
```

Es un catálogo plano, sin embeddings. Se referencia desde `movies`.

### `actors`

```json
{
  "_id": ObjectId("..."),
  "name": "Cate Blanchett",
  "birth_year": 1969,
  "country": "Australia"
}
```

Catálogo independiente. Se referencia desde `movies.cast`.

### `movies`

```json
{
  "_id": ObjectId("..."),
  "title": "The Last Signal",
  "year": 2024,
  "runtime_min": 118,
  "list_price": 4.99,
  "genres": [
    { "_id": ObjectId("..."), "name": "Sci-Fi" },
    { "_id": ObjectId("..."), "name": "Thriller" }
  ],
  "cast": [
    { "_id": ObjectId("..."), "name": "Cate Blanchett", "character": "Dr. Lena" },
    { "_id": ObjectId("..."), "name": "Idris Elba",    "character": "Captain Reyes" }
  ],
  "avg_rating": 4.2,
  "ratings_count": 7,
  "created_at": ISODate("2026-05-24T22:00:00Z")
}
```

Notas:
- `genres` es un array de **referencias parcialmente denormalizadas**: guardo el `_id` para mantener la relación y además el `name` para no tener que hacer un `$lookup` al pintar la tabla en la UI.
- `cast` sigue el mismo patrón: id del actor + nombre denormalizado + el personaje, que es un atributo propio de la relación película-actor.
- `avg_rating` y `ratings_count` son campos calculados que se actualizan cuando un usuario crea una interacción de tipo `rating`.

### `users`

```json
{
  "_id": ObjectId("..."),
  "first_name": "Alejandro",
  "last_name": "Vallejo",
  "email": "ale@example.com",
  "country": "Mexico",
  "segment": { "name": "Young People", "short_name": "YP" },
  "interactions": [
    {
      "movie_id": ObjectId("..."),
      "movie_title": "Velocity Zero",
      "type": "purchase",
      "rating": 4,
      "price": 5.49,
      "at": ISODate("2026-04-12T16:32:00Z")
    },
    {
      "movie_id": ObjectId("..."),
      "movie_title": "Quiet Roads",
      "type": "rating",
      "rating": 5,
      "price": null,
      "at": ISODate("2026-04-15T11:10:00Z")
    }
  ],
  "created_at": ISODate("2026-04-10T00:00:00Z")
}
```

Notas:
- `segment` es un objeto embebido directamente. No hay colección de segmentos. El catálogo era diminuto (5 segmentos en MovieStream) y no se consulta de manera independiente en esta app.
- `interactions` es un array embebido que **unifica** lo que en el modelo relacional estaba en `CUSTSALES` (compras) y `ACTIVITY` (vistas/interacciones). Cada elemento tiene un `type` que distingue qué fue.
- Cada interacción guarda `movie_id` (la referencia real) y `movie_title` (snapshot denormalizado para listar el historial sin un join). El `server.js` mantiene la denormalización al día cuando se renombra una película.

---

## Decisiones de modelado, una por una

### 1. CUSTOMER ↔ CUSTOMER_SEGMENT  →  embebido

**Decisión**: el segmento vive como objeto dentro del usuario.

**Por qué**: el catálogo es muy pequeño y cambia poco. Casi nunca consulto "todos los segmentos disponibles" como entidad. Embedderlo evita un `$lookup` cada vez que pinto un usuario.

**Costo**: si renombro el segmento "Young People", tengo que actualizar todos los usuarios. Como el catálogo es estable, este costo es bajo.

### 2. CUSTOMER ↔ CUSTSALES + ACTIVITY  →  embebido como `interactions[]`

**Decisión**: las interacciones (ventas + actividad) viven como array dentro del usuario.

**Por qué**: el patrón de acceso real es "muéstrame el historial del usuario X", y eso aquí se resuelve con `findOne({ _id })`. En SQL este historial requería dos joins (CUSTOMER, CUSTSALES, ACTIVITY). En el documento, todo viene en una sola lectura.

**Costo y riesgo**: el array crece sin cota natural. En una app real con millones de interacciones por usuario, esto rompe MongoDB (límite de 16 MB por documento). En el contexto de esta tarea con datos de prueba, no es problema. El patrón "outlier" o un esquema de bucketing aplicaría si esto escalara.

### 3. MOVIE ↔ GENRE (N a N)  →  referencia + denormalización en `movies.genres[]`

**Decisión**: dentro de `movies` guardo un array `genres` con `{_id, name}` de cada género.

**Por qué**: la dirección de consulta más común es "dame esta película con sus géneros" o "lista de películas filtradas por género". Ambas se resuelven sin `$lookup`: usando `'genres._id'` como filtro y `genres[].name` directo para mostrar.

No referencio en ambos lados (no guardo `movies[]` en el documento de género) porque sería un array sin cota desde el lado género, y casi nunca consulto "todas las películas de este género" partiendo del documento del género; mejor lo hago con un find en `movies`.

**Costo**: si renombro un género, tengo que actualizar el `name` denormalizado en todas las películas que lo referencian. El endpoint `PUT /api/genres/:id` hace esa sincronización con un solo `updateMany`.

### 4. MOVIE ↔ ACTOR (N a N)  →  referencia + denormalización en `movies.cast[]`

**Decisión**: similar a género, dentro de `movies` guardo `cast: [{_id, name, character}]`.

**Por qué**: cuando pinto la película siempre quiero ver el reparto, y cuando edito el reparto trabajo desde la película. El atributo `character` es propio de la relación, no del actor (un actor puede salir como "Dr. Lena" en una película y "Marisol" en otra), así que tiene que vivir en el array de la película.

**Costo**: no llevo de vuelta `movies[]` en el documento del actor. Si quisiera "todas las películas con Cate Blanchett" hago un `find({ 'cast._id': actorId })` que es eficiente con un índice sobre `cast._id`.

### 5. Calificaciones agregadas  →  campo calculado en `movies`

**Decisión**: `movies.avg_rating` y `movies.ratings_count` se mantienen actualizados cada vez que un usuario agrega una interacción de tipo `rating`.

**Por qué**: pintar la lista de películas con su rating promedio es algo que se hace en cada render del catálogo. Calcularlo en tiempo real con una agregación a través de `users.interactions` cada vez sería caro. Mantenerlo precomputado en la película convierte un escaneo en una lectura plana.

**Costo**: el escribir se vuelve más caro (cada `rating` dispara una agregación + un `updateOne`). Vale la pena porque las lecturas dominan en una app de catálogo.

---

## Consultas que se volvieron fáciles

- **Mostrar una película completa con géneros, cast y rating**: una sola lectura. No hay joins.
- **Historial completo de un usuario**: una sola lectura del documento del usuario.
- **Buscar películas por género o por título**: filtro directo sobre `movies`, sin tablas intermedias.
- **Pintar el rating promedio**: ya viene precomputado.

## Consultas que se volvieron más difíciles

- **"Top géneros por país"** (era una agregación clásica en SQL: triple join). En MongoDB toca usar `$unwind` sobre `users.interactions` y luego `$lookup` para conectar `movie_id` con `movies.genres`. Es factible pero el pipeline es más largo que el SQL equivalente. No lo implementé en la app porque el alcance de la tarea es CRUD, no analítica.

- **"Películas que se vendieron pero nunca se vieron"**: en SQL era `NOT EXISTS`. Aquí, como vista y compra son ambas interacciones del mismo array, la pregunta cambia de forma. Tendría que hacer un `$unwind` y un `$group` por `movie_id` con condiciones sobre `type`. Otra vez, viable, pero menos directo.

- **"Renombrar un género"**: en relacional era un UPDATE de una fila. Aquí toca actualizar el catálogo más sincronizar el array embebido en cada película que lo referencia. Es exactamente el trade off al elegir denormalización: lecturas baratas, escrituras de mantenimiento más caras.

- **"Borrar un género"**: tampoco es libre. La app primero cuenta cuántas películas lo referencian y, si las hay, pide confirmación. Si el usuario confirma con `?force=1`, el servidor lo borra del catálogo y además hace un `$pull` en todas las películas. Esto es lo que en SQL hacía la base por mí con `ON DELETE CASCADE` o me bloqueaba con un FK. Aquí lo decide la app, no el motor.

---

## Total

4 colecciones: `movies`, `genres`, `actors`, `users`. No hay colecciones puente; las relaciones se resuelven con arrays de referencias parcialmente denormalizados o con embeddings.
