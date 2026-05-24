require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('Missing MONGODB_URI'); process.exit(1); }

const GENRES = [
  { name: 'Action',    short_name: 'ACT', description: 'High intensity, fights, chases.' },
  { name: 'Drama',     short_name: 'DRA', description: 'Emotional, character driven.' },
  { name: 'Comedy',    short_name: 'COM', description: 'Light, humorous.' },
  { name: 'Sci-Fi',    short_name: 'SCI', description: 'Speculative future or science.' },
  { name: 'Horror',    short_name: 'HOR', description: 'Designed to scare or unsettle.' },
  { name: 'Romance',   short_name: 'ROM', description: 'Love stories, relationships.' },
  { name: 'Thriller',  short_name: 'THR', description: 'Tension, suspense.' },
];

const ACTORS = [
  { name: 'Tom Hanks',          birth_year: 1956, country: 'USA' },
  { name: 'Meryl Streep',       birth_year: 1949, country: 'USA' },
  { name: 'Leonardo DiCaprio',  birth_year: 1974, country: 'USA' },
  { name: 'Cate Blanchett',     birth_year: 1969, country: 'Australia' },
  { name: 'Idris Elba',         birth_year: 1972, country: 'UK' },
  { name: 'Penelope Cruz',      birth_year: 1974, country: 'Spain' },
  { name: 'Denzel Washington',  birth_year: 1954, country: 'USA' },
  { name: 'Viola Davis',        birth_year: 1965, country: 'USA' },
  { name: 'Gael Garcia Bernal', birth_year: 1978, country: 'Mexico' },
  { name: 'Salma Hayek',        birth_year: 1966, country: 'Mexico' },
  { name: 'Ryan Gosling',       birth_year: 1980, country: 'Canada' },
  { name: 'Emma Stone',         birth_year: 1988, country: 'USA' },
];

