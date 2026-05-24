# Reflexión

## 1. Volviendo a empezar

Lo que cambiaría es haber embebido las interacciones del usuario dentro del documento del usuario. Al principio se sentía natural porque las compras y las vistas le pertenecen al usuario, pero el momento en que dudé fue cuando escribí el endpoint de borrar película y me tocó recorrer todos los usuarios para limpiar las interacciones que apuntaban a esa película. En la base relacional esto lo hacía la llave foránea sola. Lo que me faltaba al inicio era pensar en cómo se vería el modelo a largo plazo, porque con datos chicos todo se ve bien, pero un usuario real puede tener cientos de interacciones y embeberlas todas en un documento se vuelve pesado. Si lo hiciera de nuevo las pondría en su propia colección.

## 2. La conversación con mi modelo

La parte más incómoda fue calcular el rating promedio de las películas. Como las interacciones viven dentro del usuario, para sacar el promedio tuve que hacer un pipeline largo con unwind sobre el array de interacciones, filtrar por la película y agrupar. En una base relacional eso era un join y un avg directo. Terminé precomputando el promedio dentro del documento de la película para no pagar ese costo en cada lectura, pero esa es una decisión que tuve que tomar yo y mantener a mano. Parte de ese dolor sí venía del modelo, no de NoSQL como tal, porque si hubiera puesto las interacciones en su propia colección el pipeline hubiera sido mucho más natural.

## 3. La pregunta honesta

Para MovieStream específicamente el modelo relacional ganó. El dominio tiene estructura estable, las películas siempre tienen título año géneros y reparto, los usuarios siempre tienen historial. No hay datos con esquema variable que justifiquen lo flexible de un documento. Las preguntas más interesantes sobre este dominio son agregaciones cruzadas como ventas por género por país o clientes en riesgo, y todas esas se escriben más limpias en SQL que en pipelines de Mongo. Lo único donde Mongo ganó fue traer la página completa de un usuario en una sola lectura, pero esa única ventaja no compensa todas las consultas analíticas que se vuelven más torpes. Si el dominio fuera otro mi respuesta sería distinta, pero aquí no lo es.
