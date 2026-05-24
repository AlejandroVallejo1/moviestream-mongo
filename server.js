require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Missing MONGODB_URI');
  process.exit(1);
}

const client = new MongoClient(uri);
let db;

async function connect() {
  if (!db) {
    await client.connect();
    db = client.db('moviestream');
  }
  return db;
}

const toId = (s) => {
  try { return new ObjectId(s); } catch { return null; }
};

// ---------- GENRES ----------
app.get('/api/genres', async (req, res) => {
  const d = await connect();
  const q = req.query.q;
  const filter = q ? { name: { $regex: q, $options: 'i' } } : {};
  const items = await d.collection('genres').find(filter).sort({ name: 1 }).toArray();
  res.json(items);
});

app.post('/api/genres', async (req, res) => {
  const d = await connect();
  const { name, short_name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const r = await d.collection('genres').insertOne({ name, short_name: short_name || '', description: description || '' });
  res.status(201).json({ _id: r.insertedId, name, short_name, description });
});

app.put('/api/genres/:id', async (req, res) => {
  const d = await connect();
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad id' });
  const { name, short_name, description } = req.body;
  await d.collection('genres').updateOne({ _id: id }, { $set: { name, short_name, description } });
  // keep denormalized genre name in movies in sync
  await d.collection('movies').updateMany(
    { 'genres._id': id },
    { $set: { 'genres.$[g].name': name } },
    { arrayFilters: [{ 'g._id': id }] }
  );
  res.json({ ok: true });
});

app.delete('/api/genres/:id', async (req, res) => {
  const d = await connect();
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad id' });
  const used = await d.collection('movies').countDocuments({ 'genres._id': id });
  if (used > 0 && req.query.force !== '1') {
    return res.status(409).json({ error: 'genre is referenced by movies', count: used, hint: 'pass ?force=1 to also remove from movies' });
  }
  if (req.query.force === '1') {
    await d.collection('movies').updateMany({ 'genres._id': id }, { $pull: { genres: { _id: id } } });
  }
  await d.collection('genres').deleteOne({ _id: id });
  res.json({ ok: true, removed_from_movies: used });
});

// ---------- ACTORS ----------
app.get('/api/actors', async (req, res) => {
  const d = await connect();
  const q = req.query.q;
  const filter = q ? { name: { $regex: q, $options: 'i' } } : {};
  const items = await d.collection('actors').find(filter).sort({ name: 1 }).toArray();
  res.json(items);
});

// ---------- MOVIES ----------
app.get('/api/movies', async (req, res) => {
  const d = await connect();
  const { q, genre } = req.query;
  const filter = {};
  if (q) filter.title = { $regex: q, $options: 'i' };
  if (genre) {
    const gid = toId(genre);
    if (gid) filter['genres._id'] = gid;
  }
  const items = await d.collection('movies').find(filter).sort({ year: -1 }).limit(200).toArray();
  res.json(items);
});

app.get('/api/movies/:id', async (req, res) => {
  const d = await connect();
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad id' });
  const m = await d.collection('movies').findOne({ _id: id });
  if (!m) return res.status(404).json({ error: 'not found' });
  res.json(m);
});

app.post('/api/movies', async (req, res) => {
  const d = await connect();
  const { title, year, runtime_min, list_price, genre_ids, cast } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const genres = [];
  if (Array.isArray(genre_ids)) {
    const ids = genre_ids.map(toId).filter(Boolean);
    const gs = await d.collection('genres').find({ _id: { $in: ids } }).toArray();
    for (const g of gs) genres.push({ _id: g._id, name: g.name });
  }
  const movieCast = [];
  if (Array.isArray(cast)) {
    for (const c of cast) {
      if (!c || !c.actor_id) continue;
      const aid = toId(c.actor_id);
      if (!aid) continue;
      const actor = await d.collection('actors').findOne({ _id: aid });
      if (actor) movieCast.push({ _id: actor._id, name: actor.name, character: c.character || '' });
    }
  }
  const doc = {
    title,
    year: Number(year) || null,
    runtime_min: Number(runtime_min) || null,
    list_price: Number(list_price) || 0,
    genres,
    cast: movieCast,
    avg_rating: null,
    ratings_count: 0,
    created_at: new Date(),
  };
  const r = await d.collection('movies').insertOne(doc);
  res.status(201).json({ ...doc, _id: r.insertedId });
});

app.put('/api/movies/:id', async (req, res) => {
  const d = await connect();
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad id' });
  const { title, year, runtime_min, list_price, genre_ids, cast } = req.body;
  const set = {};
  if (title !== undefined) set.title = title;
  if (year !== undefined) set.year = Number(year) || null;
  if (runtime_min !== undefined) set.runtime_min = Number(runtime_min) || null;
  if (list_price !== undefined) set.list_price = Number(list_price) || 0;
  if (Array.isArray(genre_ids)) {
    const ids = genre_ids.map(toId).filter(Boolean);
    const gs = await d.collection('genres').find({ _id: { $in: ids } }).toArray();
    set.genres = gs.map(g => ({ _id: g._id, name: g.name }));
  }
  if (Array.isArray(cast)) {
    const out = [];
    for (const c of cast) {
      if (!c || !c.actor_id) continue;
      const aid = toId(c.actor_id);
      if (!aid) continue;
      const actor = await d.collection('actors').findOne({ _id: aid });
      if (actor) out.push({ _id: actor._id, name: actor.name, character: c.character || '' });
    }
    set.cast = out;
  }
  await d.collection('movies').updateOne({ _id: id }, { $set: set });
  // if title changed, also update denormalized title in user interactions
  if (set.title) {
    await d.collection('users').updateMany(
      { 'interactions.movie_id': id },
      { $set: { 'interactions.$[i].movie_title': set.title } },
      { arrayFilters: [{ 'i.movie_id': id }] }
    );
  }
  res.json({ ok: true });
});

app.delete('/api/movies/:id', async (req, res) => {
  const d = await connect();
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad id' });
  await d.collection('users').updateMany({}, { $pull: { interactions: { movie_id: id } } });
  await d.collection('movies').deleteOne({ _id: id });
  res.json({ ok: true });
});

// ---------- USERS ----------
app.get('/api/users', async (req, res) => {
  const d = await connect();
  const q = req.query.q;
  const filter = q
    ? { $or: [
        { first_name: { $regex: q, $options: 'i' } },
        { last_name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ] }
    : {};
  const items = await d.collection('users').find(filter).limit(200).toArray();
  res.json(items);
});

app.get('/api/users/:id', async (req, res) => {
  const d = await connect();
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad id' });
  const u = await d.collection('users').findOne({ _id: id });
  if (!u) return res.status(404).json({ error: 'not found' });
  res.json(u);
});

app.post('/api/users', async (req, res) => {
  const d = await connect();
  const { first_name, last_name, email, country, segment_name, segment_short } = req.body;
  if (!first_name || !email) return res.status(400).json({ error: 'first_name and email required' });
  const doc = {
    first_name,
    last_name: last_name || '',
    email,
    country: country || '',
    segment: { name: segment_name || 'Regular', short_name: segment_short || 'REG' },
    interactions: [],
    created_at: new Date(),
  };
  const r = await d.collection('users').insertOne(doc);
  res.status(201).json({ ...doc, _id: r.insertedId });
});

app.put('/api/users/:id', async (req, res) => {
  const d = await connect();
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad id' });
  const { first_name, last_name, email, country, segment_name, segment_short } = req.body;
  const set = {};
  if (first_name !== undefined) set.first_name = first_name;
  if (last_name !== undefined) set.last_name = last_name;
  if (email !== undefined) set.email = email;
  if (country !== undefined) set.country = country;
  if (segment_name !== undefined) set['segment.name'] = segment_name;
  if (segment_short !== undefined) set['segment.short_name'] = segment_short;
  await d.collection('users').updateOne({ _id: id }, { $set: set });
  res.json({ ok: true });
});

app.delete('/api/users/:id', async (req, res) => {
  const d = await connect();
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad id' });
  await d.collection('users').deleteOne({ _id: id });
  res.json({ ok: true });
});

// user interactions (add rating/view/purchase)
app.post('/api/users/:id/interactions', async (req, res) => {
  const d = await connect();
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad id' });
  const { movie_id, type, rating, price } = req.body;
  const mid = toId(movie_id);
  if (!mid) return res.status(400).json({ error: 'bad movie_id' });
  const movie = await d.collection('movies').findOne({ _id: mid });
  if (!movie) return res.status(404).json({ error: 'movie not found' });
  const interaction = {
    movie_id: movie._id,
    movie_title: movie.title,
    type: type || 'view',
    rating: rating ? Number(rating) : null,
    price: price ? Number(price) : null,
    at: new Date(),
  };
  await d.collection('users').updateOne({ _id: id }, { $push: { interactions: interaction } });
  // recompute movie avg rating if rating present
  if (interaction.rating) {
    const agg = await d.collection('users').aggregate([
      { $unwind: '$interactions' },
      { $match: { 'interactions.movie_id': movie._id, 'interactions.rating': { $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$interactions.rating' }, count: { $sum: 1 } } },
    ]).toArray();
    if (agg[0]) {
      await d.collection('movies').updateOne(
        { _id: movie._id },
        { $set: { avg_rating: Math.round(agg[0].avg * 10) / 10, ratings_count: agg[0].count } }
      );
    }
  }
  res.status(201).json(interaction);
});

app.delete('/api/users/:id/interactions/:idx', async (req, res) => {
  const d = await connect();
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad id' });
  const idx = Number(req.params.idx);
  const user = await d.collection('users').findOne({ _id: id });
  if (!user || !user.interactions || !user.interactions[idx]) return res.status(404).json({ error: 'not found' });
  user.interactions.splice(idx, 1);
  await d.collection('users').updateOne({ _id: id }, { $set: { interactions: user.interactions } });
  res.json({ ok: true });
});

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`MovieStream Mongo running on http://localhost:${port}`));
}