// movies use genre names and actor names; we resolve them to _ids during insert
const MOVIES = [
  { title: 'The Last Signal',         year: 2024, runtime_min: 118, list_price: 4.99, genres: ['Sci-Fi','Thriller'], cast: [['Cate Blanchett','Dr. Lena'],['Idris Elba','Captain Reyes']] },
  { title: 'Quiet Roads',             year: 2023, runtime_min: 102, list_price: 3.99, genres: ['Drama'],           cast: [['Tom Hanks','Marcus'],['Meryl Streep','Helen']] },
  { title: 'Mexico City Nights',      year: 2022, runtime_min: 95,  list_price: 3.49, genres: ['Drama','Romance'], cast: [['Gael Garcia Bernal','Tomas'],['Salma Hayek','Lucia']] },
  { title: 'Operation Greyfall',      year: 2024, runtime_min: 130, list_price: 5.99, genres: ['Action','Thriller'], cast: [['Idris Elba','Major Hayes'],['Denzel Washington','Colonel King']] },
  { title: 'Laugh Track',             year: 2023, runtime_min: 88,  list_price: 2.99, genres: ['Comedy'],          cast: [['Ryan Gosling','Daniel'],['Emma Stone','Mia']] },
  { title: 'The Hollow House',        year: 2021, runtime_min: 99,  list_price: 3.99, genres: ['Horror'],          cast: [['Viola Davis','Mother'],['Penelope Cruz','Carmen']] },
  { title: 'Light Across the Bay',    year: 2020, runtime_min: 110, list_price: 2.99, genres: ['Drama','Romance'], cast: [['Leonardo DiCaprio','Eli'],['Cate Blanchett','Ana']] },
  { title: 'Velocity Zero',           year: 2025, runtime_min: 124, list_price: 5.49, genres: ['Action','Sci-Fi'], cast: [['Tom Hanks','Director Voss'],['Idris Elba','Pilot Reyes']] },
  { title: 'Almost Forever',          year: 2022, runtime_min: 96,  list_price: 3.49, genres: ['Romance','Drama'], cast: [['Emma Stone','Jane'],['Ryan Gosling','Owen']] },
  { title: 'Howl in the Pines',       year: 2024, runtime_min: 104, list_price: 4.49, genres: ['Horror','Thriller'], cast: [['Penelope Cruz','Ines'],['Leonardo DiCaprio','Sheriff Wade']] },
  { title: 'Sunday Algorithm',        year: 2023, runtime_min: 115, list_price: 4.49, genres: ['Sci-Fi','Drama'], cast: [['Meryl Streep','Dr. Wren'],['Denzel Washington','Prof. Hall']] },
  { title: 'Comedians at War',        year: 2021, runtime_min: 91,  list_price: 2.99, genres: ['Comedy'],          cast: [['Gael Garcia Bernal','Mateo'],['Salma Hayek','Inez']] },
  { title: 'The Cartographer',        year: 2024, runtime_min: 132, list_price: 5.99, genres: ['Drama','Thriller'], cast: [['Leonardo DiCaprio','Henry'],['Viola Davis','Det. Greene']] },
  { title: 'Spring Always Wins',      year: 2022, runtime_min: 94,  list_price: 3.49, genres: ['Romance','Comedy'], cast: [['Ryan Gosling','Sam'],['Cate Blanchett','Lena']] },
  { title: 'Edge of the Algorithm',   year: 2025, runtime_min: 121, list_price: 5.49, genres: ['Sci-Fi','Thriller'], cast: [['Emma Stone','Iris'],['Tom Hanks','Walter']] },
  { title: 'Down by the River',       year: 2020, runtime_min: 100, list_price: 2.99, genres: ['Drama'],          cast: [['Meryl Streep','Anna'],['Viola Davis','June']] },
  { title: 'Last Train to Toluca',    year: 2023, runtime_min: 109, list_price: 3.99, genres: ['Action','Drama'], cast: [['Salma Hayek','Marisol'],['Gael Garcia Bernal','Ramiro']] },
  { title: 'Punchlines',              year: 2024, runtime_min: 85,  list_price: 2.99, genres: ['Comedy'],          cast: [['Emma Stone','Sara'],['Ryan Gosling','Beck']] },
  { title: 'Whispers Below',          year: 2021, runtime_min: 97,  list_price: 3.99, genres: ['Horror','Drama'], cast: [['Penelope Cruz','Eva'],['Cate Blanchett','Ruth']] },
  { title: 'Final Frequency',         year: 2025, runtime_min: 128, list_price: 5.99, genres: ['Sci-Fi','Action'], cast: [['Idris Elba','Marshall'],['Denzel Washington','General Cross']] },
  { title: 'Kitchen Tactics',         year: 2022, runtime_min: 90,  list_price: 2.99, genres: ['Comedy','Romance'], cast: [['Tom Hanks','Chef Marco'],['Meryl Streep','Chef Olive']] },
  { title: 'No Sound No Light',       year: 2023, runtime_min: 106, list_price: 4.49, genres: ['Horror','Thriller'], cast: [['Viola Davis','Dr. Hayes'],['Leonardo DiCaprio','Mark']] },
];

const SEGMENTS = [
  { name: 'Young People',   short_name: 'YP' },
  { name: 'Professionals',  short_name: 'PRO' },
  { name: 'Families',       short_name: 'FAM' },
  { name: 'Retired',        short_name: 'RET' },
  { name: 'Students',       short_name: 'STU' },
];

const USERS = [
  { first_name: 'Alejandro', last_name: 'Vallejo',  email: 'ale@example.com',     country: 'Mexico', seg: 0 },
  { first_name: 'Maria',     last_name: 'Lopez',    email: 'maria@example.com',   country: 'Mexico', seg: 1 },
  { first_name: 'John',      last_name: 'Smith',    email: 'john@example.com',    country: 'USA',    seg: 1 },
  { first_name: 'Yuki',      last_name: 'Tanaka',   email: 'yuki@example.com',    country: 'Japan',  seg: 0 },
  { first_name: 'Laila',     last_name: 'Hassan',   email: 'laila@example.com',   country: 'UAE',    seg: 2 },
  { first_name: 'Diego',     last_name: 'Ramirez',  email: 'diego@example.com',   country: 'Spain',  seg: 4 },
  { first_name: 'Emma',      last_name: 'Becker',   email: 'emma@example.com',    country: 'Germany',seg: 0 },
  { first_name: 'Liam',      last_name: 'O Brien',  email: 'liam@example.com',    country: 'Ireland',seg: 3 },
  { first_name: 'Sofia',     last_name: 'Petrova',  email: 'sofia@example.com',   country: 'Russia', seg: 1 },
  { first_name: 'Carlos',    last_name: 'Mendez',   email: 'carlos@example.com',  country: 'Mexico', seg: 2 },
  { first_name: 'Ana',       last_name: 'Garcia',   email: 'ana@example.com',     country: 'Spain',  seg: 4 },
  { first_name: 'Noah',      last_name: 'Williams', email: 'noah@example.com',    country: 'USA',    seg: 0 },
  { first_name: 'Chen',      last_name: 'Wei',      email: 'chen@example.com',    country: 'China',  seg: 1 },
  { first_name: 'Olivia',    last_name: 'Brown',    email: 'olivia@example.com',  country: 'UK',     seg: 3 },
  { first_name: 'Pablo',     last_name: 'Santos',   email: 'pablo@example.com',   country: 'Brazil', seg: 2 },
];

function pick(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(Math.random()*copy.length),1)[0]);
  return out;
}

(async () => {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('moviestream');

  console.log('Wiping collections...');
  await Promise.all([
    db.collection('movies').deleteMany({}),
    db.collection('genres').deleteMany({}),
    db.collection('actors').deleteMany({}),
    db.collection('users').deleteMany({}),
  ]);

  console.log('Inserting genres...');
  const gIns = await db.collection('genres').insertMany(GENRES.map(g => ({ ...g })));
  const genres = Object.values(gIns.insertedIds).map((id, i) => ({ ...GENRES[i], _id: id }));
  const genreByName = Object.fromEntries(genres.map(g => [g.name, g]));

  console.log('Inserting actors...');
  const aIns = await db.collection('actors').insertMany(ACTORS.map(a => ({ ...a })));
  const actors = Object.values(aIns.insertedIds).map((id, i) => ({ ...ACTORS[i], _id: id }));
  const actorByName = Object.fromEntries(actors.map(a => [a.name, a]));

  console.log('Inserting movies...');
  const movieDocs = MOVIES.map(m => ({
    title: m.title,
    year: m.year,
    runtime_min: m.runtime_min,
    list_price: m.list_price,
    genres: m.genres.map(n => ({ _id: genreByName[n]._id, name: genreByName[n].name })),
    cast: m.cast.map(([name, character]) => ({ _id: actorByName[name]._id, name: actorByName[name].name, character })),
    avg_rating: null,
    ratings_count: 0,
    created_at: new Date(),
  }));
  const mIns = await db.collection('movies').insertMany(movieDocs);
  const movies = Object.values(mIns.insertedIds).map((id, i) => ({ ...movieDocs[i], _id: id }));

  console.log('Inserting users + interactions...');
  const userDocs = USERS.map(u => {
    const watched = pick(movies, 3 + Math.floor(Math.random()*5));
    const interactions = watched.map((m, i) => {
      const type = i === 0 ? 'purchase' : (Math.random() < 0.6 ? 'rating' : 'view');
      return {
        movie_id: m._id,
        movie_title: m.title,
        type,
        rating: type === 'rating' || type === 'purchase' ? 3 + Math.floor(Math.random()*3) : null,
        price: type === 'purchase' ? m.list_price : null,
        at: new Date(Date.now() - Math.floor(Math.random()*1000*60*60*24*60)),
      };
    });
    return {
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      country: u.country,
      segment: { ...SEGMENTS[u.seg] },
      interactions,
      created_at: new Date(),
    };
  });
  await db.collection('users').insertMany(userDocs);

  // backfill movie avg_rating from interactions
  console.log('Computing avg ratings...');
  const agg = await db.collection('users').aggregate([
    { $unwind: '$interactions' },
    { $match: { 'interactions.rating': { $ne: null } } },
    { $group: { _id: '$interactions.movie_id', avg: { $avg: '$interactions.rating' }, count: { $sum: 1 } } },
  ]).toArray();
  for (const r of agg) {
    await db.collection('movies').updateOne(
      { _id: r._id },
      { $set: { avg_rating: Math.round(r.avg * 10) / 10, ratings_count: r.count } }
    );
  }

  console.log('Done.');
  console.log(`Genres: ${genres.length}, Actors: ${actors.length}, Movies: ${movies.length}, Users: ${USERS.length}`);
  await client.close();
})().catch(err => { console.error(err); process.exit(1); });
